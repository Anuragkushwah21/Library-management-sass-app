// app/api/admin/qr-access/[libraryId]/credits/route.ts — add or correct SMS credits
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireAdmin } from '@/lib/middleware/auth';
import { adminAddCredits } from '@/lib/services/qr-access';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ libraryId: string }> };

const Body = z.object({
  credits: z
    .number()
    .int('Credits must be a whole number.')
    .refine((n) => n !== 0, 'Enter a number of credits.')
    .refine((n) => Math.abs(n) <= 100_000, 'At most 100000 credits at a time.'),
  note: z.string().trim().min(3, 'Add a short note, e.g. "Paid ₹500 by UPI".').max(300),
  requestId: z.string().min(8).max(64),
});

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin(request);
    await connectDB();
    const { libraryId } = await params;
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return NextResponse.json({ success: false, error: 'Library not found' }, { status: 404 });
    }
    const b = Body.parse(await request.json().catch(() => ({})));
    const result = await adminAddCredits({ libraryId, actorId: admin.userId, ...b });
    return NextResponse.json(
      successResponse(result, b.credits > 0 ? `${b.credits} credits added` : `${-b.credits} credits removed`)
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to update credits.', 'Admin credits');
  }
}
