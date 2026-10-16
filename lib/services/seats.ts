// lib/services/seats.ts
import Seat from '@/lib/models/Seat';
import { Student } from '@/lib/models/Students';
import { ApiError } from '@/lib/api-response';

/** Students who must never hold a seat. */
const NO_SEAT_STATUSES = ['BLOCKED', 'REJECTED'];

export class SeatError extends ApiError {
  constructor(statusCode: number, message: string) {
    super(statusCode, message);
    this.name = 'SeatError';
  }
}

/**
 * Release a student's seat, whatever Student.seatNumber happens to say.
 *
 * We look the seat up by studentId rather than Student.seatNumber, because the
 * two can have drifted apart under older code (student's seat null while the
 * Seat doc still points at them).
 */
export async function releaseSeatOfStudent(
  studentId: string,
  librarianId: string
): Promise<number | null> {
  const held = await Seat.findOne({ studentId, librarianId });
  if (!held) return null;

  held.status = 'available';
  held.studentId = null;
  held.studentName = undefined;
  held.studentEmail = undefined;
  held.reservedDate = null;
  held.reservedUntil = null;
  await held.save();

  return held.seatNumber;
}

/**
 * Set (or clear) a student's seat, keeping Seat and Student in sync.
 *
 * IMPORTANT: only call this when the caller explicitly changed the seat. Do
 * NOT call it on membership renewal or payment-status updates — the seat must
 * stay with the student until it is deliberately changed or the student is
 * removed.
 */
export async function setStudentSeat({
  studentId,
  seatNumber,
  librarianId,
}: {
  studentId: string;
  /** null = release the seat */
  seatNumber: number | null;
  librarianId: string;
}): Promise<{ seatNumber: number | null }> {
  // Scoped to this librarian: never assign (or touch) another library's student
  const student = await Student.findOne({ _id: studentId, librarianId });
  if (!student) {
    throw new SeatError(404, 'Student not found');
  }

  const currentSeat = await Seat.findOne({ studentId, librarianId });

  // Nothing changed — no-op
  if (currentSeat && currentSeat.seatNumber === seatNumber) {
    return { seatNumber };
  }

  // Release
  if (seatNumber === null) {
    await releaseSeatOfStudent(studentId, librarianId);
    student.seatNumber = null;
    await student.save();
    return { seatNumber: null };
  }

  if (NO_SEAT_STATUSES.includes(student.status)) {
    throw new SeatError(
      409,
      `${student.name} is ${student.status === 'BLOCKED' ? 'blocked' : 'not an approved member'} and can't be given a seat.`
    );
  }

  const target = await Seat.findOne({ seatNumber, librarianId });
  if (!target) {
    throw new SeatError(404, `Seat ${seatNumber} not found in your library.`);
  }

  // Already held by someone else?
  if (target.studentId && String(target.studentId) !== String(studentId)) {
    throw new SeatError(
      409,
      `Seat ${seatNumber} is already assigned to ${
        target.studentName || 'another student'
      }.`
    );
  }

  // Release the old seat first, or the student would end up holding two
  if (currentSeat) {
    await releaseSeatOfStudent(studentId, librarianId);
  }

  target.status = 'reserved';
  target.studentId = student._id;
  target.studentName = student.name;
  target.studentEmail = student.email;
  target.reservedDate = new Date();
  await target.save();

  student.seatNumber = seatNumber;
  await student.save();

  return { seatNumber };
}
