// app/api/library/qr/rotate/route.ts — invalidate every printed copy of the old QR
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Library } from '@/lib/models/Library';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const updated = await Library.findByIdAndUpdate(ctx.libraryId, { $inc: { qrVersion: 1 } }, { returnDocument: 'after' });

    await logAudit({
      action: 'library.qr_rotated',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Library',
      entityId: ctx.libraryId,
      meta: { qrVersion: updated?.qrVersion },
      request,
    });

    return NextResponse.json(successResponse({ qrVersion: updated?.qrVersion }, 'New QR code generated'));
  } catch (error) {
    return handleRouteError(error, 'Failed to regenerate the QR code.', 'Library QR rotate');
  }
}
