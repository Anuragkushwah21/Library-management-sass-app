// app/api/plans/route.ts
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Plan } from '@/lib/models/Plan';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { getTrialDays } from '@/lib/services/access';

export const runtime = 'nodejs';

/** Public: active plans and the trial length, for pricing pages. */
export async function GET() {
  try {
    await connectDB();
    const [plans, trialDays] = await Promise.all([
      Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean(),
      getTrialDays(),
    ]);
    return NextResponse.json(
      successResponse({ plans, trialDays }, 'Plans fetched', 200)
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load plans.', 'Plans GET');
  }
}
