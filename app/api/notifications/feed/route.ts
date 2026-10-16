// app/api/notifications/feed/route.ts — bell list + per-section badge counts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { authenticateRequest, libraryIdFor } from '@/lib/middleware/auth';
import { Notification } from '@/lib/models/Notification';
import { Student } from '@/lib/models/Students';
import { User } from '@/lib/models/User';
import { Message } from '@/lib/models/Message';
import { Library } from '@/lib/models/Library';
import { audienceFilter } from '@/lib/services/notification-feed';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    // allowLocked: the bell keeps working even if the librarian's own plan lapsed
    const user = await authenticateRequest(request, { allowLocked: true });
    const me = new mongoose.Types.ObjectId(user.userId);
    const base = await audienceFilter(user);
    const unreadFilter = { ...base, readBy: { $ne: me } };

    const [items, unread, bySection] = await Promise.all([
      Notification.find(base).sort({ createdAt: -1 }).limit(30).lean<any[]>(),
      Notification.countDocuments(unreadFilter),
      Notification.aggregate([{ $match: unreadFilter }, { $group: { _id: '$section', n: { $sum: 1 } } }]),
    ]);
    const sections: Record<string, number> = Object.fromEntries(bySection.map((x: any) => [x._id, x.n]));

    // Live counts for things that stay "to do" until someone acts on them
    const counts: Record<string, number> = {};
    if (user.role === 'admin') {
      [counts.pendingApprovals, counts.openMessages, counts.qrRequests] = await Promise.all([
        User.countDocuments({
          role: 'librarian',
          isVerified: true,
          isApproved: false,
          approvalRequestedAt: { $ne: null },
          rejectedAt: null,
        }),
        Message.countDocuments({ status: 'open' }),
        // Libraries asking for the paid QR service that don't have it yet
        Library.countDocuments({ qrRequestedAt: { $ne: null }, qrAttendanceEnabled: false }),
      ]);
    } else {
      const libraryId = await libraryIdFor(user);
      if (libraryId) {
        const lib = await Library.findById(libraryId).select('settings.expiringSoonDays').lean<any>();
        const soon = new Date(Date.now() + (lib?.settings?.expiringSoonDays ?? 7) * 864e5);
        [counts.expiringSoon, counts.demoStudents] = await Promise.all([
          Student.countDocuments({ libraryId, status: 'ACTIVE_MEMBER', membershipEndDate: { $gte: new Date(), $lte: soon } }),
          Student.countDocuments({ libraryId, status: 'DEMO' }),
        ]);
      }
    }

    return NextResponse.json(
      successResponse({
        unread,
        sections,
        counts,
        items: items.map((n) => ({
          _id: String(n._id),
          section: n.section,
          type: n.type,
          title: n.title,
          body: n.body ?? null,
          link: n.link ?? null,
          createdAt: n.createdAt,
          read: (n.readBy ?? []).some((id: any) => String(id) === user.userId),
        })),
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Could not load notifications.', 'Notifications feed');
  }
}
