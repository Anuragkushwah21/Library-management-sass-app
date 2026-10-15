// app/api/checkin/[slug]/otp/send/route.ts — public, rate-limited
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { libraryFromQr } from '@/lib/services/library';
import { sendStudentOtp } from '@/lib/services/student-otp';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';

const Body = z.object({ k: z.string(), phone: z.string().max(30) });

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    // First line of defence per IP; per-phone and per-library limits live in the DB
    const limited = enforceRateLimit(request, 'checkin:otp-send', { limit: 30, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;

    await connectDB();
    const { slug } = await params;
    const { k, phone } = Body.parse(await request.json().catch(() => ({})));
    const library = await libraryFromQr(slug, k);

    const e164 = normalizePhone(phone);
    if (!e164) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid mobile number, e.g. 98765 43210.' },
        { status: 400 }
      );
    }

    const result = await sendStudentOtp(library, e164);
    return NextResponse.json(successResponse(result, 'Code sent'));
  } catch (error) {
    return handleRouteError(error, 'Could not send the code.', 'Checkin OTP send');
  }
}
