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
import { endOfDay, startOfDay } from '@/lib/demo-rules';
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

    // R14: only students in a running demo or membership, and only on their dates
    if (!['DEMO', 'ACTIVE_MEMBER'].includes(student.status)) {
      return NextResponse.json(
        { success: false, error: `${student.name} is ${student.status.toLowerCase().replace('_', ' ')} — attendance can't be marked.` },
        { status: 409 }
      );
    }
    const dayStart = startOfDay(data.date, tz);
    const dayEnd = endOfDay(data.date, tz);
    if (student.status === 'DEMO') {
      if (student.demoStartDate && student.demoStartDate > dayEnd) {
        return NextResponse.json({ success: false, error: `${student.name}'s demo starts on ${localDateKey(student.demoStartDate, tz)}.` }, { status: 409 });
      }
      if (student.demoEndDate && student.demoEndDate < dayStart) {
        return NextResponse.json({ success: false, error: `${student.name}'s demo ended on ${localDateKey(student.demoEndDate, tz)}.` }, { status: 409 });
      }
    } else if (student.membershipEndDate && student.membershipEndDate < dayStart) {
      return NextResponse.json({ success: false, error: `${student.name}'s membership ended on ${localDateKey(student.membershipEndDate, tz)}.` }, { status: 409 });
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
    const entryType = student.status === 'DEMO' ? 'DEMO' : 'MEMBER';

    // D17: roll-call style, no real times
    if (data.action === 'present' || data.action === 'absent') {
      const present = data.action === 'present';
      if (existing?.checkInAt && existing.timesRecorded !== false) {
        if (present) {
          return NextResponse.json({ success: false, error: `${student.name} already has a check-in for this shift.` }, { status: 409 });
        }
        if (!data.force) {
          return NextResponse.json(
            { success: false, error: `${student.name} checked in at this shift. Confirm to mark absent anyway.`, code: 'NEEDS_FORCE' },
            { status: 409 }
          );
        }
      }
      const fields = present
        ? {
            checkInAt: occ.start,
            checkOutAt: occ.end,
            totalMinutes: 0,
            arrivalStatus: 'PRESENT',
            status: 'PRESENT',
            lateMinutes: 0,
          }
        : {
            checkInAt: null,
            checkOutAt: null,
            totalMinutes: 0,
            arrivalStatus: 'ABSENT',
            status: 'ABSENT',
            lateMinutes: 0,
          };
      const record = await Attendance.findOneAndUpdate(
        { studentId: student._id, shiftId: shift._id, date: data.date },
        {
          $set: {
            ...fields,
            leftEarly: false,
            isInside: false,
            autoCheckedOut: false,
            timesRecorded: false,
            source: 'MANUAL',
            manuallyEdited: true,
            overriddenBy: ctx.userId,
            entryType,
            ...(data.note ? { note: data.note } : {}),
          },
          $setOnInsert: {
            libraryId: ctx.libraryId,
            seatNumber: student.seatNumber ?? null,
            shiftStartAt: occ.start,
            shiftEndAt: occ.end,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
      await logAudit({
        action: present ? 'attendance.manual_present' : 'attendance.manual_absent',
        actorId: ctx.userId,
        actorRole: 'librarian',
        libraryId: ctx.libraryId,
        entity: 'Attendance',
        entityId: String(record?._id),
        meta: { studentId: data.studentId, shiftId: data.shiftId, date: data.date, forced: Boolean(data.force) },
        request,
      });
      return NextResponse.json(successResponse(record, present ? 'Marked present' : 'Marked absent'));
    }

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
