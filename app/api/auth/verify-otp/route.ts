// app/api/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import { notifyAdminsOfPendingLibrarian } from '@/lib/services/librarian-review';

const VerifyOTPSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'auth:verify-otp', {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json();
    const { email, otp } = VerifyOTPSchema.parse(body);

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // ✅ Check if already verified
    if (user.isVerified) {
      return NextResponse.json(
        successResponse(
          { message: 'Email already verified. You can now login.' },
          'Already verified',
          200
        ),
        { status: 200 }
      );
    }

    // ✅ Verify OTP
    const isValid = user.verifyOTP(otp);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired OTP' },
        { status: 400 }
      );
    }

    // ✅✅ MOST IMPORTANT: Mark email as verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Librarian yahin "pending approval" banta hai (pending list ka filter
    // isVerified: true + isApproved: false hai), isliye admins ko yahan notify
    // karte hain — registration par nahi, warna unverified signups ka spam jayega.
    if (user.role === 'librarian' && !user.isApproved && !user.rejectedAt) {
      // Await nahi karte — email fail hone se verification nahi rukni chahiye
      notifyAdminsOfPendingLibrarian(user).catch((err) =>
        console.error('[VerifyOTP] admin notification failed:', err)
      );
    }

    // ✅ Return success WITHOUT token (user must login separately)
    return NextResponse.json(
      successResponse(
        {
          message: user.role === 'librarian' 
            ? 'Email verified successfully! Your account is pending admin approval. You will be able to login once approved.'
            : 'Email verified successfully! You can now login.',
          email: user.email,
          isVerified: true,
          requiresApproval: user.role === 'librarian' && !user.isApproved,
        },
        'Email verified',
        200
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Verify OTP Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}