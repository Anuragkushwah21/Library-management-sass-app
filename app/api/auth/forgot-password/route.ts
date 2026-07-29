// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { generateOTP, sendOTPEmail } from '@/lib/email-service';

export async function POST(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, 'auth:forgot', {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await req.json();
    const rawEmail = body?.email;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required and must be a string' },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    // Find user
    const user = await User.findOne({ email });

    // Security: always same outward response
    if (!user) {
      return NextResponse.json(
        {
          success: true,
          message: 'If the email exists, a reset code has been sent.',
        },
        { status: 200 }
      );
    }

    // Generate 6-digit reset code
    const otp = generateOTP(6); // e.g. "207077"
    const expiryMinutes = 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Save OTP + expiry in user document
    user.resetPasswordCode = otp;
    user.resetPasswordCodeExpires = expiresAt;
    await user.save();

    // Send email
    const emailResult = await sendOTPEmail({
      recipientEmail: email,
      recipientName: user.name || 'User',
      otp,
      expiryMinutes,
    });

    if (!emailResult.success) {
      console.error(
        '\n[ForgotPassword] EMAIL SEND FAILED — the reset code was saved to the ' +
          'database but never reached the user:\n  ' +
          emailResult.error +
          '\n'
      );

      // Production me generic hi rakho — warna "user exist karta hai ya nahi"
      // response se pata chal jayega. Dev me asli wajah dikhao.
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json(
          {
            success: false,
            error: `Email provider failed: ${emailResult.error}`,
            hint: 'Dev-only detail. Production returns a generic response.',
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: 'If the email exists, a reset code has been sent.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Reset code sent to your email',
        expiresAt,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[ForgotPassword] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}