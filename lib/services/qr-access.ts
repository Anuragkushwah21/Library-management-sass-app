// lib/services/qr-access.ts — admin-controlled QR/OTP access + SMS credits (PLAN §12)
import mongoose from 'mongoose';
import { Library, type ILibrary } from '@/lib/models/Library';
import { SmsTransaction } from '@/lib/models/SmsTransaction';
import { ApiError } from '@/lib/api-response';
import { logAudit } from '@/lib/services/audit';
import { notifyAdmins, notifyLibrary } from '@/lib/services/notify';
import { localDateKey } from '@/lib/time';
import { maskPhone } from '@/lib/phone';

export type AccessDenial = 'LIBRARY_UNAVAILABLE' | 'QR_DISABLED' | 'OTP_DISABLED';

/** Calendar month in the library's timezone, e.g. "2026-10". */
export function monthKey(library: ILibrary, now = new Date()): string {
  return localDateKey(now, library.settings?.timezone || 'Asia/Kolkata').slice(0, 7);
}

/** D23: an access period that ran out flips to EXPIRED (once, audited). */
async function expireIfDue(library: ILibrary, now: Date) {
  if (library.accessStatus === 'ACTIVE' && library.accessExpiresAt && library.accessExpiresAt <= now) {
    const res = await Library.updateOne(
      { _id: library._id, accessStatus: 'ACTIVE' },
      { $set: { accessStatus: 'EXPIRED', accessUpdatedAt: now } }
    );
    library.accessStatus = 'EXPIRED';
    if (res.modifiedCount) {
      await logAudit({
        action: 'qr_access.expired',
        actorRole: 'system',
        libraryId: String(library._id),
        entity: 'Library',
        entityId: String(library._id),
        meta: { accessExpiresAt: library.accessExpiresAt },
      });
      await notifyLibrary(library._id, {
        section: 'account',
        type: 'qr_access.expired',
        title: 'QR attendance has expired',
        body: 'Students can’t scan the QR any more. Contact the admin to renew it.',
        link: '/librarian/qr-attendance',
      });
    }
  }
}

/** What the student page / librarian page should know, without throwing. */
export async function qrAccessState(library: ILibrary, now = new Date()) {
  await expireIfDue(library, now);
  // One paid service: when it's on, QR check-in and phone OTP both work
  const qr = library.status !== 'SUSPENDED' && library.accessStatus === 'ACTIVE' && Boolean(library.qrAttendanceEnabled);
  return {
    qrEnabled: qr,
    otpEnabled: qr,
    reason: (library.status === 'SUSPENDED' ? 'LIBRARY_UNAVAILABLE' : !qr ? 'QR_DISABLED' : null) as AccessDenial | null,
  };
}

const DENIAL_TEXT: Record<AccessDenial, string> = {
  LIBRARY_UNAVAILABLE: 'Check-in is temporarily unavailable at this library. Please contact library staff.',
  QR_DISABLED: 'QR check-in is currently unavailable. Please contact library staff.',
  OTP_DISABLED: 'Phone verification is currently unavailable. Please contact library staff.',
};

/**
 * §12.2 — called first by every QR/OTP route. Throws 403 with a code when the
 * library may not use QR (or OTP, when `otp` is set). Never charges anything.
 */
export async function assertQrOtpAccess(library: ILibrary, opts: { otp?: boolean } = {}) {
  const state = await qrAccessState(library);
  if (!state.qrEnabled) throw new ApiError(403, DENIAL_TEXT[state.reason ?? 'QR_DISABLED'], state.reason ?? 'QR_DISABLED');
  if (opts.otp && !state.otpEnabled) throw new ApiError(403, DENIAL_TEXT.OTP_DISABLED, 'OTP_DISABLED');
}

/**
 * Take one credit for one OTP SMS, atomically: the balance never goes below 0
 * and the monthly limit is never exceeded, even with parallel requests.
 * Returns the ledger row so a failed delivery can be refunded.
 */
export async function chargeOtpSend(library: ILibrary, phone: string, provider: string) {
  const month = monthKey(library);
  // Month rollover — conditional, so it happens exactly once
  await Library.updateOne(
    { _id: library._id, otpUsageMonth: { $ne: month } },
    { $set: { otpUsageMonth: month, otpUsedThisMonth: 0 } }
  );

  const charged = await Library.findOneAndUpdate(
    {
      _id: library._id,
      smsCreditBalance: { $gte: 1 },
      $or: [
        { monthlyOtpLimit: null },
        { monthlyOtpLimit: { $exists: false } },
        { $expr: { $lt: ['$otpUsedThisMonth', '$monthlyOtpLimit'] } },
      ],
    },
    { $inc: { smsCreditBalance: -1, otpUsedThisMonth: 1 } },
    { returnDocument: 'after' }
  );

  if (!charged) {
    const fresh = await Library.findById(library._id).select('smsCreditBalance monthlyOtpLimit otpUsedThisMonth name');
    const outOfCredits = !fresh || fresh.smsCreditBalance < 1;
    // Tell the people who can fix it (deduplicated: once per day per reason)
    await warnOnce(library, outOfCredits ? 'credits.empty' : 'otp.monthly_limit');
    if (outOfCredits) {
      throw new ApiError(402, 'SMS service is temporarily unavailable at this library. Please contact library staff.', 'SMS_CREDITS_EXHAUSTED');
    }
    throw new ApiError(429, 'SMS service is temporarily unavailable at this library. Please contact library staff.', 'MONTHLY_OTP_LIMIT');
  }

  const row = await SmsTransaction.create({
    libraryId: library._id,
    type: 'OTP_SEND',
    credits: -1,
    balanceAfter: charged.smsCreditBalance,
    monthKey: month,
    phoneMasked: maskPhone(phone),
    provider,
    actorRole: 'student',
  });

  await maybeWarnLow(charged);
  return row;
}

/** Give the credit back when the SMS provider failed. */
export async function refundOtpSend(library: ILibrary, sendRow: { _id: unknown; phoneMasked?: string; provider?: string }) {
  const month = monthKey(library);
  const back = await Library.findOneAndUpdate(
    { _id: library._id },
    { $inc: { smsCreditBalance: 1, otpUsedThisMonth: -1 } },
    { returnDocument: 'after' }
  );
  await Promise.all([
    SmsTransaction.updateOne({ _id: sendRow._id }, { $set: { status: 'FAILED' } }),
    SmsTransaction.create({
      libraryId: library._id,
      type: 'REFUND',
      credits: 1,
      balanceAfter: back?.smsCreditBalance ?? 0,
      monthKey: month,
      phoneMasked: sendRow.phoneMasked,
      provider: sendRow.provider,
      refundOf: sendRow._id,
      actorRole: 'system',
      note: 'SMS delivery failed — credit returned',
    }),
  ]);
}

/** Test mode / console channel: logged, but no credit (D21). Verify: logged, 0 credits (D19). */
export async function logFreeOtpEvent(library: ILibrary, type: 'OTP_SEND' | 'OTP_VERIFY', phone: string, provider: string) {
  const fresh = await Library.findById(library._id).select('smsCreditBalance');
  await SmsTransaction.create({
    libraryId: library._id,
    type,
    credits: 0,
    balanceAfter: fresh?.smsCreditBalance ?? 0,
    monthKey: monthKey(library),
    phoneMasked: maskPhone(phone),
    provider,
    actorRole: 'student',
  });
}

async function maybeWarnLow(lib: ILibrary) {
  const threshold = Math.max(10, Math.ceil((lib.lastCreditTopUp ?? 0) * 0.1));
  if (lib.smsCreditBalance > threshold || lib.creditsLowNotifiedAt) return;
  const res = await Library.updateOne(
    { _id: lib._id, creditsLowNotifiedAt: null },
    { $set: { creditsLowNotifiedAt: new Date() } }
  );
  if (!res.modifiedCount) return;
  await notifyLibrary(lib._id, {
    section: 'account',
    type: 'credits.low',
    title: `SMS credits low: ${lib.smsCreditBalance} left`,
    body: 'Ask the admin to add credits so new students can verify their phones.',
    link: '/librarian/qr-attendance',
  });
  await notifyAdmins({
    section: 'librarians',
    type: 'credits.low',
    title: `${lib.name}: SMS credits low (${lib.smsCreditBalance} left)`,
    link: '/admin/qr-access',
  });
}

const warned = new Map<string, number>();
async function warnOnce(lib: ILibrary, type: 'credits.empty' | 'otp.monthly_limit') {
  const key = `${lib._id}:${type}:${new Date().toISOString().slice(0, 10)}`;
  if (warned.has(key)) return;
  warned.set(key, Date.now());
  const title = type === 'credits.empty' ? 'SMS credits are over' : 'Monthly OTP limit reached';
  await notifyLibrary(lib._id, {
    section: 'account',
    type,
    title,
    body: 'New students can’t verify their phones. Contact the admin.',
    link: '/librarian/qr-attendance',
  });
  await notifyAdmins({ section: 'librarians', type, title: `${lib.name}: ${title.toLowerCase()}`, link: '/admin/qr-access' });
}

/* ───────────── admin actions ───────────── */

export async function adminUpdateAccess(args: {
  libraryId: string;
  actorId: string;
  patch: {
    qrAttendanceEnabled?: boolean;
    otpEnabled?: boolean;
    accessStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    accessExpiresAt?: Date | null;
    monthlyOtpLimit?: number | null;
  };
  note: string;
}) {
  const lib = await Library.findById(args.libraryId);
  if (!lib) throw new ApiError(404, 'Library not found');

  const before = {
    qrAttendanceEnabled: lib.qrAttendanceEnabled,
    otpEnabled: lib.otpEnabled,
    accessStatus: lib.accessStatus,
    accessExpiresAt: lib.accessExpiresAt ?? null,
    monthlyOtpLimit: lib.monthlyOtpLimit ?? null,
  };
  const next = { ...before, ...args.patch };
  // QR + OTP is one service: a single switch turns both on or off
  const service = args.patch.qrAttendanceEnabled ?? args.patch.otpEnabled;
  if (service !== undefined) {
    next.qrAttendanceEnabled = service;
    next.otpEnabled = service;
    if (service && !args.patch.accessStatus) next.accessStatus = 'ACTIVE';
  }
  if (service && next.accessExpiresAt && new Date(next.accessExpiresAt) <= new Date()) {
    throw new ApiError(400, 'The paid-until date has already passed. Set a new date (or clear it) to turn the service on.');
  }
  // Setting a future expiry on an EXPIRED library re-activates it unless told otherwise
  if (args.patch.accessExpiresAt && args.patch.accessExpiresAt > new Date() && !args.patch.accessStatus && lib.accessStatus === 'EXPIRED') {
    next.accessStatus = 'ACTIVE';
  }

  Object.assign(lib, next, {
    accessNote: args.note,
    accessUpdatedAt: new Date(),
    accessUpdatedBy: new mongoose.Types.ObjectId(args.actorId),
  });
  await lib.save();

  const changed = Object.keys(next).filter((k) => String((before as any)[k]) !== String((next as any)[k]));
  await logAudit({
    action: 'qr_access.updated',
    actorId: args.actorId,
    actorRole: 'admin',
    libraryId: String(lib._id),
    entity: 'Library',
    entityId: String(lib._id),
    meta: { before, after: next, changed, note: args.note },
  });

  if (changed.length) {
    const on = lib.qrAttendanceEnabled && lib.accessStatus === 'ACTIVE';
    await notifyLibrary(lib._id, {
      section: 'account',
      type: 'qr_access.updated',
      title: on ? 'QR attendance is enabled for your library' : 'QR attendance has been turned off',
      body: args.note,
      link: '/librarian/qr-attendance',
    });
  }
  return lib;
}

export async function adminAddCredits(args: {
  libraryId: string;
  actorId: string;
  credits: number;
  note: string;
  requestId: string;
}) {
  const replay = await SmsTransaction.findOne({ libraryId: args.libraryId, requestId: args.requestId });
  if (replay) return { balance: replay.balanceAfter, transaction: replay, replayed: true };

  const lib = await Library.findById(args.libraryId).select('name settings smsCreditBalance');
  if (!lib) throw new ApiError(404, 'Library not found');

  const updated = await Library.findOneAndUpdate(
    { _id: lib._id, ...(args.credits < 0 ? { smsCreditBalance: { $gte: -args.credits } } : {}) },
    {
      $inc: { smsCreditBalance: args.credits },
      ...(args.credits > 0 ? { $set: { lastCreditTopUp: args.credits, creditsLowNotifiedAt: null } } : {}),
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ApiError(400, "Balance can't go below 0.");

  const isAdd = args.credits > 0;
  let tx;
  try {
    tx = await SmsTransaction.create({
      libraryId: lib._id,
      type: isAdd ? 'CREDIT_ADD' : 'CREDIT_ADJUST',
      credits: args.credits,
      balanceAfter: updated.smsCreditBalance,
      monthKey: monthKey(updated),
      actorId: args.actorId,
      actorRole: 'admin',
      note: args.note,
      requestId: args.requestId,
    });
  } catch (err: any) {
    // Same requestId raced in — undo this one, return the first
    await Library.updateOne({ _id: lib._id }, { $inc: { smsCreditBalance: -args.credits } });
    if (err?.code === 11000) {
      const first = await SmsTransaction.findOne({ libraryId: lib._id, requestId: args.requestId });
      return { balance: first?.balanceAfter ?? 0, transaction: first, replayed: true };
    }
    throw err;
  }

  await logAudit({
    action: isAdd ? 'qr_access.credits_added' : 'qr_access.credits_adjusted',
    actorId: args.actorId,
    actorRole: 'admin',
    libraryId: String(lib._id),
    entity: 'Library',
    entityId: String(lib._id),
    meta: { credits: args.credits, balanceAfter: updated.smsCreditBalance, note: args.note },
  });
  if (isAdd) {
    await notifyLibrary(lib._id, {
      section: 'account',
      type: 'credits.added',
      title: `${args.credits} SMS credits added`,
      body: `Balance: ${updated.smsCreditBalance}`,
      link: '/librarian/qr-attendance',
    });
  }
  return { balance: updated.smsCreditBalance, transaction: tx, replayed: false };
}
