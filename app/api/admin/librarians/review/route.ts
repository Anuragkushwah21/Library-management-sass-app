// app/api/admin/librarians/review/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { verifyReviewToken } from '@/lib/review-token';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  applyApproval,
  applyRejection,
  notifyLibrarianOfDecision,
} from '@/lib/services/librarian-review';

export const runtime = 'nodejs';

/**
 * Token-backed approve/reject for an admin arriving from email.
 *
 * GET  — returns the librarian's details only. NO side effects, because mail
 *        clients and security scanners prefetch links — if approve happened on
 *        GET, a scanner would approve the account by itself.
 * POST — the real action, triggered only by the review page's buttons.
 */

async function resolveLibrarian(token: string | null) {
  if (!token) {
    return { error: 'Missing review token.', status: 400 as const };
  }

  const payload = verifyReviewToken(token);
  if (!payload) {
    return {
      error: 'This review link is invalid or has expired. Please use the admin dashboard.',
      status: 401 as const,
    };
  }

  if (!mongoose.Types.ObjectId.isValid(payload.librarianId)) {
    return { error: 'Invalid librarian reference.', status: 400 as const };
  }

  const librarian = await User.findById(payload.librarianId).select(
    'name email phone role isVerified isApproved rejectedAt rejectionReason createdAt requestedPlan approvalRequestedAt approvalRequestNote planExpiresAt'
  ).populate('requestedPlan', 'name price currency durationDays');

  if (!librarian || librarian.role !== 'librarian') {
    return { error: 'Librarian not found.', status: 404 as const };
  }

  return { librarian };
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const token = request.nextUrl.searchParams.get('token');
    const resolved = await resolveLibrarian(token);

    if ('error' in resolved) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }

    const l = resolved.librarian;

    // Already decided? Tell the UI so it can hide the buttons. An expired
    // plan counts as undecided — that is a renewal waiting for review.
    const planActive = !l.planExpiresAt || l.planExpiresAt > new Date();
    const decided =
      l.isApproved && planActive
        ? 'approved'
        : l.rejectedAt
        ? 'rejected'
        : null;

    return NextResponse.json(
      successResponse(
        {
          librarian: {
            id: l._id,
            name: l.name,
            email: l.email,
            phone: l.phone,
            isVerified: l.isVerified,
            createdAt: l.createdAt,
            requestedPlan: l.requestedPlan ?? null,
            approvalRequestNote: l.approvalRequestNote ?? null,
          },
          decided,
          rejectionReason: l.rejectionReason,
        },
        'Librarian fetched',
        200
      ),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load application.', 'Review GET');
  }
}

const ActionSchema = z.object({
  token: z.string().min(10),
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'librarian:review', {
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const { token, action, reason } = ActionSchema.parse(body);

    const resolved = await resolveLibrarian(token);
    if ('error' in resolved) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }

    const librarian = resolved.librarian;

    if (!librarian.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Librarian has not verified their email yet.' },
        { status: 400 }
      );
    }

    // Two admins may act on the same email — don't process it twice
    const planActive =
      !librarian.planExpiresAt || librarian.planExpiresAt > new Date();
    if (librarian.isApproved && planActive && action === 'approve') {
      return NextResponse.json(
        { success: false, error: 'This librarian is already approved.' },
        { status: 409 }
      );
    }
    if (librarian.rejectedAt && action === 'reject') {
      return NextResponse.json(
        { success: false, error: 'This librarian is already rejected.' },
        { status: 409 }
      );
    }

    if (action === 'approve') {
      // The email link approves on the plan the librarian asked for
      await applyApproval(librarian);
    } else {
      applyRejection(librarian, reason);
    }

    await librarian.save();

    // A failed email must not roll back the decision
    notifyLibrarianOfDecision(
      { name: librarian.name, email: librarian.email },
      action === 'approve',
      reason
    ).catch(() => {});

    return NextResponse.json(
      successResponse(
        {
          id: librarian._id,
          name: librarian.name,
          email: librarian.email,
          decided: action === 'approve' ? 'approved' : 'rejected',
        },
        action === 'approve'
          ? `${librarian.name} has been approved`
          : `${librarian.name} has been rejected`,
        200
      ),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to process review.', 'Review POST');
  }
}
