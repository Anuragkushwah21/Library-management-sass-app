// app/api/checkin/[slug]/otp/verify/route.ts — public; sets the student session
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { libraryFromQr } from '@/lib/services/library';
import { verifyStudentOtp } from '@/lib/services/student-otp';
import { normalizePhone } from '@/lib/phone';
import { setStudentSession } from '@/lib/student-session';

export const runtime = 'nodejs';

const Body = z.object({
  k: z.string(),
  phone: z.string().max(30),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const limited = enforceRateLimit(request, 'checkin:otp-verify', { limit: 60, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;

    await connectDB();
    const { slug } = await params;
    const { k, phone, code } = Body.parse(await request.json().catch(() => ({})));
    const library = await libraryFromQr(slug, k);

    const e164 = normalizePhone(phone);
    if (!e164) {
      return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });
    }

    await verifyStudentOtp(library, e164, code);

    const res = NextResponse.json(successResponse({ verified: true }, 'Verified'));
    setStudentSession(res, String(library._id), e164);
    return res;
  } catch (error) {
    return handleRouteError(error, 'Could not verify the code.', 'Checkin OTP verify');
  }
}
