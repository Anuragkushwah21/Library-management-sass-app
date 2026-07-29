// lib/services/librarian-review.ts
import { User } from '@/lib/models/User';
import { createReviewToken } from '@/lib/review-token';
import {
  sendLibrarianDecisionEmail,
  sendLibrarianPendingEmail,
} from '@/lib/email-service';

function appUrl(path: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}${path}`;
}

/**
 * Notify every active admin that a new librarian is awaiting approval. The
 * email carries a signed link so an admin can review without opening the
 * dashboard first.
 */
export async function notifyAdminsOfPendingLibrarian(librarian: {
  _id: unknown;
  name?: string;
  email: string;
  phone?: string;
  createdAt?: Date;
}): Promise<{ notified: number; failed: number }> {
  const admins = await User.find({
    role: 'admin',
    status: { $ne: 'inactive' },
  })
    .select('name email')
    .lean();

  if (admins.length === 0) {
    console.warn('[LibrarianReview] No admin found to notify.');
    return { notified: 0, failed: 0 };
  }

  const token = createReviewToken(String(librarian._id));

  // Deliberately outside /admin — proxy.ts blocks /admin/* without a login,
  // and an admin arriving from email may well be logged out. Auth here comes
  // from the signed token, not a session.
  const reviewUrl = appUrl(
    `/review/librarian?token=${encodeURIComponent(token)}`
  );

  let notified = 0;
  let failed = 0;

  for (const admin of admins as Array<{ name?: string; email: string }>) {
    const result = await sendLibrarianPendingEmail({
      adminEmail: admin.email,
      adminName: admin.name || 'Admin',
      librarian: {
        name: librarian.name || 'Unknown',
        email: librarian.email,
        phone: librarian.phone,
        registeredAt: librarian.createdAt || new Date(),
      },
      reviewUrl,
    });

    if (result.success) notified++;
    else {
      failed++;
      console.error(
        `[LibrarianReview] Failed to notify ${admin.email}: ${result.error}`
      );
    }
  }

  return { notified, failed };
}

/** Send the approve/reject outcome to the librarian. */
export async function notifyLibrarianOfDecision(
  librarian: { name?: string; email: string },
  approved: boolean,
  reason?: string
): Promise<void> {
  const result = await sendLibrarianDecisionEmail({
    recipientEmail: librarian.email,
    recipientName: librarian.name || 'there',
    approved,
    reason,
    loginUrl: appUrl('/login'),
  });

  if (!result.success) {
    console.error(
      `[LibrarianReview] Decision email failed for ${librarian.email}: ${result.error}`
    );
  }
}
