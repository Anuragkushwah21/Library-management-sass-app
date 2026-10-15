// app/api/admin/ads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Advertisement } from '@/lib/models/Advertisement';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { AD_NO_ACTION_ERROR, AdInputSchema, adHasAction } from '@/lib/validation-admin';
import { isPastDate, sameDay } from '@/lib/date-rules';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function notFound() {
  return NextResponse.json(
    { success: false, error: 'Ad not found' },
    { status: 404 }
  );
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    await connectDB();
    const data = AdInputSchema.partial().parse(
      await request.json().catch(() => ({}))
    );
    // A saved date may already be past (e.g. a running ad's start); a changed one may not
    const current = await Advertisement.findById(id)
      .select('startsAt endsAt linkUrl phone whatsapp email')
      .lean<{
        startsAt?: Date | null;
        endsAt?: Date | null;
        linkUrl?: string;
        phone?: string;
        whatsapp?: string;
        email?: string;
      }>();
    if (!current) return notFound();

    // Only checked when this update touches the button fields — toggling an old
    // button-less ad off must still work
    const touchesActions = ['linkUrl', 'phone', 'whatsapp', 'email'].some((k) => k in data);
    if (touchesActions && !adHasAction({ ...current, ...data })) {
      return NextResponse.json(
        { success: false, error: AD_NO_ACTION_ERROR },
        { status: 400 }
      );
    }
    const changedToPast = (next: Date | null | undefined, saved?: Date | null) =>
      next !== undefined && isPastDate(next) && !sameDay(next, saved);
    if (changedToPast(data.startsAt, current.startsAt) || changedToPast(data.endsAt, current.endsAt)) {
      return NextResponse.json(
        { success: false, error: 'Ad dates cannot be in the past' },
        { status: 400 }
      );
    }

    const ad = await Advertisement.findByIdAndUpdate(id, { $set: data }, {
      new: true,
      runValidators: true,
    });
    if (!ad) return notFound();

    return NextResponse.json(successResponse(ad, 'Ad updated', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to update ad.', 'Admin Ad PATCH');
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return notFound();

    await connectDB();
    const ad = await Advertisement.findByIdAndDelete(id);
    if (!ad) return notFound();

    return NextResponse.json(successResponse({ id }, 'Ad deleted', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to delete ad.', 'Admin Ad DELETE');
  }
}
