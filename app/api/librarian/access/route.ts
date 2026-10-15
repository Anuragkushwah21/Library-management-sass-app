// app/api/librarian/access/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { Plan } from '@/lib/models/Plan';
import { SystemSettings } from '@/lib/models/SystemSettings';
import { requireLibrarian } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getAccessInfo, planExpiryFrom } from '@/lib/services/access';
import {
  notifyAdminsOfPendingLibrarian,
  notifyLibrarianOfDecision,
} from '@/lib/services/librarian-review';

export const runtime = 'nodejs';

const USER_FIELDS =
  'name email phone role isApproved createdAt trialEndsAt rejectedAt rejectionReason approvalRequestedAt approvalRequestNote requestedPlan plan planExpiresAt';

function serialize(user: any) {
  return {
    access: getAccessInfo(user),
    user: { name: user.name, email: user.email },
    requestedPlan: user.requestedPlan ?? null,
    plan: user.plan ?? null,
  };
}

/**
 * GET — the librarian's trial/approval status plus the plans they can pick.
 * Works while locked; this is what the request-approval screen runs on.
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = await requireLibrarian(request, { allowLocked: true });
    await connectDB();

    const [user, plans] = await Promise.all([
      User.findById(decoded.userId)
        .select(USER_FIELDS)
        .populate('requestedPlan', 'name price currency durationDays')
        .populate('plan', 'name price currency durationDays'),
      Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean(),
    ]);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({ ...serialize(user), plans }, 'Access status', 200)
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load access status.', 'Access GET');
  }
}

const RequestSchema = z.object({
  planId: z.string().optional().nullable(),
  note: z.string().trim().max(500).optional(),
});

/** POST — send an approval request to the super admin. */
export async function POST(request: NextRequest) {
  try {
    const decoded = await requireLibrarian(request, { allowLocked: true });

    const limited = enforceRateLimit(request, 'librarian:access-request', {
      limit: 5,
      windowMs: 60 * 60 * 1000,
      identifier: decoded.userId,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const { planId, note } = RequestSchema.parse(body);

    const user = await User.findById(decoded.userId).select(USER_FIELDS);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const current = getAccessInfo(user);
    if (current.status === 'pending') {
      return NextResponse.json(
        { success: false, error: 'Your request is already with the admin.' },
        { status: 409 }
      );
    }
    if (current.status === 'active') {
      return NextResponse.json(
        { success: false, error: 'Your account is already approved.' },
        { status: 409 }
      );
    }

    let plan: { _id: unknown; durationDays: number } | null = null;
    if (planId) {
      if (!mongoose.Types.ObjectId.isValid(planId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid plan.' },
          { status: 400 }
        );
      }
      plan = await Plan.findOne({ _id: planId, isActive: true })
        .select('durationDays')
        .lean<{ _id: unknown; durationDays: number }>();
      if (!plan) {
        return NextResponse.json(
          { success: false, error: 'That plan is no longer available.' },
          { status: 400 }
        );
      }
    }

    // A renewal after the plan ran out goes back through approval
    user.isApproved = false;
    user.rejectedAt = undefined;
    user.rejectionReason = undefined;
    user.approvalRequestedAt = new Date();
    user.approvalRequestNote = note || undefined;
    user.requestedPlan = (plan?._id as mongoose.Types.ObjectId) ?? null;

    const settings = await SystemSettings.findOne()
      .select('autoApproveLibrarians')
      .lean<{ autoApproveLibrarians?: boolean }>();
    const autoApprove = Boolean(settings?.autoApproveLibrarians);

    if (autoApprove) {
      user.isApproved = true;
      user.approvedAt = new Date();
      user.plan = user.requestedPlan;
      user.planExpiresAt = planExpiryFrom(plan?.durationDays);
      user.approvalRequestedAt = null;
    }

    await user.save();

    // A failed email must not undo the request — it is in the pending list either way
    if (autoApprove) {
      notifyLibrarianOfDecision(
        { name: user.name, email: user.email },
        true
      ).catch(() => {});
    } else {
      notifyAdminsOfPendingLibrarian(user).catch((err) =>
        console.error('[Access] admin notification failed:', err)
      );
    }

    return NextResponse.json(
      successResponse(
        serialize(user),
        autoApprove
          ? 'Your account has been approved.'
          : 'Request sent. The admin will review it shortly.',
        200
      )
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to send request.', 'Access POST');
  }
}
