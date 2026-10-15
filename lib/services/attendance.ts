// lib/services/attendance.ts — writes for PLAN R1/R2, shared by QR scans and
// the librarian's manual actions.
import mongoose from 'mongoose';
import { Attendance, type IAttendance, type AttendanceSource } from '@/lib/models/Attendance';
import { Shift, type IShift } from '@/lib/models/Shift';
import type { ILibrary } from '@/lib/models/Library';
import {
  AUTO_CHECKOUT_AFTER_MINUTES,
  checkoutFields,
  computeArrival,
  deriveStatus,
  DEFAULT_GRACE_MINUTES,
} from '@/lib/attendance-rules';
import { MIN_MS, type ShiftOccurrence } from '@/lib/time';

export function libraryTz(library: ILibrary): string {
  return library.settings?.timezone || 'Asia/Kolkata';
}

export function graceOf(library: ILibrary): number {
  return library.settings?.graceMinutes ?? DEFAULT_GRACE_MINUTES;
}

/**
 * R1 auto check-out: close every open record whose shift ended more than
 * 30 min ago, at the shift end time. One pipeline update — safe to call on
 * every read and from the cron.
 */
export async function autoCloseOpenRecords(
  filter: Record<string, unknown>,
  now = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_CHECKOUT_AFTER_MINUTES * MIN_MS);
  const res = await Attendance.collection.updateMany(
    { ...filter, isInside: true, shiftEndAt: { $lt: cutoff } },
    [
      {
        $set: {
          checkOutAt: '$shiftEndAt',
          totalMinutes: {
            $max: [0, { $round: [{ $divide: [{ $subtract: ['$shiftEndAt', '$checkInAt'] }, 60000] }, 0] }],
          },
          isInside: false,
          leftEarly: false,
          autoCheckedOut: true,
          status: '$arrivalStatus',
          updatedAt: now,
        },
      },
    ]
  );
  return res.modifiedCount;
}

export interface StudentRef {
  _id: mongoose.Types.ObjectId | string;
  status?: string;
  seatNumber?: number | null;
}

/**
 * Create the check-in for one shift occurrence. Returns the existing record
 * instead when a concurrent scan already created it (unique index), so a
 * double tap never yields two rows.
 */
export async function createCheckIn(args: {
  library: ILibrary;
  student: StudentRef;
  shift: IShift;
  occ: ShiftOccurrence;
  at: Date;
  source: AttendanceSource;
  actorId?: string;
  note?: string;
}): Promise<{ record: IAttendance; created: boolean }> {
  const { library, student, shift, occ, at, source } = args;
  const { arrivalStatus, lateMinutes } = computeArrival(at, occ.start, graceOf(library));

  // A cron-written ABSENT row (Phase 4) turns into a real check-in
  const absent = await Attendance.findOneAndUpdate(
    { studentId: student._id, shiftId: shift._id, date: occ.date, checkInAt: null },
    {
      $set: {
        checkInAt: at,
        arrivalStatus,
        lateMinutes,
        isInside: true,
        leftEarly: false,
        status: 'CURRENTLY_INSIDE',
        source,
        ...(source === 'MANUAL'
          ? { manuallyEdited: true, overriddenBy: args.actorId ?? null }
          : {}),
        ...(args.note ? { note: args.note } : {}),
      },
    },
    { returnDocument: 'after' }
  );
  if (absent) return { record: absent, created: true };

  try {
    const record = await Attendance.create({
      libraryId: library._id,
      studentId: student._id,
      shiftId: shift._id,
      seatNumber: student.seatNumber ?? null,
      date: occ.date,
      shiftStartAt: occ.start,
      shiftEndAt: occ.end,
      checkInAt: at,
      arrivalStatus,
      lateMinutes,
      isInside: true,
      status: 'CURRENTLY_INSIDE',
      entryType: student.status === 'DEMO' ? 'DEMO' : 'MEMBER',
      source,
      manuallyEdited: source === 'MANUAL',
      overriddenBy: source === 'MANUAL' ? args.actorId ?? null : null,
      note: args.note,
    });
    return { record, created: true };
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    const existing = await Attendance.findOne({
      studentId: student._id,
      shiftId: shift._id,
      date: occ.date,
    });
    if (!existing) throw err;
    return { record: existing, created: false };
  }
}

/** Close an open record at `at`. Conditional, so two scans can't both check out. */
export async function checkOut(
  record: IAttendance,
  at: Date,
  extra: { source?: AttendanceSource; actorId?: string; note?: string } = {}
): Promise<IAttendance | null> {
  const fields = checkoutFields(record.checkInAt!, at, record.shiftEndAt);
  return Attendance.findOneAndUpdate(
    { _id: record._id, isInside: true },
    {
      $set: {
        ...fields,
        status: deriveStatus({ ...fields, arrivalStatus: record.arrivalStatus }),
        ...(extra.source === 'MANUAL'
          ? { manuallyEdited: true, overriddenBy: extra.actorId ?? null }
          : {}),
        ...(extra.note ? { note: extra.note } : {}),
      },
    },
    { returnDocument: 'after' }
  );
}

/** The shifts a student can attend: their own, else every active library shift. */
export async function shiftsForStudent(
  libraryId: mongoose.Types.ObjectId | string,
  shiftId?: mongoose.Types.ObjectId | string | null
): Promise<IShift[]> {
  if (shiftId) {
    const own = await Shift.findOne({ _id: shiftId, libraryId, isActive: true });
    if (own) return [own];
  }
  return Shift.find({ libraryId, isActive: true }).sort({ sortOrder: 1, startTime: 1 });
}
