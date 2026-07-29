// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import jwt from 'jsonwebtoken';

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

    // Rejected?
    if (user.rejectedAt) {
      return NextResponse.json(
        {
          success: false,
          error: `Your registration was rejected. Reason: ${
            user.rejectionReason || 'Not specified'
          }`,
          isRejected: true,
        },
        { status: 403 }
      );
    }

    // Librarian approval?
    if (user.role === 'librarian' && !user.isApproved) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your profile is pending approval from Admin. Please wait for admin to approve your account.',
          pendingApproval: true,
        },
        { status: 403 }
      );
    }

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

    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    };

    const responseBody = successResponse(
      {
        message: 'Login successful',
        token,
        user: userData,
      },
      'Login successful',
      200
    );

    const response = NextResponse.json(responseBody, { status: 200 });

    response.cookies.set('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

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