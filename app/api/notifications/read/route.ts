// app/api/notifications/read/route.ts — mark one, a section, or everything as read
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { authenticateRequest } from '@/lib/middleware/auth';
import { Notification, NOTIFICATION_SECTIONS } from '@/lib/models/Notification';
import { audienceFilter } from '@/lib/services/notification-feed';

export const runtime = 'nodejs';

const Body = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional(),
  section: z.enum(NOTIFICATION_SECTIONS).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await authenticateRequest(request, { allowLocked: true });
    const body = Body.parse(await request.json().catch(() => ({})));
    if (!body.ids && !body.section && !body.all) {
      return NextResponse.json({ success: false, error: 'Nothing to mark.' }, { status: 400 });
    }
    const me = new mongoose.Types.ObjectId(user.userId);
    // Only ever touches notifications this person can see
    const filter: Record<string, unknown> = { ...(await audienceFilter(user)), readBy: { $ne: me } };
    if (body.ids) filter._id = { $in: body.ids.map((id) => new mongoose.Types.ObjectId(id)) };
    if (body.section) filter.section = body.section;

    const res = await Notification.updateMany(filter, { $addToSet: { readBy: me } });
    return NextResponse.json(successResponse({ marked: res.modifiedCount }));
  } catch (error) {
    return handleRouteError(error, 'Could not update notifications.', 'Notifications read');
  }
}
