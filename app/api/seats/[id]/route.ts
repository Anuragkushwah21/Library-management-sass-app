// app/api/seats/[id]/route.ts — assign / release / notes / delete one seat
import { isPastDate } from '@/lib/date-rules';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import Seat from '@/lib/models/Seat';
import { Student } from '@/lib/models/Students';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { releaseSeatOfStudent, setStudentSeat } from '@/lib/services/seats';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ success: false, error: 'Seat not found' }, { status: 404 });

// Seats are scoped to the librarian; another library's seat is simply "not found"
async function loadSeat(request: NextRequest, params: Ctx['params']) {
  const ctx = await requireLibraryContext(request);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return { ctx, seat: null };
  const seat = await Seat.findOne({ _id: id, librarianId: ctx.userId });
  return { ctx, seat };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { seat } = await loadSeat(request, params);
    if (!seat) return notFound();
    return NextResponse.json({ success: true, data: seat });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch seat', 'Seat GET');
  }
}

const UpdateSchema = z.object({
  /** Assign this student (moves them off any other seat) */
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid student').optional(),
  /** Free the seat. `status: 'available'` is the legacy spelling of the same thing */
  release: z.boolean().optional(),
  status: z.enum(['available', 'reserved', 'occupied']).optional(),
  reservedUntil: z.string().nullable().optional(),
  notes: z.string().trim().max(200).optional(),
});

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { ctx, seat } = await loadSeat(request, params);
    if (!seat) return notFound();

    const body = UpdateSchema.parse(await request.json().catch(() => ({})));
    if (body.reservedUntil && isPastDate(body.reservedUntil)) {
      return NextResponse.json(
        { success: false, error: 'Reservation end date cannot be in the past' },
        { status: 400 }
      );
    }

    if (body.studentId) {
      const previous = seat.studentId ? String(seat.studentId) : null;
      // Refuses a seat held by someone else, frees the student's old seat,
      // keeps Student.seatNumber in step — see lib/services/seats.ts
      await setStudentSeat({ studentId: body.studentId, seatNumber: seat.seatNumber, librarianId: ctx.userId });
      if (previous !== body.studentId) {
        await logAudit({
          action: 'seat.assigned',
          actorId: ctx.userId,
          actorRole: 'librarian',
          libraryId: ctx.libraryId,
          entity: 'Seat',
          entityId: String(seat._id),
          meta: { seatNumber: seat.seatNumber, studentId: body.studentId },
          request,
        });
      }
    } else if (body.release || body.status === 'available') {
      if (seat.studentId) {
        const studentId = String(seat.studentId);
        await releaseSeatOfStudent(studentId, ctx.userId);
        await Student.updateOne({ _id: studentId, librarianId: ctx.userId }, { $set: { seatNumber: null } });
        await logAudit({
          action: 'seat.released',
          actorId: ctx.userId,
          actorRole: 'librarian',
          libraryId: ctx.libraryId,
          entity: 'Seat',
          entityId: String(seat._id),
          meta: { seatNumber: seat.seatNumber, studentId },
          request,
        });
      } else if (seat.status !== 'available') {
        await Seat.updateOne({ _id: seat._id }, { $set: { status: 'available' } });
      }
    } else if (body.status) {
      return NextResponse.json(
        { success: false, error: 'Assign a student to reserve a seat — a seat can’t be reserved for nobody.' },
        { status: 400 }
      );
    }

    const $set: Record<string, unknown> = {};
    if (body.notes !== undefined) $set.notes = body.notes || undefined;
    if (body.reservedUntil !== undefined) $set.reservedUntil = body.reservedUntil ? new Date(body.reservedUntil) : null;
    if (Object.keys($set).length) await Seat.updateOne({ _id: seat._id }, { $set });

    const updated = await Seat.findById(seat._id);
    return NextResponse.json({ success: true, message: 'Seat updated', data: updated });
  } catch (error) {
    return handleRouteError(error, 'Failed to update seat', 'Seat PUT');
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { ctx, seat } = await loadSeat(request, params);
    if (!seat) return notFound();

    if (seat.studentId) {
      const holder = await Student.findOne({ _id: seat.studentId, librarianId: ctx.userId }).select('name');
      if (holder) {
        return NextResponse.json(
          { success: false, error: `Seat ${seat.seatNumber} is assigned to ${holder.name}. Release it first.` },
          { status: 409 }
        );
      }
    }

    await seat.deleteOne();
    await logAudit({
      action: 'seat.deleted',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Seat',
      entityId: String(seat._id),
      meta: { seatNumber: seat.seatNumber },
      request,
    });
    return NextResponse.json(successResponse({ id: String(seat._id) }, `Seat ${seat.seatNumber} deleted`));
  } catch (error) {
    return handleRouteError(error, 'Failed to delete seat', 'Seat DELETE');
  }
}
