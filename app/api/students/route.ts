// app/api/students/route.ts
import { isPastDate } from '@/lib/date-rules';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { Student } from '@/lib/models/Students';
import { authenticateRequest, libraryIdFor } from '@/lib/middleware/auth';
import { Shift } from '@/lib/models/Shift';
import { normalizePhone } from '@/lib/phone';
import { deriveMemberStatus } from '@/lib/services/student-status';
import { ensureDefaultShift } from '@/lib/services/library';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

// GET /api/students?search=...
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const query: any = {};

    // Multi-tenant: librarian sirf apne students
    if (decoded.role === 'librarian') {
      query.librarianId = userId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search.replace(/\D/g, '') || '^$', $options: 'i' } },
      ];
    }

    const students = await Student.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: students });
  } catch (error) {
    return handleRouteError(error, 'Failed to load students', 'API');
  }
}

// POST /api/students  (add student)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const body = await request.json();
    const {
      name,
      email,
      phone,
      paymentStatus,
      membershipStartDate,
      membershipEndDate,
      address,
      seatNumber,
      shiftId,
    } = body;
    // NOTE: libraryId is never read from the body — it comes from the session

    const libraryId = await libraryIdFor(decoded);

    if (!name || !email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Name, email and phone are required' },
        { status: 400 }
      );
    }

    // Stored as E.164 so the QR check-in can find the student by phone
    const e164 = normalizePhone(phone);
    if (!e164) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid mobile number, e.g. 98765 43210.' },
        { status: 400 }
      );
    }

    let resolvedShiftId: mongoose.Types.ObjectId | null = null;
    if (libraryId) {
      const duplicate = await Student.findOne({
        libraryId,
        phone: e164,
        status: { $ne: 'REJECTED' },
      }).select('name');
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: `${duplicate.name} already uses this phone number.` },
          { status: 409 }
        );
      }

      if (shiftId) {
        const shift = mongoose.Types.ObjectId.isValid(shiftId)
          ? await Shift.findOne({ _id: shiftId, libraryId, isActive: true }).select('_id')
          : null;
        if (!shift) {
          return NextResponse.json({ success: false, error: 'Selected shift not found.' }, { status: 400 });
        }
        resolvedShiftId = shift._id as mongoose.Types.ObjectId;
      } else {
        resolvedShiftId = ((await ensureDefaultShift(libraryId))?._id as mongoose.Types.ObjectId) ?? null;
      }
    }

    // Dates ko safely convert karo
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (membershipStartDate) {
      const d = new Date(membershipStartDate);
      if (!Number.isNaN(d.getTime())) {
        startDate = d;
      }
    }

    if (membershipEndDate) {
      const d = new Date(membershipEndDate);
      if (!Number.isNaN(d.getTime())) {
        endDate = d;
      }
    }

    // Start date may be in the past (existing members); the end date may not
    if (endDate && isPastDate(endDate)) {
      return NextResponse.json(
        { success: false, error: 'Membership end date cannot be in the past' },
        { status: 400 }
      );
    }
    if (startDate && endDate && endDate <= startDate) {
      return NextResponse.json(
        { success: false, error: 'Membership end date must be after the start date' },
        { status: 400 }
      );
    }

    const now = new Date();

    // paymentStatus ka effective value
    const effectivePaymentStatus: 'paid' | 'unpaid' | 'pending' =
      paymentStatus || 'unpaid';

    // membershipStatus auto-calc
    let membershipStatus: 'active' | 'inactive' | 'expired' = 'inactive';

    if (effectivePaymentStatus === 'paid' && endDate) {
      if (endDate.getTime() <= now.getTime()) {
        membershipStatus = 'expired';
      } else {
        membershipStatus = 'active';
      }
    } else {
      membershipStatus = 'inactive';
    }

    const student = await Student.create({
      name,
      email,
      phone: e164,
      phoneRaw: phone,
      status: deriveMemberStatus(null, endDate, now),
      shiftId: resolvedShiftId,
      paymentStatus: effectivePaymentStatus,
      membershipStatus,
      membershipStartDate: startDate,
      membershipEndDate: endDate,
      address,
      libraryId,
      seatNumber: seatNumber ?? null,

      // multi-tenant link
      librarianId: userId,
    });

    return NextResponse.json(
      { success: true, message: 'Student created', data: student },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to create student', 'API');
  }
}