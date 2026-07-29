// app/api/admin/librarians/[id]/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';

export const runtime = 'nodejs';

/**
 * Lets an admin mark a librarian's email as verified by hand.
 *
 * Email delivery is never 100% reliable — if the OTP lands in spam or the
 * provider blocks it, the librarian is stuck forever, because the pending list
 * filters on `isVerified: true`. This escape hatch breaks that deadlock. Use it
 * only once the admin has confirmed identity another way — a call, or in
 * person.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(request);

    await connectDB();

    const { id } = await params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid librarian id' },
        { status: 400 }
      );
    }

    const librarian = await User.findById(id);

    if (!librarian || librarian.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Librarian not found' },
        { status: 404 }
      );
    }

    if (librarian.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Email is already verified' },
        { status: 409 }
      );
    }

    librarian.isVerified = true;
    // The pending OTP is now useless — don't leave it lying around
    librarian.otp = undefined;
    librarian.otpExpiry = undefined;
    await librarian.save();

    console.log(
      `[AdminVerify] ${admin.email} manually verified ${librarian.email}`
    );

    return NextResponse.json(
      successResponse(
        {
          id: librarian._id,
          email: librarian.email,
          isVerified: true,
        },
        `${librarian.name}'s email is marked verified — you can approve them now`,
        200
      ),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to verify librarian.', 'AdminVerify');
  }
}
