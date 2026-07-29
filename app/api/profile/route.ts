// app/api/profile/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireLibrarian } from '@/lib/middleware/auth';
import { successResponse, handleRouteError } from '@/lib/api-response';
import { z } from 'zod';

export const runtime = 'nodejs';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  profileImage: z.string().url().optional(),
});

// ✅ GET - Get current librarian profile
export async function GET(request: NextRequest) {
  try {
    const decoded = await requireLibrarian(request);

    await connectDB();

    const user = await User.findById(decoded.userId).select(
      '-password -otp -otpExpiry -resetPasswordCode -resetPasswordCodeExpires'
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse(user, 'Profile fetched', 200), {
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch profile.', 'Get Profile');
  }
}

// ✅ PATCH - Update profile
export async function PATCH(request: NextRequest) {
  try {
    const decoded = await requireLibrarian(request);

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const validatedData = UpdateProfileSchema.parse(body);

    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: validatedData },
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

    return NextResponse.json(successResponse(user, 'Profile updated', 200), {
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update profile.', 'Update Profile');
  }
}
