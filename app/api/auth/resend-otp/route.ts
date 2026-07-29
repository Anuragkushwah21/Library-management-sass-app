// app/api/auth/resend-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import { sendOTPEmail } from '@/lib/email-service';

const ResendOTPSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'auth:resend-otp', {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json();
    const { email } = ResendOTPSchema.parse(body);

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (user.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Email already verified' },
        { status: 400 }
      );
    }

    // ✅ Generate new OTP
    const otp = user.generateOTP();
    await user.save();

    // ✅ Send OTP email
    const emailResult = await sendOTPEmail({
      recipientEmail: email,
      recipientName: user.name || 'User',
      otp: otp,
      expiryMinutes: 10,
    });

    if (!emailResult.success) {
      console.error(
        '\n[ResendOTP] OTP EMAIL FAILED:\n  ' + emailResult.error + '\n'
      );

      // Yahan generic rehne ka koi fayda nahi — user ne khud apna email diya
      // hai aur wo already exist karta hai, to enumeration leak ka sawaal nahi.
      return NextResponse.json(
        {
          success: false,
          error: 'Could not send the verification email. Please try again.',
          ...(process.env.NODE_ENV !== 'production'
            ? { detail: emailResult.error }
            : {}),
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      successResponse({
        message: 'OTP sent successfully',
        email: email,
      }, 'OTP resent', 200),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Resend OTP Error]:', error);

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