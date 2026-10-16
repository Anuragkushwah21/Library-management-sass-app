// app/api/attendance/route.ts — one day's attendance for the librarian
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Attendance } from '@/lib/models/Attendance';
import { Shift } from '@/lib/models/Shift';
import { Student } from '@/lib/models/Students';
import { autoCloseOpenRecords, libraryTz } from '@/lib/services/attendance';
import { isDateKey, localDateKey, shiftOccurrence } from '@/lib/time';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const tz = libraryTz(ctx.library);
    const now = new Date();
    const today = localDateKey(now, tz);

    const sp = request.nextUrl.searchParams;
    const date = isDateKey(sp.get('date')) ? sp.get('date')! : today;
    const shiftParam = sp.get('shiftId');
    const shiftId = shiftParam && mongoose.Types.ObjectId.isValid(shiftParam) ? shiftParam : null;

    // R1: close anything past shift end + 30 min before reporting
    await autoCloseOpenRecords({ libraryId: ctx.library._id }, now);

    const shifts = await Shift.find({ libraryId: ctx.libraryId }).sort({ sortOrder: 1, startTime: 1 }).lean();
    const inScope = shifts.filter((s: any) => (shiftId ? String(s._id) === shiftId : s.isActive));

    const records = await Attendance.find({
      libraryId: ctx.libraryId,
      date,
      ...(shiftId ? { shiftId } : {}),
    })
      .populate('studentId', 'name phone seatNumber status')
      .sort({ checkInAt: 1 })
      .lean();

    // Expected-but-missing students, per shift (virtual until the Phase 4 cron writes ABSENT)
    const seen = new Set(records.map((r: any) => `${String(r.studentId?._id ?? r.studentId)}:${String(r.shiftId)}`));
    const notCheckedIn: any[] = [];
    if (date <= today) {
      const students = await Student.find({
        libraryId: ctx.libraryId,
        status: { $in: ['ACTIVE_MEMBER', 'DEMO'] },
        shiftId: { $in: inScope.map((s: any) => s._id) },
      })
        .select('name phone seatNumber status shiftId membershipEndDate demoStartDate demoEndDate createdAt')
        .lean();

      for (const shift of inScope) {
        const occ = shiftOccurrence(shift as any, date, tz);
        if (occ.start > now) continue; // hasn't started yet — nobody is missing
        for (const st of students as any[]) {
          if (String(st.shiftId) !== String(shift._id)) continue;
          if (seen.has(`${String(st._id)}:${String(shift._id)}`)) continue;
          if (st.createdAt && new Date(st.createdAt) > occ.end) continue;
          if (st.status === 'DEMO') {
            // Demo students are expected only on their demo days
            if (st.demoStartDate && new Date(st.demoStartDate) > occ.end) continue;
            if (st.demoEndDate && new Date(st.demoEndDate) < occ.start) continue;
          } else if (st.membershipEndDate && new Date(st.membershipEndDate) < occ.start) continue;
          notCheckedIn.push({
            student: { _id: st._id, name: st.name, phone: st.phone, seatNumber: st.seatNumber ?? null, status: st.status },
            shiftId: shift._id,
            // Absent once the shift is over; until then they may still come
            state: now > occ.end ? 'ABSENT' : 'NOT_YET',
          });
        }
      }
    }

    const counts = {
      present: records.filter((r: any) => r.arrivalStatus === 'PRESENT').length,
      late: records.filter((r: any) => r.arrivalStatus === 'LATE').length,
      inside: records.filter((r: any) => r.isInside).length,
      leftEarly: records.filter((r: any) => r.leftEarly).length,
      absent: notCheckedIn.filter((n) => n.state === 'ABSENT').length + records.filter((r: any) => r.arrivalStatus === 'ABSENT').length,
      notYet: notCheckedIn.filter((n) => n.state === 'NOT_YET').length,
    };

    return NextResponse.json(
      successResponse({
        date,
        today,
        timezone: tz,
        graceMinutes: ctx.library.settings?.graceMinutes ?? 15,
        shifts,
        records,
        notCheckedIn,
        counts,
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load attendance.', 'Attendance GET');
  }
}
