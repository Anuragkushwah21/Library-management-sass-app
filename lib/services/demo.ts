// lib/services/demo.ts — start / expire / extend / end a demo (PLAN R10, R4, R15)
import mongoose from 'mongoose';
import { Student, type IStudent } from '@/lib/models/Students';
import { Shift } from '@/lib/models/Shift';
import Seat from '@/lib/models/Seat';
import type { ILibrary } from '@/lib/models/Library';
import { ApiError } from '@/lib/api-response';
import { releaseSeatOfStudent, setStudentSeat } from '@/lib/services/seats';
import { logAudit } from '@/lib/services/audit';
import { notifyLibrary } from '@/lib/services/notify';
import { libraryTz } from '@/lib/services/attendance';
import {
  endOfDay,
  MAX_DEMO_EXTENSION_DAYS,
  startOfDay,
  validateDemoDates,
} from '@/lib/demo-rules';
import { addDaysToKey, localDateKey } from '@/lib/time';

export interface DemoInput {
  name: string;
  phoneE164: string;
  phoneRaw: string;
  email?: string;
  shiftId: string;
  /** null = start the demo without a seat (QR form when nothing is free) */
  seatNumber: number | null;
  startKey: string;
  endKey: string;
  address?: string;
  examTarget?: string;
  collegeName?: string;
  parentContact?: string;
  notes?: string;
  photoUrl?: string;
  idProof?: IStudent['idProof'];
}

/** R15: fields that clash with an existing student in the same library. */
export async function assertStudentUnique(libraryId: unknown, phone: string, email?: string) {
  const byPhone = await Student.findOne({ libraryId, phone, status: { $ne: 'REJECTED' } }).select('name');
  if (byPhone) throw new ApiError(409, `This mobile number is already registered to ${byPhone.name}.`, 'DUPLICATE_PHONE');
  if (email) {
    const byEmail = await Student.findOne({ libraryId, email, status: { $ne: 'REJECTED' } }).select('name');
    if (byEmail) throw new ApiError(409, `This email is already registered to ${byEmail.name}.`, 'DUPLICATE_EMAIL');
  }
}

/** A seat the student may take now: exists in this library and nobody holds it. */
export async function assertSeatFree(librarianId: string, seatNumber: number) {
  const seat = await Seat.findOne({ librarianId, seatNumber });
  if (!seat) throw new ApiError(404, `Seat ${seatNumber} doesn't exist in this library.`);
  if (seat.studentId) {
    const holder = await Student.findById(seat.studentId).select('name');
    if (holder) {
      throw new ApiError(409, `Seat ${seatNumber} is already held by ${holder.name}. Pick another seat.`, 'SEAT_TAKEN');
    }
  }
}

/** Free seats right now, for the demo forms. */
export async function freeSeatNumbers(librarianId: string): Promise<number[]> {
  const seats = await Seat.find({ librarianId }).select('seatNumber studentId').sort({ seatNumber: 1 }).lean<any[]>();
  const held = seats.filter((s) => s.studentId).map((s) => s.studentId);
  const alive = new Set(
    (await Student.find({ _id: { $in: held } }).select('_id').lean<any[]>()).map((s) => String(s._id))
  );
  return seats.filter((s) => !s.studentId || !alive.has(String(s.studentId))).map((s) => s.seatNumber);
}

/**
 * Create a DEMO student (manual form or QR form) and hold their seat.
 * Validates everything first; if the seat is grabbed between the check and
 * the write, the new student is removed again so nothing half-made remains.
 */
export async function startDemo(args: {
  library: ILibrary;
  librarianId: string;
  input: DemoInput;
  source: 'MANUAL' | 'QR';
  actorId: string | null;
}): Promise<IStudent> {
  const { library, librarianId, input, source } = args;
  const tz = libraryTz(library);
  const today = localDateKey(new Date(), tz);

  const dateError = validateDemoDates(input.startKey, input.endKey, today);
  if (dateError) throw new ApiError(400, dateError, 'INVALID_DEMO_DATES');

  if (!mongoose.Types.ObjectId.isValid(input.shiftId)) throw new ApiError(400, 'Choose a shift.');
  const shift = await Shift.findOne({ _id: input.shiftId, libraryId: library._id, isActive: true }).select('_id name');
  if (!shift) throw new ApiError(404, 'That shift is not available any more.');

  await assertStudentUnique(library._id, input.phoneE164, input.email);
  if (input.seatNumber != null) await assertSeatFree(librarianId, input.seatNumber);

  let student: IStudent;
  try {
    student = await Student.create({
      name: input.name,
      email: input.email || undefined,
      phone: input.phoneE164,
      phoneRaw: input.phoneRaw,
      status: 'DEMO',
      registrationSource: source,
      shiftId: shift._id,
      libraryId: library._id,
      librarianId,
      demoStartDate: startOfDay(input.startKey, tz),
      demoEndDate: endOfDay(input.endKey, tz),
      paymentStatus: 'unpaid',
      membershipStatus: 'inactive',
      address: input.address,
      examTarget: input.examTarget,
      collegeName: input.collegeName,
      parentContact: input.parentContact,
      notes: input.notes,
      photoUrl: input.photoUrl,
      idProof: input.idProof ?? null,
    });
  } catch (err: any) {
    // Unique phone/email index — a concurrent registration won
    if (err?.code === 11000) {
      throw new ApiError(409, 'This mobile number is already registered.', 'DUPLICATE_PHONE');
    }
    throw err;
  }

  if (input.seatNumber != null) {
    try {
      await setStudentSeat({ studentId: String(student._id), seatNumber: input.seatNumber, librarianId });
    } catch (err: any) {
      await Student.deleteOne({ _id: student._id });
      if (err?.statusCode === 409) {
        throw new ApiError(409, `Seat ${input.seatNumber} was just taken. Pick another seat.`, 'SEAT_TAKEN');
      }
      throw err;
    }
  }

  await logAudit({
    action: 'demo.started',
    actorId: args.actorId,
    actorRole: source === 'QR' ? 'student' : 'librarian',
    libraryId: String(library._id),
    entity: 'Student',
    entityId: String(student._id),
    meta: { source, seatNumber: input.seatNumber, start: input.startKey, end: input.endKey },
  });

  // The librarian didn't do this one themselves — tell them
  if (source === 'QR') {
    await notifyLibrary(library._id, {
      section: 'students',
      type: 'demo.started.qr',
      title: `New demo: ${input.name}`,
      body: `Started from the QR · ${input.seatNumber != null ? `Seat ${input.seatNumber}` : 'no seat yet — assign one'}`,
      link: '/librarian/students?tab=demo',
    });
  }

  return (await Student.findById(student._id))!;
}

async function closeDemo(student: IStudent, librarianId: string, reason: 'expired' | 'ended', actorId: string | null) {
  const res = await Student.updateOne(
    { _id: student._id, status: 'DEMO' },
    { $set: { status: 'DEMO_ENDED', demoEndedAt: new Date(), seatNumber: null } }
  );
  if (!res.modifiedCount) return false; // someone else closed or activated it first
  await releaseSeatOfStudent(String(student._id), librarianId);
  await logAudit({
    action: reason === 'expired' ? 'demo.expired' : 'demo.ended',
    actorId,
    actorRole: actorId ? 'librarian' : 'system',
    libraryId: String(student.libraryId),
    entity: 'Student',
    entityId: String(student._id),
    meta: { seatNumber: student.seatNumber ?? null },
  });
  if (reason === 'expired') {
    await notifyLibrary(student.libraryId, {
      section: 'students',
      type: 'demo.expired',
      title: `Demo ended: ${student.name}`,
      body: `${student.seatNumber ? `Seat ${student.seatNumber} is free again. ` : ''}Collect the fee to make them a member.`,
      link: '/librarian/students?tab=ended',
    });
  }
  return true;
}

/**
 * R4, run lazily on every list read and scan (and by the cron later): every
 * DEMO past its end date becomes DEMO_ENDED and its seat is freed.
 */
export async function expireDemos(libraryId: unknown, librarianId: string, now = new Date()): Promise<number> {
  const due = await Student.find({ libraryId, status: 'DEMO', demoEndDate: { $lt: now } });
  let n = 0;
  for (const s of due) if (await closeDemo(s, librarianId, 'expired', null)) n++;
  return n;
}

export async function endDemoNow(student: IStudent, librarianId: string, actorId: string) {
  if (student.status !== 'DEMO') throw new ApiError(409, `${student.name} is not in a demo.`);
  await closeDemo(student, librarianId, 'ended', actorId);
}

export async function extendDemo(student: IStudent, days: number, library: ILibrary, actorId: string) {
  if (student.status !== 'DEMO' || !student.demoEndDate) throw new ApiError(409, `${student.name} is not in a demo.`);
  if (!Number.isInteger(days) || days < 1 || days > 3) throw new ApiError(400, 'Extend by 1 to 3 days.');
  const used = student.demoExtendedDays ?? 0;
  if (used + days > MAX_DEMO_EXTENSION_DAYS) {
    throw new ApiError(
      409,
      `A demo can be extended by at most ${MAX_DEMO_EXTENSION_DAYS} days in total (${used} used).`
    );
  }
  const tz = libraryTz(library);
  const newEndKey = addDaysToKey(localDateKey(student.demoEndDate, tz), days);
  student.demoEndDate = endOfDay(newEndKey, tz);
  student.demoExtendedDays = used + days;
  await student.save();
  await logAudit({
    action: 'demo.extended',
    actorId,
    actorRole: 'librarian',
    libraryId: String(library._id),
    entity: 'Student',
    entityId: String(student._id),
    meta: { days, newEnd: newEndKey },
  });
  return newEndKey;
}
