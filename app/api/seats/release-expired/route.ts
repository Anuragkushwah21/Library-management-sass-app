// app/api/seats/release-expired/route.ts — free every seat held by an expired/blocked student
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Student } from '@/lib/models/Students';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { listSeatsWithState } from '@/lib/services/seat-view';
import { releaseSeatOfStudent } from '@/lib/services/seats';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const expired = (await listSeatsWithState(ctx.userId, ctx.libraryId)).filter((s) => s.state === 'expired');

    const released: number[] = [];
    for (const seat of expired) {
      const studentId = String(seat.student!._id);
      await releaseSeatOfStudent(studentId, ctx.userId);
      // Also record the expiry on the student, so lists and QR agree
      await Student.updateOne(
        { _id: studentId, librarianId: ctx.userId },
        {
          $set: {
            seatNumber: null,
            ...(seat.student!.status === 'EXPIRED' ? { status: 'EXPIRED', membershipStatus: 'expired' } : {}),
          },
        }
      );
      released.push(seat.seatNumber);
      await logAudit({
        action: 'seat.released',
        actorId: ctx.userId,
        actorRole: 'librarian',
        libraryId: ctx.libraryId,
        entity: 'Seat',
        entityId: String(seat._id),
        meta: { seatNumber: seat.seatNumber, studentId, reason: 'expired' },
        request,
      });
    }

    return NextResponse.json(
      successResponse(
        { released },
        released.length ? `Freed ${released.length} seat${released.length === 1 ? '' : 's'}` : 'No expired seats to free'
      )
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to free expired seats', 'Seats release-expired');
  }
}
