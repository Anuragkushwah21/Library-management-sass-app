// app/api/attendance/manual/route.ts — librarian check-in / check-out on a student's behalf
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Attendance } from '@/lib/models/Attendance';
import { Shift } from '@/lib/models/Shift';
import { Student } from '@/lib/models/Students';
import { ManualAttendanceSchema } from '@/lib/validation-library';
import { checkOut, createCheckIn, libraryTz } from '@/lib/services/attendance';
import { logAudit } from '@/lib/services/audit';
import { addDaysToKey, crossesMidnight, hhmmToMinutes, localDateKey, shiftOccurrence, zonedTimeToUtc } from '@/lib/time';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const data = ManualAttendanceSchema.parse(await request.json().catch(() => ({})));
    const tz = libraryTz(ctx.library);
    const now = new Date();

    // Both must belong to this library — 404 otherwise, so IDs can't be probed
    const [student, shift] = await Promise.all([
      Student.findOne({ _id: data.studentId, libraryId: ctx.libraryId }),
      Shift.findOne({ _id: data.shiftId, libraryId: ctx.libraryId }),
    ]);
    if (!student || !shift) {
      return NextResponse.json({ success: false, error: 'Student or shift not found' }, { status: 404 });
    }
    if (data.date > localDateKey(now, tz)) {
      return NextResponse.json({ success: false, error: 'You cannot mark attendance for a future date.' }, { status: 400 });
    }

    const occ = shiftOccurrence(shift, data.date, tz);
    let at = now;
    if (data.time) {
      // A night shift's after-midnight times belong to the next calendar day
      const nextDay = crossesMidnight(shift) && hhmmToMinutes(data.time) < hhmmToMinutes(shift.startTime);
      at = zonedTimeToUtc(nextDay ? addDaysToKey(data.date, 1) : data.date, data.time, tz);
    } else if (data.date !== localDateKey(now, tz)) {
      at = data.action === 'checkin' ? occ.start : occ.end;
    }
    if (at > now) {
      return NextResponse.json({ success: false, error: 'That time is in the future.' }, { status: 400 });
    }

    const existing = await Attendance.findOne({ studentId: student._id, shiftId: shift._id, date: data.date });

    if (data.action === 'checkin') {
      if (existing?.checkInAt) {
        return NextResponse.json({ success: false, error: `${student.name} is already checked in for this shift.` }, { status: 409 });
      }
      const { record } = await createCheckIn({
        library: ctx.library,
        student,
        shift,
        occ,
        at,
        source: 'MANUAL',
        actorId: ctx.userId,
        note: data.note,
      });
      await logAudit({
        action: 'attendance.manual_checkin',
        actorId: ctx.userId,
        actorRole: 'librarian',
        libraryId: ctx.libraryId,
        entity: 'Attendance',
        entityId: String(record._id),
        meta: { studentId: data.studentId, shiftId: data.shiftId, date: data.date, at: at.toISOString() },
        request,
      });
      return NextResponse.json(successResponse(record, 'Checked in'));
    }

    if (!existing?.isInside) {
      return NextResponse.json({ success: false, error: `${student.name} is not checked in for this shift.` }, { status: 409 });
    }
    if (at < existing.checkInAt!) {
      return NextResponse.json({ success: false, error: 'Check-out time is before the check-in time.' }, { status: 400 });
    }
    const record = await checkOut(existing, at, { source: 'MANUAL', actorId: ctx.userId, note: data.note });
    await logAudit({
      action: 'attendance.manual_checkout',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Attendance',
      entityId: String(existing._id),
      meta: { studentId: data.studentId, at: at.toISOString() },
      request,
    });
    return NextResponse.json(successResponse(record, 'Checked out'));
  } catch (error) {
    return handleRouteError(error, 'Failed to update attendance.', 'Attendance manual');
  }
}
