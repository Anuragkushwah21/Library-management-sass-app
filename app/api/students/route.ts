// app/api/students/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { Student } from '@/lib/models/Students';
import { authenticateRequest } from '@/lib/middleware/auth';

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
      libraryId, // optional, agar tum use kar rahe ho to rehne do
      seatNumber,
    } = body;

    if (!name || !email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Name, email and phone are required' },
        { status: 400 }
      );
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
      phone,
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