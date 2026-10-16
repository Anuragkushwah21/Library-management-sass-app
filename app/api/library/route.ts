// app/api/library/route.ts — the librarian's own library profile + settings
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Library } from '@/lib/models/Library';
import { LibraryUpdateSchema } from '@/lib/validation-library';
import { logAudit } from '@/lib/services/audit';
import { getOtpChannel } from '@/lib/otp/channels';

export const runtime = 'nodejs';

function smsStatus() {
  try {
    const ch = getOtpChannel();
    return { smsConfigured: ch.name !== 'console', smsTestMode: ch.name === 'console' };
  } catch {
    return { smsConfigured: false, smsTestMode: false };
  }
}

function serialize(lib: any) {
  return {
    ...smsStatus(),
    id: String(lib._id),
    name: lib.name,
    slug: lib.slug,
    phone: lib.phone ?? '',
    address: lib.address ?? '',
    status: lib.status,
    settings: lib.settings,
    // Read-only here: only the platform admin changes these (§12)
    qrAccess: {
      qrAttendanceEnabled: Boolean(lib.qrAttendanceEnabled),
      otpEnabled: Boolean(lib.otpEnabled),
      accessStatus: lib.accessStatus ?? 'ACTIVE',
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    return NextResponse.json(successResponse(serialize(ctx.library)));
  } catch (error) {
    return handleRouteError(error, 'Failed to load library.', 'Library GET');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const data = LibraryUpdateSchema.parse(await request.json().catch(() => ({})));

    const $set: Record<string, unknown> = {};
    if (data.name !== undefined) $set.name = data.name;
    if (data.phone !== undefined) $set.phone = data.phone;
    if (data.address !== undefined) $set.address = data.address;
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      if (value !== undefined) $set[`settings.${key}`] = value;
    }

    const updated = await Library.findByIdAndUpdate(ctx.libraryId, { $set }, { returnDocument: 'after', runValidators: true });

    await logAudit({
      action: 'library.settings_updated',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Library',
      entityId: ctx.libraryId,
      meta: { changed: Object.keys($set) },
      request,
    });

    return NextResponse.json(successResponse(serialize(updated), 'Library updated'));
  } catch (error) {
    return handleRouteError(error, 'Failed to update library.', 'Library PATCH');
  }
}
