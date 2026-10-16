// app/api/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import { attachSession } from '@/lib/middleware/auth';
import { ensureLibraryForUser } from '@/lib/services/library';
import { notifyAdmins } from '@/lib/services/notify';
import {
  getAccessInfo,
  getTrialDays,
  trialEndFrom,
} from '@/lib/services/access';

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

    // The free trial starts now. Admins are only contacted when the
    // librarian sends an approval request from the dashboard.
    if (user.role === 'librarian' && !user.isApproved && !user.trialEndsAt) {
      user.trialEndsAt = trialEndFrom(new Date(), await getTrialDays());
    }

    await user.save();

    // Each librarian gets their own library (tenant) as soon as they're verified
    if (user.role === 'librarian') {
      await ensureLibraryForUser(String(user._id)).catch((err) =>
        console.error('[VerifyOTP] library setup failed:', err)
      );
      await notifyAdmins({
        section: 'librarians',
        type: 'librarian.signup',
        title: `New librarian signed up: ${user.name}`,
        body: `${user.email} — free trial started`,
        link: '/admin/librarians',
      });
    }

    const access = getAccessInfo(user);

    // Log the user straight in so they land on the dashboard
    const response = NextResponse.json(
      successResponse(
        {
          message: 'Email verified successfully! Welcome aboard.',
          email: user.email,
          isVerified: true,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            role: user.role,
            profileImage: user.profileImage,
            isApproved: user.isApproved,
            isVerified: user.isVerified,
            status: user.status,
            access,
          },
        },
        'Email verified',
        200
      ),
      { status: 200 }
    );

    attachSession(response, user);

    return response;

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