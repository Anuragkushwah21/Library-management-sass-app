// lib/services/student-otp.ts — phone OTP for QR check-in (PLAN §2.6)
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { StudentOtp } from '@/lib/models/StudentOtp';
import { Library, type ILibrary } from '@/lib/models/Library';
import { ApiError } from '@/lib/api-response';
import { exposeDevCode, getOtpChannel } from '@/lib/otp/channels';
import { localDateKey } from '@/lib/time';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_SENDS_PER_LIBRARY_DAY = 500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hashCode(libraryId: string, phone: string, code: string): string {
  return createHmac('sha256', process.env.JWT_SECRET!)
    .update(`student-otp:${libraryId}:${phone}:${code}`)
    .digest('hex');
}

/** Counts this send against the library's daily cap; false when the cap is hit. */
async function reserveLibrarySend(library: ILibrary): Promise<boolean> {
  const today = localDateKey(new Date(), library.settings?.timezone || 'Asia/Kolkata');
  const reset = await Library.updateOne(
    { _id: library._id, otpSendDay: { $ne: today } },
    { $set: { otpSendDay: today, otpSendCount: 1 } }
  );
  if (reset.modifiedCount === 1) return true;
  const inc = await Library.updateOne(
    { _id: library._id, otpSendDay: today, otpSendCount: { $lt: OTP_MAX_SENDS_PER_LIBRARY_DAY } },
    { $inc: { otpSendCount: 1 } }
  );
  return inc.modifiedCount === 1;
}

export async function sendStudentOtp(
  library: ILibrary,
  phone: string
): Promise<{ devCode?: string; resendInSeconds: number }> {
  const now = new Date();
  const libraryId = String(library._id);

  // Resolve delivery first: a misconfigured SMS setup must not store a code
  // nobody will receive or use up the student's send quota
  let channel;
  try {
    channel = getOtpChannel();
  } catch (err) {
    console.error('[StudentOtp]', err);
    throw new ApiError(503, 'Text messages are not set up for this library yet. Please ask the librarian.');
  }

  let doc = await StudentOtp.findOne({ libraryId, phone });
  if (doc?.lastSentAt && now.getTime() - doc.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now.getTime() - doc.lastSentAt.getTime())) / 1000);
    throw new ApiError(429, `Please wait ${wait} seconds before requesting another code.`);
  }

  const windowExpired = !doc || now.getTime() - doc.windowStart.getTime() > HOUR_MS;
  if (!windowExpired && doc!.sendCount >= OTP_MAX_SENDS_PER_HOUR) {
    throw new ApiError(429, 'Too many codes requested for this number. Try again in an hour.');
  }

  if (!(await reserveLibrarySend(library))) {
    throw new ApiError(429, 'This library has reached its daily OTP limit. Please ask the librarian.');
  }

  const code = String(randomInt(100000, 1000000));
  doc = await StudentOtp.findOneAndUpdate(
    { libraryId, phone },
    {
      $set: {
        codeHash: hashCode(libraryId, phone, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        lastSentAt: now,
        purgeAt: new Date(now.getTime() + DAY_MS),
        ...(windowExpired ? { windowStart: now, sendCount: 1 } : {}),
      },
      ...(windowExpired ? {} : { $inc: { sendCount: 1 } }),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  try {
    await channel.send(phone, code, library.name);
  } catch (err) {
    console.error('[StudentOtp] delivery failed:', err);
    // Let them retry straight away — the code never arrived
    await StudentOtp.updateOne({ _id: doc!._id }, { $set: { lastSentAt: null, codeHash: null } });
    throw new ApiError(502, 'Could not send the code right now. Please try again.');
  }

  return {
    resendInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    ...(exposeDevCode(channel) ? { devCode: code } : {}),
  };
}

export async function verifyStudentOtp(library: ILibrary, phone: string, code: string): Promise<void> {
  const libraryId = String(library._id);
  const now = new Date();

  // Count the attempt BEFORE comparing, atomically, so parallel guesses can't
  // exceed the limit
  const doc = await StudentOtp.findOneAndUpdate(
    {
      libraryId,
      phone,
      codeHash: { $ne: null },
      expiresAt: { $gt: now },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );

  if (!doc) {
    const existing = await StudentOtp.findOne({ libraryId, phone }).select('attempts expiresAt codeHash');
    if (existing?.codeHash && existing.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many wrong attempts. Request a new code.');
    }
    throw new ApiError(400, 'This code has expired. Request a new one.');
  }

  const expected = Buffer.from(doc.codeHash!, 'hex');
  const given = Buffer.from(hashCode(libraryId, phone, code), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const left = OTP_MAX_ATTEMPTS - doc.attempts;
    throw new ApiError(
      400,
      left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.'
    );
  }

  // Single use
  await StudentOtp.updateOne({ _id: doc._id }, { $set: { codeHash: null, expiresAt: null } });
}
