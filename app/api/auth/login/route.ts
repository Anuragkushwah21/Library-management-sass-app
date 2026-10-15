// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import { attachSession } from '@/lib/middleware/auth';
import { getAccessInfo } from '@/lib/services/access';
import { ensureLibraryForUser } from '@/lib/services/library';
import { logAudit } from '@/lib/services/audit';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'auth:login', {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json();
    const { email, password } = LoginSchema.parse(body);

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Email verified?
    if (!user.isVerified) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please verify your email first. Check your inbox for the verification code.',
          needsVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    // Pending / rejected / expired librarians can still log in — the
    // dashboard shows them the request-approval screen instead.

    // ✅ Account status (active / inactive)
    if (user.status && user.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your account is inactive. Please contact the administrator.',
          inactive: true,
        },
        { status: 403 }
      );
    }

    const userData = {
      id: user._id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      profileImage: user.profileImage,
      isApproved: user.isApproved,
      isVerified: user.isVerified,
      status: user.status, // ✅ include in response
      access: getAccessInfo(user),
    };

    const responseBody = successResponse(
      {
        message: 'Login successful',
        user: userData,
      },
      'Login successful',
      200
    );

    const response = NextResponse.json(responseBody, { status: 200 });

    attachSession(response, user);

    if (user.role === 'librarian') {
      // Creates the library (and backfills old data) on first login after the
      // tenant upgrade. A failure here must not block the login itself.
      let libraryId: string | null = null;
      try {
        libraryId = String((await ensureLibraryForUser(String(user._id)))._id);
      } catch (err) {
        console.error('[Login] library setup failed:', err);
      }
      await logAudit({
        action: 'librarian.login',
        actorId: String(user._id),
        actorRole: 'librarian',
        libraryId,
        entity: 'User',
        entityId: String(user._id),
        request,
      });
    }

    return response;
  } catch (error: any) {
    console.error('[Login Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    const response = handleApiError(error);
    return NextResponse.json(response, {
      status: response.statusCode || 500,
    });
  }
}