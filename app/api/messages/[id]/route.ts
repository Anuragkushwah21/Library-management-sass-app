// app/api/messages/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Message } from '@/lib/models/Message';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError } from '@/lib/api-response';

export const runtime = 'nodejs';

const UpdateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    // Sirf admin message ka status badal sakta hai
    await requireAdmin(request);

    const { id } = await context.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid message id.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = UpdateStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid status.' },
        { status: 400 }
      );
    }

    const updated = await Message.findByIdAndUpdate(
      id,
      { status: parsed.data.status },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Message not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Message status updated.',
        data: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to update message.', 'Messages PATCH');
  }
}
