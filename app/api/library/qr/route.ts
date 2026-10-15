// app/api/library/qr/route.ts — the library's check-in QR (PLAN §2.6)
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { checkinUrl } from '@/lib/services/library';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const url = checkinUrl(ctx.library, request.nextUrl.origin);

    // High error correction so a scuffed print still scans
    const opts = { errorCorrectionLevel: 'H' as const, margin: 2 };
    const [png, svg] = await Promise.all([
      QRCode.toDataURL(url, { ...opts, width: 1024 }),
      QRCode.toString(url, { ...opts, type: 'svg' }),
    ]);

    return NextResponse.json(
      successResponse({
        url,
        png,
        svg,
        qrVersion: ctx.library.qrVersion,
        libraryName: ctx.library.name,
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to build the QR code.', 'Library QR');
  }
}
