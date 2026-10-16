// app/api/library/qr-access/request/route.ts — librarian asks the admin for the paid QR service
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Library } from '@/lib/models/Library';
import { logAudit } from '@/lib/services/audit';
import { notifyAdmins } from '@/lib/services/notify';

export const runtime = 'nodejs';

const Body = z.object({ message: z.string().trim().max(300).optional() });

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { message } = Body.parse(await request.json().catch(() => ({})));

    // Once a day is enough — stops the admin's bell being spammed
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (ctx.library.qrRequestedAt && ctx.library.qrRequestedAt > since) {
      return NextResponse.json(
        { success: false, error: 'Request already sent today. The admin will contact you.' },
        { status: 409 }
      );
    }
    await Library.updateOne({ _id: ctx.libraryId }, { $set: { qrRequestedAt: new Date() } });
    await notifyAdmins({
      section: 'librarians',
      type: 'qr_access.requested',
      title: `${ctx.library.name} wants QR attendance`,
      body: message || `${ctx.email} asked to enable QR attendance.`,
      link: '/admin/qr-access',
    });
    await logAudit({
      action: 'qr_access.requested',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Library',
      entityId: ctx.libraryId,
      meta: { message },
      request,
    });
    return NextResponse.json(successResponse({ requested: true }, 'Request sent to the admin'));
  } catch (error) {
    return handleRouteError(error, 'Failed to send request.', 'QR request');
  }
}
