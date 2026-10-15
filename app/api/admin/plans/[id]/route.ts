// app/api/admin/plans/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Plan } from '@/lib/models/Plan';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { PlanInputSchema } from '@/lib/validation-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function notFound() {
  return NextResponse.json(
    { success: false, error: 'Plan not found' },
    { status: 404 }
  );
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    await connectDB();
    const data = PlanInputSchema.partial().parse(
      await request.json().catch(() => ({}))
    );
    const plan = await Plan.findByIdAndUpdate(id, { $set: data }, {
      new: true,
      runValidators: true,
    });
    if (!plan) return notFound();

    return NextResponse.json(successResponse(plan, 'Plan updated', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to update plan.', 'Admin Plan PATCH');
  }
}

/**
 * Librarians already on this plan keep their expiry date — it was fixed at
 * approval time — so deleting only removes it from future choices.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    await connectDB();
    const plan = await Plan.findByIdAndDelete(id);
    if (!plan) return notFound();

    return NextResponse.json(successResponse({ id }, 'Plan deleted', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to delete plan.', 'Admin Plan DELETE');
  }
}
