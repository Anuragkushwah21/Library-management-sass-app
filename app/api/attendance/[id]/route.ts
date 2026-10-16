// app/api/attendance/[id]/route.ts — override status / add a note / delete a wrong entry
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Attendance } from '@/lib/models/Attendance';
import { AttendanceOverrideSchema } from '@/lib/validation-library';
import { computeArrival, deriveStatus } from '@/lib/attendance-rules';
import { graceOf } from '@/lib/services/attendance';
import { logAudit } from '@/lib/services/audit';
import { minutesBetween } from '@/lib/time';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const notFound = NextResponse.json({ success: false, error: 'Attendance record not found' }, { status: 404 });
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound;

    const record = await Attendance.findOne({ _id: id, libraryId: ctx.libraryId });
    if (!record) return notFound;

    const data = AttendanceOverrideSchema.parse(await request.json().catch(() => ({})));
    const before = { arrivalStatus: record.arrivalStatus, note: record.note };

    if (data.arrivalStatus) {
      if (!record.checkInAt) {
        // Absent → present: count the whole shift
        record.checkInAt = record.shiftStartAt;
        record.checkOutAt = record.shiftEndAt;
        record.totalMinutes = minutesBetween(record.shiftStartAt, record.shiftEndAt);
        record.isInside = false;
      }
      record.arrivalStatus = data.arrivalStatus;
      record.lateMinutes =
        data.arrivalStatus === 'LATE'
          ? Math.max(1, computeArrival(record.checkInAt, record.shiftStartAt, graceOf(ctx.library)).lateMinutes)
          : 0;
    }
    if (data.note !== undefined) record.note = data.note;

    record.status = deriveStatus(record);
    record.manuallyEdited = true;
    record.overriddenBy = new mongoose.Types.ObjectId(ctx.userId);
    await record.save();

    await logAudit({
      action: 'attendance.override',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Attendance',
      entityId: id,
      meta: { before, after: data },
      request,
    });

    return NextResponse.json(successResponse(record, 'Attendance updated'));
  } catch (error) {
    return handleRouteError(error, 'Failed to update attendance.', 'Attendance PATCH');
  }
}

/** Remove a wrong entry (e.g. marked for the wrong student). The audit log keeps a copy. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const record = mongoose.Types.ObjectId.isValid(id) ? await Attendance.findOne({ _id: id, libraryId: ctx.libraryId }) : null;
    if (!record) return NextResponse.json({ success: false, error: 'Attendance record not found' }, { status: 404 });

    await Attendance.deleteOne({ _id: record._id });
    await logAudit({
      action: 'attendance.deleted',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Attendance',
      entityId: id,
      meta: {
        studentId: String(record.studentId),
        shiftId: String(record.shiftId),
        date: record.date,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        arrivalStatus: record.arrivalStatus,
        source: record.source,
      },
      request,
    });
    return NextResponse.json(successResponse({ _id: id }, 'Attendance entry deleted'));
  } catch (error) {
    return handleRouteError(error, 'Failed to delete attendance.', 'Attendance DELETE');
  }
}
