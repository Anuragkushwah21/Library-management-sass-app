// app/api/profile/avatar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdminOrLibrarian } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isCloudinaryConfigured, uploadAvatar } from '@/lib/cloudinary';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  try {
    const decoded = await requireAdminOrLibrarian(request);

    // Upload mehnga hai — abuse se bachao
    const limited = enforceRateLimit(request, 'profile:avatar', {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      identifier: decoded.userId,
    });
    if (limited) return limited;

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Image uploads are not configured. Cloudinary env vars missing on the server.',
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
        {
          success: false,
          error: `Unsupported file type "${file.type}". Use JPEG, PNG, WebP or GIF.`,
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Image is too large (${(file.size / 1024 / 1024).toFixed(
            1
          )} MB). Max 5 MB.`,
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadAvatar(buffer, decoded.userId);

    await connectDB();
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: { profileImage: url } },
      {
        new: true,
        select:
          '-password -otp -otpExpiry -resetPasswordCode -resetPasswordCodeExpires',
      }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({ profileImage: url, user }, 'Profile photo updated', 200),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to upload photo.', 'Avatar Upload');
  }
}

// Photo hatao
export async function DELETE(request: NextRequest) {
  try {
    const decoded = await requireAdminOrLibrarian(request);

    await connectDB();
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $unset: { profileImage: '' } },
      {
        new: true,
        select:
          '-password -otp -otpExpiry -resetPasswordCode -resetPasswordCodeExpires',
      }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({ user }, 'Profile photo removed', 200),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to remove photo.', 'Avatar Delete');
  }
}
