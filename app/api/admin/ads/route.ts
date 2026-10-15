// app/api/admin/ads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Advertisement } from '@/lib/models/Advertisement';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { AD_NO_ACTION_ERROR, AdInputSchema, adHasAction } from '@/lib/validation-admin';
import { isPastDate } from '@/lib/date-rules';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    await connectDB();
    const ads = await Advertisement.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return NextResponse.json(successResponse(ads, 'Ads fetched', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to load ads.', 'Admin Ads GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    await connectDB();
    const data = AdInputSchema.parse(await request.json().catch(() => ({})));
    if (!adHasAction(data)) {
      return NextResponse.json(
        { success: false, error: AD_NO_ACTION_ERROR },
        { status: 400 }
      );
    }
    if (isPastDate(data.startsAt) || isPastDate(data.endsAt)) {
      return NextResponse.json(
        { success: false, error: 'Ad dates cannot be in the past' },
        { status: 400 }
      );
    }
    const ad = await Advertisement.create(data);
    return NextResponse.json(successResponse(ad, 'Ad created', 201), {
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to create ad.', 'Admin Ads POST');
  }
}
