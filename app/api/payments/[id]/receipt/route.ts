// app/api/payments/[id]/receipt/route.ts — data for one printable receipt
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { receiptFor } from '@/lib/services/membership';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const receipt = mongoose.Types.ObjectId.isValid(id) ? await receiptFor(ctx.library._id, id) : null;
    if (!receipt) return NextResponse.json({ success: false, error: 'Receipt not found' }, { status: 404 });
    return NextResponse.json(successResponse(receipt));
  } catch (error) {
    return handleRouteError(error, 'Could not load the receipt.', 'Receipt');
  }
}
