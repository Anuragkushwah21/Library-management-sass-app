// app/api/students/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { Student } from '@/lib/models/Students';
import { Types } from 'mongoose';
import { authenticateRequest } from '@/lib/middleware/auth';
import { releaseSeatOfStudent, setStudentSeat } from '@/lib/services/seats';

export const runtime = 'nodejs';

// GET /api/students/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈 params ko await karo

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid student ID' },
        { status: 400 }
      );
    }

    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apne students dekh sakta
    if (
      decoded.role === 'librarian' &&
      String(student.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to access this student' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: student });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch student', 'API');
  }
}

// PUT /api/students/[id]  (edit/update)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈
    const body = await request.json();

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid student ID' },
        { status: 400 }
      );
    }

    const existingStudent = await Student.findById(id);
    if (!existingStudent) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apne student update kar sakta
    if (
      decoded.role === 'librarian' &&
      String(existingStudent.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this student' },
        { status: 403 }
      );
    }

    const updateData: any = {};
    const {
      name,
      email,
      phone,
      paymentStatus,
      membershipEndDate,
      seatNumber,
    } = body;

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;

    // paymentStatus + membershipStatus tie
    if (paymentStatus !== undefined) {
      updateData.paymentStatus = paymentStatus;

      if (paymentStatus === 'paid') {
        updateData.membershipStatus = 'active';
      } else if (paymentStatus === 'unpaid' || paymentStatus === 'pending') {
        updateData.membershipStatus = 'inactive';
      }
    }

    if (membershipEndDate !== undefined) {
      updateData.membershipEndDate = membershipEndDate
        ? new Date(membershipEndDate)
        : null;
    }

    // NOTE: seatNumber ko yahan updateData me mat daalo.
    //
    // Seat student ke paas hi rehni chahiye jab tak use explicitly badla ya
    // student hataya na jaye. Membership renew ya payment status update par
    // seat nahi chhinni chahiye — isliye seat sirf tab touch hoti hai jab
    // request me `seatNumber` key actually maujood ho.
    const seatExplicitlyProvided = Object.prototype.hasOwnProperty.call(
      body,
      'seatNumber'
    );

    const student = await Student.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    if (seatExplicitlyProvided) {
      const parsedSeat =
        seatNumber === null || seatNumber === '' ? null : Number(seatNumber);

      if (parsedSeat !== null && Number.isNaN(parsedSeat)) {
        return NextResponse.json(
          { success: false, error: 'Invalid seat number' },
          { status: 400 }
        );
      }

      // Seat + Student dono ek saath sync hote hain
      await setStudentSeat({
        studentId: String(student._id),
        seatNumber: parsedSeat,
        librarianId: String(existingStudent.librarianId),
      });
    }

    const fresh = await Student.findById(id);

    return NextResponse.json({
      success: true,
      message: 'Student updated',
      data: fresh,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update student', 'API');
  }
}

// DELETE /api/students/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid student ID' },
        { status: 400 }
      );
    }

    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apne student delete kar sakta
    if (
      decoded.role === 'librarian' &&
      String(student.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this student' },
        { status: 403 }
      );
    }

    // Seat pehle chhodo, warna Seat doc ek delete ho chuke student ko point
    // karta rehta hai aur wo seat kabhi dobara assign nahi ho paati
    const freedSeat = await releaseSeatOfStudent(
      id,
      String(student.librarianId)
    );

    await Student.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: freedSeat
        ? `Student deleted, seat ${freedSeat} is now available`
        : 'Student deleted',
      data: student,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to delete student', 'API');
  }
}