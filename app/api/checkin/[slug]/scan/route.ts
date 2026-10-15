// app/api/checkin/[slug]/scan/route.ts — the scan itself (needs a student session)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { libraryFromQr } from '@/lib/services/library';
import { scan } from '@/lib/services/checkin';
import { readStudentSession } from '@/lib/student-session';

export const runtime = 'nodejs';

const Body = z.object({
  k: z.string(),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
});

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const limited = enforceRateLimit(request, 'checkin:scan', { limit: 60, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;

    await connectDB();
    const { slug } = await params;
    const { k, location } = Body.parse(await request.json().catch(() => ({})));
    const library = await libraryFromQr(slug, k);

    const session = readStudentSession(request, String(library._id));
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Please verify your phone number first.', code: 'SESSION_REQUIRED' },
        { status: 401 }
      );
    }

    const result = await scan({ library, phone: session.phone, location: location ?? null });
    return NextResponse.json(successResponse(result));
  } catch (error) {
    return handleRouteError(error, 'Could not record your scan. Please try again.', 'Checkin scan');
  }
}
