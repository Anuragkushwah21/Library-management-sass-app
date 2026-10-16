// lib/services/library.ts — tenant resolution, lazy backfill, QR signing (PLAN §2.1, §2.6)
import { createHmac, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { Library, type ILibrary } from '@/lib/models/Library';
import { User } from '@/lib/models/User';
import { Shift } from '@/lib/models/Shift';
import { Student } from '@/lib/models/Students';
import Seat from '@/lib/models/Seat';
import Book from '@/lib/models/Book';
import { Transaction } from '@/lib/models/Transaction';
import { Message } from '@/lib/models/Message';
import { ApiError } from '@/lib/api-response';
import { normalizePhone } from '@/lib/phone';
import { deriveMemberStatus } from '@/lib/services/student-status';

const JWT_SECRET = process.env.JWT_SECRET;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'library'
  );
}

function slugCandidate(name: string): string {
  return `${slugify(name)}-${randomBytes(2).toString('hex')}`;
}

/**
 * The library a librarian runs. Created on first use, which also backfills
 * libraryId (and normalized phones / status / shift) onto their existing data,
 * so the app works with or without running the migration script first.
 */
export async function ensureLibraryForUser(userId: string): Promise<ILibrary> {
  const user = await User.findById(userId).select('name email phone libraryId role');
  if (!user) throw new ApiError(401, 'User not found');
  if (user.role !== 'librarian') throw new ApiError(403, 'Only librarians have a library');

  if (user.libraryId) {
    const lib = await Library.findById(user.libraryId);
    if (lib) return lib;
  }

  // Owned already (user.libraryId lost)? Re-link instead of creating another
  let library = await Library.findOne({ ownerId: user._id });
  if (!library) {
    for (let attempt = 0; attempt < 5 && !library; attempt++) {
      try {
        library = await Library.findOneAndUpdate(
          { ownerId: user._id },
          {
            $setOnInsert: {
              name: `${user.name}'s Library`,
              slug: slugCandidate(user.name || 'library'),
              email: user.email,
              phone: user.phone,
              ownerId: user._id,
            },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
      } catch (err: any) {
        // Duplicate slug → retry with a new suffix; duplicate owner → someone else won
        if (err?.code !== 11000) throw err;
        library = await Library.findOne({ ownerId: user._id });
      }
    }
    if (!library) throw new ApiError(500, 'Could not create your library. Please retry.');
  }

  await User.updateOne({ _id: user._id }, { $set: { libraryId: library._id } });
  await backfillTenant(String(user._id), library);
  return library;
}

export async function ensureDefaultShift(libraryId: mongoose.Types.ObjectId | string) {
  const existing = await Shift.findOne({ libraryId }).sort({ sortOrder: 1 });
  if (existing) return existing;
  try {
    return await Shift.create({
      libraryId,
      name: 'Full Day',
      startTime: '06:00',
      endTime: '22:00',
      sortOrder: 0,
    });
  } catch (err: any) {
    if (err?.code === 11000) return Shift.findOne({ libraryId }).sort({ sortOrder: 1 });
    throw err;
  }
}

/** Idempotent: only touches docs that are missing the new fields. */
export async function backfillTenant(librarianId: string, library: ILibrary) {
  const libraryId = library._id;
  const set = { $set: { libraryId } };
  const missing = { librarianId, $or: [{ libraryId: null }, { libraryId: { $exists: false } }] };

  await Promise.all([
    Student.updateMany(missing, set),
    Seat.updateMany(missing, set),
    Book.updateMany(missing, set),
    Transaction.updateMany(missing, set),
    Message.updateMany(missing, set),
  ]);

  const defaultShift = await ensureDefaultShift(libraryId as mongoose.Types.ObjectId);
  await backfillStudents(libraryId as mongoose.Types.ObjectId, defaultShift?._id ?? null);
}

/** Normalize phones to E.164, derive status from dates, give everyone a shift. */
export async function backfillStudents(
  libraryId: mongoose.Types.ObjectId,
  defaultShiftId: mongoose.Types.ObjectId | null
) {
  const raw = Student.collection;
  const pending = await raw
    .find({
      libraryId,
      $or: [
        { phoneRaw: { $exists: false } },
        { status: { $exists: false } },
        { shiftId: { $exists: false } },
        { shiftId: null },
      ],
    })
    .project({ phone: 1, phoneRaw: 1, status: 1, shiftId: 1, membershipEndDate: 1 })
    .toArray();

  if (pending.length === 0) return;

  const ops = pending.map((s) => {
      const $set: Record<string, unknown> = {};
      if (s.phoneRaw === undefined) {
        $set.phoneRaw = s.phone;
        // Unparseable numbers are left as they are — never thrown away
        const e164 = normalizePhone(s.phone);
        if (e164) $set.phone = e164;
      }
      if (s.status === undefined) $set.status = deriveMemberStatus(null, s.membershipEndDate);
      if (!s.shiftId && defaultShiftId) $set.shiftId = defaultShiftId;
      return { updateOne: { filter: { _id: s._id }, update: { $set } } };
  });

  try {
    await raw.bulkWrite(ops, { ordered: false });
  } catch (err: any) {
    // A legacy duplicate phone collides with the unique {libraryId, phone}
    // index. Keep going: give those rows their shift/phoneRaw but leave phone
    // and status as they were. scripts/migrate-libraries.ts lists them.
    const failed: number[] = (err?.writeErrors ?? []).map((e: any) => e.index ?? e.err?.index);
    if (!failed.length || (err?.writeErrors ?? []).some((e: any) => (e.code ?? e.err?.code) !== 11000)) throw err;
    console.warn(`[Tenant] ${failed.length} student(s) share a phone in library ${libraryId}; left un-normalized.`);
    await raw.bulkWrite(
      failed.map((i) => {
        // phoneRaw stays unset too, so a re-run of the migration retries them
        const { phone: _p, status: _s, phoneRaw: _r, ...rest } = (ops[i].updateOne.update as any).$set;
        return { updateOne: { filter: ops[i].updateOne.filter, update: { $set: rest } } };
      }),
      { ordered: false }
    ).catch(() => {});
  }
}

/* ───────────── QR (PLAN §2.6) ───────────── */

export function qrSignature(libraryId: string, qrVersion: number): string {
  return createHmac('sha256', JWT_SECRET!)
    .update(`library-qr:${libraryId}:${qrVersion}`)
    .digest('base64url')
    .slice(0, 16);
}

export function verifyQrSignature(library: ILibrary, k: unknown): boolean {
  if (typeof k !== 'string' || k.length !== 16) return false;
  const expected = qrSignature(String(library._id), library.qrVersion ?? 1);
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= expected.charCodeAt(i) ^ k.charCodeAt(i);
  return diff === 0;
}

/**
 * Base URL for links a phone will open (the QR). Prefer the address the
 * librarian is actually using — it is reachable by definition, while
 * NEXT_PUBLIC_APP_URL can be stale (old domain). "localhost" is useless to a
 * phone, so it falls back to NEXT_PUBLIC_APP_URL there.
 */
export function appBaseUrl(requestOrigin?: string): string {
  const origin = requestOrigin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(requestOrigin)
    ? requestOrigin
    : null;
  return withScheme(origin || process.env.NEXT_PUBLIC_APP_URL || requestOrigin || 'http://localhost:3000');
}

/**
 * "192.168.1.5:3000" → "http://192.168.1.5:3000", "myapp.com" → "https://myapp.com".
 * Without a scheme a phone camera reads the QR as plain text, not a link.
 */
export function withScheme(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(u)) return u;
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u);
  return `${local ? 'http' : 'https'}://${u}`;
}

export function checkinUrl(library: ILibrary, requestOrigin?: string): string {
  const k = qrSignature(String(library._id), library.qrVersion ?? 1);
  return `${appBaseUrl(requestOrigin)}/checkin/${library.slug}?k=${k}`;
}

/**
 * Public QR entry: the library behind a /checkin/<slug>?k=<sig> link.
 * Same error for unknown slug and bad signature, so slugs can't be probed.
 */
export async function libraryFromQr(slug: string, k: unknown): Promise<ILibrary> {
  const library =
    typeof slug === 'string' && /^[a-z0-9-]{1,60}$/.test(slug)
      ? await Library.findOne({ slug })
      : null;
  if (!library || !verifyQrSignature(library, k)) {
    throw new ApiError(
      404,
      'This QR code is not valid any more. Please scan the latest QR code at the library.'
    );
  }
  return library;
}
