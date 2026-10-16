// lib/services/seat-view.ts — what each seat looks like right now
import Seat from '@/lib/models/Seat';
import { Student } from '@/lib/models/Students';
import { Attendance } from '@/lib/models/Attendance';
import { deriveMemberStatus } from '@/lib/services/student-status';
import { autoCloseOpenRecords } from '@/lib/services/attendance';

/**
 * available  no student
 * assigned   held by an active member
 * occupied   held, and the student is checked in right now (QR attendance)
 * expired    held by someone whose membership ended / who is blocked — free it
 */
export type SeatState = 'available' | 'assigned' | 'occupied' | 'expired';

const SEAT_OK = ['ACTIVE_MEMBER', 'DEMO', 'PENDING'];

export function seatHolderIsValid(student: { status?: string; membershipEndDate?: Date | null } | null): boolean {
  if (!student) return false;
  return SEAT_OK.includes(deriveMemberStatus(student.status as any, student.membershipEndDate));
}

export async function listSeatsWithState(librarianId: string, libraryId: string) {
  await autoCloseOpenRecords({ libraryId }, new Date());

  const seats = await Seat.find({ librarianId }).sort({ seatNumber: 1 }).lean<any[]>();
  const ids = seats.map((s) => s.studentId).filter(Boolean);

  const [students, inside] = await Promise.all([
    Student.find({ _id: { $in: ids }, librarianId })
      .select('name phone email status membershipEndDate shiftId')
      .lean<any[]>(),
    Attendance.find({ studentId: { $in: ids }, isInside: true }).select('studentId checkInAt').lean<any[]>(),
  ]);
  const byId = new Map(students.map((s) => [String(s._id), s]));
  const insideSince = new Map(inside.map((a) => [String(a.studentId), a.checkInAt]));

  return seats.map((seat) => {
    const student = seat.studentId ? byId.get(String(seat.studentId)) ?? null : null;
    let state: SeatState = 'available';
    if (student) {
      if (!seatHolderIsValid(student)) state = 'expired';
      else if (insideSince.has(String(student._id))) state = 'occupied';
      else state = 'assigned';
    }
    return {
      ...seat,
      state,
      // A seat pointing at a deleted student is shown as free
      student: student
        ? {
            _id: student._id,
            name: student.name,
            phone: student.phone,
            email: student.email,
            status: deriveMemberStatus(student.status, student.membershipEndDate),
            membershipEndDate: student.membershipEndDate ?? null,
          }
        : null,
      insideSince: student ? insideSince.get(String(student._id)) ?? null : null,
    };
  });
}
