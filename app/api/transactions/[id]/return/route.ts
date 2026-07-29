// app/api/transactions/[id]/return/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/middleware/auth';
import { handleRouteError } from '@/lib/api-response';
import { returnTransaction } from '@/lib/services/transactions';

export const runtime = 'nodejs';

const ReturnSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const { id } = await context.params;

    // Body optional hai
    const rawBody = await request.json().catch(() => ({}));
    const parsed = ReturnSchema.safeParse(rawBody);
    const notes = parsed.success ? parsed.data.notes : undefined;

    const tx = await returnTransaction(
      id,
      { userId: decoded.userId, role: decoded.role },
      notes
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Book marked as returned.',
        data: tx,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Failed to return book.',
      'Transactions Return'
    );
  }
}
