// app/api/shifts/[id]/route.ts — edit / activate / delete one shift
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Shift } from '@/lib/models/Shift';
import { Student } from '@/lib/models/Students';
import { Attendance } from '@/lib/models/Attendance';
import { ShiftSchema } from '@/lib/validation-library';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ success: false, error: 'Shift not found' }, { status: 404 });

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    const current = await Shift.findOne({ _id: id, libraryId: ctx.libraryId });
    if (!current) return notFound();

    const body = await request.json().catch(() => ({}));
    // Validate the merged shift so a partial edit can't make start == end
    const merged = ShiftSchema.parse({
      name: current.name,
      startTime: current.startTime,
      endTime: current.endTime,
      isActive: current.isActive,
      sortOrder: current.sortOrder,
      ...body,
    });

    if (merged.isActive === false && current.isActive) {
      const assigned = await Student.countDocuments({
        libraryId: ctx.libraryId,
        shiftId: current._id,
        status: { $in: ['ACTIVE_MEMBER', 'DEMO', 'PENDING'] },
      });
      if (assigned > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${assigned} student${assigned === 1 ? ' is' : 's are'} on this shift. Move them to another shift first.`,
          },
          { status: 409 }
        );
      }
    }

    Object.assign(current, merged);
    try {
      await current.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        return NextResponse.json({ success: false, error: `A shift named "${merged.name}" already exists.` }, { status: 409 });
      }
      throw err;
    }

    await logAudit({
      action: 'shift.updated',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Shift',
      entityId: id,
      meta: body,
      request,
    });

    return NextResponse.json(successResponse(current, 'Shift updated'));
  } catch (error) {
    return handleRouteError(error, 'Failed to update shift.', 'Shift PATCH');
  }
}

/** Only an unused shift can be deleted; otherwise deactivate it to keep history. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    const shift = await Shift.findOne({ _id: id, libraryId: ctx.libraryId });
    if (!shift) return notFound();

    const [students, history] = await Promise.all([
      Student.countDocuments({ libraryId: ctx.libraryId, shiftId: shift._id }),
      Attendance.countDocuments({ libraryId: ctx.libraryId, shiftId: shift._id }),
    ]);
    if (students > 0 || history > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'This shift has students or attendance history. Deactivate it instead so history is kept.',
        },
        { status: 409 }
      );
    }

    await shift.deleteOne();
    await logAudit({
      action: 'shift.deleted',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Shift',
      entityId: id,
      meta: { name: shift.name },
      request,
    });
    return NextResponse.json(successResponse({ id }, 'Shift deleted'));
  } catch (error) {
    return handleRouteError(error, 'Failed to delete shift.', 'Shift DELETE');
  }
}
