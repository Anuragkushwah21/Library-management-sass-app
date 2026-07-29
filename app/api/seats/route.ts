// app/api/seats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import Seat from '@/lib/models/Seat';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// GET /api/seats?status=available|reserved|occupied
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    const query: any = {};

    // Multi-tenant filter: librarian sirf apne seats
    if (decoded.role === 'librarian') {
      query.librarianId = userId;
    }

    if (status && ['available', 'reserved', 'occupied'].includes(status)) {
      query.status = status;
    }

    const seats = await Seat.find(query).sort({ seatNumber: 1 });

    return NextResponse.json({ success: true, data: seats });
  } catch (error) {
    return handleRouteError(error, 'Failed to load seats', 'API');
  }
}

// POST /api/seats (add seat)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { seatNumber, status, notes } = await request.json();

    if (!seatNumber || typeof seatNumber !== 'number' || seatNumber <= 0) {
      return NextResponse.json(
        { success: false, error: 'Seat number must be a positive number' },
        { status: 400 }
      );
    }

    // Per-librarian unique seat number
    const existing = await Seat.findOne({
      seatNumber,
      librarianId: userId,
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Seat ${seatNumber} already exists for this librarian`,
        },
        { status: 400 }
      );
    }

    const seat = await Seat.create({
      seatNumber,
      status: status || 'available',
      notes: notes || undefined,
      librarianId: userId,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Seat created successfully',
        data: seat,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API] Error creating seat:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Seat number must be unique per librarian. This seat already exists.',
        },
        { status: 400 }
      );
    }

    return handleRouteError(error, 'Failed to create seat', 'API');
  }
}