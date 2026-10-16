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
import { expireDemos } from '@/lib/services/demo';
import { Attendance } from '@/lib/models/Attendance';
import { notifyLibrary } from '@/lib/services/notify';
import mongoose from 'mongoose';
import { Membership } from '@/lib/models/Membership';
import { Library } from '@/lib/models/Library';
import { feeSummaries, recordJoiningFee } from '@/lib/services/membership';

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
      // Keep the lists honest without waiting for the cron: finished demos
      // move to DEMO_ENDED (seat freed), lapsed members to EXPIRED (R4)
      const libraryId = await libraryIdFor(decoded);
      if (libraryId) {
        await expireDemos(libraryId, userId);
        const lapsed = await Student.find({
          libraryId,
          status: 'ACTIVE_MEMBER',
          membershipEndDate: { $lt: new Date() },
        }).select('name seatNumber');
        for (const st of lapsed) {
          const res = await Student.updateOne(
            { _id: st._id, status: 'ACTIVE_MEMBER' },
            { $set: { status: 'EXPIRED', membershipStatus: 'expired' } }
          );
          if (res.modifiedCount) {
            await notifyLibrary(libraryId, {
              section: 'students',
              type: 'membership.expired',
              title: `Membership expired: ${st.name}`,
              body: st.seatNumber ? `Still holding seat ${st.seatNumber} — renew or free it.` : 'Renew to keep them in All Students.',
              link: '/librarian/students?tab=expired',
            });
          }
        }
      }
    }

    const status = searchParams.get('status');
    if (status && /^[A-Z_]+(,[A-Z_]+)*$/.test(status)) query.status = { $in: status.split(',') };
    query.archivedAt = null;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search.replace(/\D/g, '') || '^$', $options: 'i' } },
      ];
    }

    // Fees Due list: students with any unpaid balance
    const ownLibraryId = decoded.role === 'librarian' ? await libraryIdFor(decoded) : null;
    if (searchParams.get('due') === '1' && ownLibraryId) {
      const owing = await Membership.distinct('studentId', { libraryId: ownLibraryId, status: { $ne: 'CANCELLED' }, dueAmount: { $gt: 0 } });
      query._id = { $in: owing };
    }

    const found = await Student.find(query).sort({ createdAt: -1 });
    // Each row carries its fee totals: { fee, paid, due } (null = no fee recorded yet)
    const fees = ownLibraryId ? await feeSummaries(ownLibraryId, found.map((st) => st._id)) : new Map();
    const students = found.map((st) => ({ ...st.toObject(), fees: fees.get(String(st._id)) ?? null }));

    // Demo lists show how often each student came and when they last did
    if (searchParams.get('withStats') === '1' && students.length) {
      const stats = await Attendance.aggregate([
        { $match: { studentId: { $in: students.map((st) => st._id) }, arrivalStatus: { $ne: 'ABSENT' } } },
        { $group: { _id: '$studentId', count: { $sum: 1 }, last: { $max: '$date' } } },
      ]);
      const byId = new Map(stats.map((x: any) => [String(x._id), x]));
      const data = students.map((st) => {
        const x = byId.get(String(st._id));
        return { ...st, attendanceCount: x?.count ?? 0, lastVisit: x?.last ?? null };
      });
      return NextResponse.json({ success: true, data });
    }

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

    // Optional joining fee (Add Member): validated before anything is saved
    const hasFee = body.fee !== undefined && body.fee !== null && body.fee !== '';
    const fee = hasFee ? Number(body.fee) : 0;
    const paidNow = hasFee ? Number(body.paidAmount ?? 0) : 0;
    const method = ['CASH', 'UPI', 'BANK_TRANSFER'].includes(body.method) ? body.method : 'CASH';
    if (hasFee) {
      if (!Number.isInteger(fee) || fee <= 0) {
        return NextResponse.json({ success: false, error: 'Fee must be a whole amount in rupees.' }, { status: 400 });
      }
      if (!Number.isInteger(paidNow) || paidNow < 0) {
        return NextResponse.json({ success: false, error: 'Paid amount must be a whole amount in rupees.' }, { status: 400 });
      }
      if (paidNow > fee) {
        return NextResponse.json({ success: false, error: 'Paid amount can’t be more than the fee.' }, { status: 400 });
      }
    }
    // NOTE: libraryId is never read from the body — it comes from the session

    const libraryId = await libraryIdFor(decoded);

    if (typeof email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    }

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

      // One email registers once per library (schema lowercases the query)
      const sameEmail = await Student.findOne({
        libraryId,
        email: String(email),
        status: { $ne: 'REJECTED' },
      }).select('name');
      if (sameEmail) {
        return NextResponse.json(
          { success: false, error: `This email is already registered to ${sameEmail.name}.` },
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

    // With a fee, payment status comes from the amounts; validity from the dates
    const effectivePaymentStatus: 'paid' | 'unpaid' | 'pending' = hasFee
      ? paidNow >= fee
        ? 'paid'
        : paidNow > 0
        ? 'pending'
        : 'unpaid'
      : paymentStatus || 'unpaid';

    // membershipStatus auto-calc
    let membershipStatus: 'active' | 'inactive' | 'expired' = 'inactive';

    if ((effectivePaymentStatus === 'paid' || hasFee) && endDate) {
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

    let payment = null;
    if (hasFee) {
      try {
        const library = await Library.findById(libraryId);
        if (!library) throw new Error('Library not found');
        const result = await recordJoiningFee({
          library,
          actorId: userId,
          student,
          input: {
            planName: typeof body.planName === 'string' ? body.planName : null,
            fee,
            paidAmount: paidNow,
            method,
            reference: typeof body.reference === 'string' ? body.reference.trim().slice(0, 80) : undefined,
            requestId: typeof body.requestId === 'string' && body.requestId.length >= 8 ? body.requestId.slice(0, 64) : `join-${student._id}`,
          },
        });
        payment = result.payment;
      } catch (err) {
        // Never leave a member behind without the fee the librarian entered
        await Student.deleteOne({ _id: student._id });
        throw err;
      }
    }

    return NextResponse.json(
      { success: true, message: 'Student created', data: student, payment },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to create student', 'API');
  }
}