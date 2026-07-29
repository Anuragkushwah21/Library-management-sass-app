// app/api/transactions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/middleware/auth';
import { handleRouteError } from '@/lib/api-response';
import { renewTransaction, returnTransaction } from '@/lib/services/transactions';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  action: z.enum(['return', 'renew']),
  notes: z.string().max(1000).optional(),
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

    const body = await request.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { action, notes, days } = parsed.data;
    const actor = { userId: decoded.userId, role: decoded.role };

    if (action === 'return') {
      const tx = await returnTransaction(id, actor, notes);
      return NextResponse.json(
        { success: true, message: 'Book marked as returned.', data: tx },
        { status: 200 }
      );
    }

    const tx = await renewTransaction(id, actor, days);
    return NextResponse.json(
      { success: true, message: 'Book renewed successfully.', data: tx },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Failed to update transaction.',
      'Transactions PATCH'
    );
  }
}
