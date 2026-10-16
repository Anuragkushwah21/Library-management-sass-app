// app/api/students/[id]/route.ts
import { Membership } from '@/lib/models/Membership';
import { normalizePhone } from '@/lib/phone';
import { deriveMemberStatus } from '@/lib/services/student-status';
import { Shift } from '@/lib/models/Shift';
import { isPastDate, sameDay } from '@/lib/date-rules';
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
      shiftId,
      blocked,
    } = body;

    if (name !== undefined) updateData.name = name;
    if (email !== undefined && String(email).trim().toLowerCase() !== existingStudent.email) {
      const clean = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
      }
      if (existingStudent.libraryId) {
        const taken = await Student.findOne({
          _id: { $ne: existingStudent._id },
          libraryId: existingStudent.libraryId,
          email: clean,
          status: { $ne: 'REJECTED' },
        }).select('name');
        if (taken) {
          return NextResponse.json(
            { success: false, error: `This email is already registered to ${taken.name}.` },
            { status: 409 }
          );
        }
      }
      updateData.email = clean;
    }
    if (phone !== undefined && phone !== existingStudent.phone) {
      const e164 = normalizePhone(phone);
      if (!e164) {
        return NextResponse.json(
          { success: false, error: 'Enter a valid mobile number, e.g. 98765 43210.' },
          { status: 400 }
        );
      }
      if (e164 !== existingStudent.phone && existingStudent.libraryId) {
        const taken = await Student.findOne({
          _id: { $ne: existingStudent._id },
          libraryId: existingStudent.libraryId,
          phone: e164,
          status: { $ne: 'REJECTED' },
        }).select('name');
        if (taken) {
          return NextResponse.json(
            { success: false, error: `${taken.name} already uses this phone number.` },
            { status: 409 }
          );
        }
      }
      updateData.phone = e164;
      updateData.phoneRaw = phone;
    }

    if (shiftId !== undefined && existingStudent.libraryId) {
      const shift = Types.ObjectId.isValid(shiftId)
        ? await Shift.findOne({ _id: shiftId, libraryId: existingStudent.libraryId }).select('_id')
        : null;
      if (!shift) {
        return NextResponse.json({ success: false, error: 'Selected shift not found.' }, { status: 400 });
      }
      updateData.shiftId = shift._id;
    }

    // Block / unblock (QR check-in shows "access denied" while blocked)
    if (blocked === true) updateData.status = 'BLOCKED';
    if (blocked === false && existingStudent.status === 'BLOCKED') {
      updateData.status = deriveMemberStatus(null, membershipEndDate ?? existingStudent.membershipEndDate);
    }

    // paymentStatus + membershipStatus tie — only for students without fee
    // records; once fees are tracked the status is derived from what's owed
    const tracksFees = paymentStatus !== undefined && (await Membership.exists({ studentId: existingStudent._id, status: { $ne: 'CANCELLED' } }));
    if (paymentStatus !== undefined && !tracksFees) {
      updateData.paymentStatus = paymentStatus;

      if (paymentStatus === 'paid') {
        updateData.membershipStatus = 'active';
      } else if (paymentStatus === 'unpaid' || paymentStatus === 'pending') {
        updateData.membershipStatus = 'inactive';
      }
    }

    if (membershipEndDate !== undefined) {
      // An unchanged saved date may already be past; a newly set one may not
      if (
        membershipEndDate &&
        !sameDay(membershipEndDate, existingStudent.membershipEndDate) &&
        isPastDate(membershipEndDate)
      ) {
        return NextResponse.json(
          { success: false, error: 'Membership end date cannot be in the past' },
          { status: 400 }
        );
      }
      updateData.membershipEndDate = membershipEndDate
        ? new Date(membershipEndDate)
        : null;
    }

    // Renewing (or shortening) the membership moves ACTIVE_MEMBER ⇄ EXPIRED
    if (updateData.membershipEndDate !== undefined && updateData.status === undefined) {
      updateData.status = deriveMemberStatus(existingStudent.status, updateData.membershipEndDate);
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