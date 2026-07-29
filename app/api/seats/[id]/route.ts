// app/api/seats/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import Seat from '@/lib/models/Seat';
import { Student } from '@/lib/models/Students';
import { Types } from 'mongoose';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// GET /api/seats/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈 IMPORTANT

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid seat ID' },
        { status: 400 }
      );
    }

    const seat = await Seat.findById(id);
    if (!seat) {
      return NextResponse.json(
        { success: false, error: 'Seat not found' },
        { status: 404 }
      );
    }

    if (
      decoded.role === 'librarian' &&
      String(seat.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to access this seat' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: seat });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch seat', 'API');
  }
}

// PUT /api/seats/[id]
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈 IMPORTANT
    const { status, studentId, reservedUntil, notes } = await request.json();

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid seat ID' },
        { status: 400 }
      );
    }

    const currentSeat = await Seat.findById(id);
    if (!currentSeat) {
      return NextResponse.json(
        { success: false, error: 'Seat not found' },
        { status: 404 }
      );
    }

    if (
      decoded.role === 'librarian' &&
      String(currentSeat.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this seat' },
        { status: 403 }
      );
    }

    const updateData: any = {};

    // 1) status change (including release)
    if (status) {
      updateData.status = status;

      if (status === 'available') {
        if (currentSeat.studentId) {
          await Student.findByIdAndUpdate(currentSeat.studentId, {
            $unset: { seatNumber: 1 },
          });
        }
        updateData.studentId = null;
        updateData.studentName = undefined;
        updateData.studentEmail = undefined;
        updateData.reservedDate = null;
        updateData.reservedUntil = null;
      }
    }

    // 2) assign / reserve seat for student
    if (studentId) {
      const student = await Student.findById(studentId);
      if (!student) {
        return NextResponse.json(
          { success: false, error: 'Student not found' },
          { status: 404 }
        );
      }

      updateData.studentId = studentId;
      updateData.studentName = student.name;
      updateData.studentEmail = student.email;
      updateData.status = 'reserved';
      updateData.reservedDate = new Date();
      updateData.reservedUntil = reservedUntil
        ? new Date(reservedUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      (student as any).seatNumber = currentSeat.seatNumber;
      await student.save();
    }

    if (reservedUntil) {
      updateData.reservedUntil = new Date(reservedUntil);
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const seat = await Seat.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!seat) {
      return NextResponse.json(
        { success: false, error: 'Seat not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Seat updated successfully',
      data: seat,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update seat', 'API');
  }
}

// DELETE /api/seats/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈 IMPORTANT

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid seat ID' },
        { status: 400 }
      );
    }

    const seat = await Seat.findById(id);
    if (!seat) {
      return NextResponse.json(
        { success: false, error: 'Seat not found' },
        { status: 404 }
      );
    }

    if (
      decoded.role === 'librarian' &&
      String(seat.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this seat' },
        { status: 403 }
      );
    }

    if (seat.studentId) {
      await Student.findByIdAndUpdate(seat.studentId, {
        $unset: { seatNumber: 1 },
      });
    }

    await Seat.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: 'Seat deleted successfully',
      data: seat,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to delete seat', 'API');
  }
}