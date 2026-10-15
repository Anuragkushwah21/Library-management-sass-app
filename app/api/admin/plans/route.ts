// app/api/admin/plans/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Plan } from '@/lib/models/Plan';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { PlanInputSchema } from '@/lib/validation-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    await connectDB();
    const plans = await Plan.find().sort({ sortOrder: 1, price: 1 }).lean();
    return NextResponse.json(successResponse(plans, 'Plans fetched', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to load plans.', 'Admin Plans GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    await connectDB();
    const data = PlanInputSchema.parse(await request.json().catch(() => ({})));
    const plan = await Plan.create(data);
    return NextResponse.json(successResponse(plan, 'Plan created', 201), {
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to create plan.', 'Admin Plans POST');
  }
}
