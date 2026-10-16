// app/api/seats/route.ts — the librarian's seats
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import Seat from '@/lib/models/Seat';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { listSeatsWithState } from '@/lib/services/seat-view';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

const MAX_BULK = 500;

// GET /api/seats?status=available — every seat with its live state
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    let seats = await listSeatsWithState(ctx.userId, ctx.libraryId);

    // ?status=available is used by the add/edit student forms
    const status = request.nextUrl.searchParams.get('status');
    if (status === 'available') seats = seats.filter((s) => s.state === 'available');
    else if (status) seats = seats.filter((s) => s.status === status);

    return NextResponse.json({ success: true, data: seats });
  } catch (error) {
    return handleRouteError(error, 'Failed to load seats', 'Seats GET');
  }
}

const seatNo = z.coerce.number().int().min(1, 'Seat numbers start at 1').max(9999);
const CreateSchema = z.union([
  z.object({ from: seatNo, to: seatNo, notes: z.string().trim().max(200).optional() }),
  z.object({ seatNumber: seatNo, notes: z.string().trim().max(200).optional() }),
]);

// POST /api/seats — one seat {seatNumber} or a range {from, to}
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const data = CreateSchema.parse(await request.json().catch(() => ({})));

    const [from, to] = 'from' in data ? [Math.min(data.from, data.to), Math.max(data.from, data.to)] : [data.seatNumber, data.seatNumber];
    if (to - from + 1 > MAX_BULK) {
      return NextResponse.json(
        { success: false, error: `Add at most ${MAX_BULK} seats at a time.` },
        { status: 400 }
      );
    }

    const wanted = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const existing = new Set(
      (await Seat.find({ librarianId: ctx.userId, seatNumber: { $in: wanted } }).select('seatNumber').lean<any[]>()).map(
        (s) => s.seatNumber
      )
    );
    const toCreate = wanted.filter((n) => !existing.has(n));

    if (toCreate.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: wanted.length === 1 ? `Seat ${from} already exists.` : `Seats ${from}–${to} already exist.`,
        },
        { status: 409 }
      );
    }

    // New seats are always free — "occupied" comes from real check-ins
    await Seat.insertMany(
      toCreate.map((seatNumber) => ({
        seatNumber,
        status: 'available',
        notes: 'notes' in data ? data.notes || undefined : undefined,
        librarianId: ctx.userId,
        libraryId: ctx.libraryId,
      })),
      { ordered: false }
    ).catch((err) => {
      // A concurrent request created some of them — fine, they exist
      if (err?.code !== 11000 && !err?.writeErrors?.every((e: any) => (e.code ?? e.err?.code) === 11000)) throw err;
    });

    await logAudit({
      action: 'seat.created',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Seat',
      meta: { created: toCreate.length, from, to },
      request,
    });

    const skipped = wanted.length - toCreate.length;
    return NextResponse.json(
      successResponse(
        { created: toCreate.length, skipped },
        toCreate.length === 1 && skipped === 0
          ? `Seat ${toCreate[0]} added`
          : `${toCreate.length} seat${toCreate.length === 1 ? '' : 's'} added${skipped ? `, ${skipped} already existed` : ''}`,
        201
      ),
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to create seat', 'Seats POST');
  }
}
