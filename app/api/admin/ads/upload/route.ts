// app/api/admin/ads/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { isCloudinaryConfigured, uploadAdImage } from '@/lib/cloudinary';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Upload an ad banner image; returns its URL to save on the ad. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image uploads are not configured. Paste an image URL instead.',
        },
        { status: 503 }
      );
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Send it as `file`.' },
        { status: 400 }
      );
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Use a JPEG, PNG, WebP or GIF image.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Image is too large. Max 5 MB.' },
        { status: 413 }
      );
    }

    const { url } = await uploadAdImage(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(successResponse({ url }, 'Image uploaded', 200));
  } catch (error) {
    return handleRouteError(error, 'Failed to upload image.', 'Ad Upload');
  }
}
