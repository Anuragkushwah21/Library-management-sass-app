// app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { handleRouteError } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  try {
    // Reset code brute-force se bachao
    const limited = enforceRateLimit(req, 'auth:reset-password', {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await req.json().catch(() => ({}));

    const parsed = ResetPasswordSchema.parse({
      email: body.email?.trim(),
      code: body.code?.toString().trim(),
      newPassword: body.newPassword,
    });

    const { email, code, newPassword } = parsed;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !user.resetPasswordCode || !user.resetPasswordCodeExpires) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset code.' },
        { status: 400 }
      );
    }

    const savedCode = user.resetPasswordCode.toString().trim();
    const isExpired =
      user.resetPasswordCodeExpires.getTime() < Date.now();

    if (isExpired || !codesMatch(savedCode, code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset code.' },
        { status: 400 }
      );
    }

    // Pre-save hook password ko hash karega
    user.password = newPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordCodeExpires = undefined;

    await user.save();

    return NextResponse.json(
      {
        success: true,
        message: 'Password reset successful.',
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to reset password.', 'ResetPassword');
  }
}
