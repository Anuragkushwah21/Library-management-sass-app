// app/api/transactions/[id]/renew/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/middleware/auth';
import { handleRouteError } from '@/lib/api-response';
import { renewTransaction } from '@/lib/services/transactions';

export const runtime = 'nodejs';

const RenewSchema = z.object({
  days: z.number().int().positive().max(365).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const { id } = await context.params;

    // Body optional hai, warna default renew window use hoti hai
    const rawBody = await request.json().catch(() => ({}));
    const parsed = RenewSchema.safeParse(rawBody);
    const days = parsed.success ? parsed.data.days : undefined;

    const tx = await renewTransaction(
      id,
      { userId: decoded.userId, role: decoded.role },
      days
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Book renewed successfully.',
        data: tx,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Failed to renew book.',
      'Transactions Renew'
    );
  }
}
