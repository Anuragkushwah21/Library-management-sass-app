// app/api/auth/send-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { enforceRateLimit } from '@/lib/rate-limit';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { generateOTP, sendOTPEmail } from '@/lib/email-service';

export const runtime = 'nodejs';

const SendOTPSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['verification', 'reset']).default('verification'),
});

const EXPIRY_MINUTES = 10;

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'auth:send-otp', {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const { email, purpose } = SendOTPSchema.parse({
      email: body.email?.trim(),
      purpose: body.purpose ?? 'verification',
    });

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    let otp: string;

    if (purpose === 'reset') {
      // Password reset ka apna field pair hai — wahi /reset-password padhta hai
      otp = generateOTP(6);
      user.resetPasswordCode = otp;
      user.resetPasswordCodeExpires = new Date(
        Date.now() + EXPIRY_MINUTES * 60 * 1000
      );
    } else {
      if (user.isVerified) {
        return NextResponse.json(
          { success: false, error: 'Email already verified' },
          { status: 400 }
        );
      }
      // Model ka helper `otp` + `otpExpiry` set karta hai — wahi /verify-otp
      // padhta hai. (Pehle yahan `user.verificationOTP` set hota tha, jo schema
      // me hai hi nahi — Mongoose use chupchaap drop kar deta tha, isliye OTP
      // kabhi save hi nahi hota tha aur verification hamesha fail hoti thi.)
      otp = user.generateOTP();
    }

    await user.save();

    // Wahi shared Gmail SMTP config jo register/resend-otp use karte hain
    const emailResult = await sendOTPEmail({
      recipientEmail: email,
      recipientName: user.name || 'User',
      otp,
      expiryMinutes: EXPIRY_MINUTES,
    });

    if (!emailResult.success) {
      console.error('[SendOTP] OTP email failed to send:', emailResult.error);
      return NextResponse.json(
        { success: false, error: 'Failed to send OTP email.' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      successResponse({ email, purpose }, 'OTP sent to your email', 200),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to send OTP', 'SendOTP');
  }
}
