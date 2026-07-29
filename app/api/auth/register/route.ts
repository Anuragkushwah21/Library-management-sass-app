// app/api/auth/register/route.ts - ✅ NO CHANGES NEEDED

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { User } from '@/lib/models/User';
import { z } from 'zod';
import { successResponse, handleApiError } from '@/lib/api-response';
import { sendOTPEmail } from '@/lib/email-service';

const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, 'auth:register', {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    await connectDB();

    const body = await request.json();
    const validatedData = RegisterSchema.parse(body);

    // Check if user exists
    const existingUser = await User.findOne({ email: validatedData.email });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 400 }
      );
    }

    // ✅ Create librarian with isVerified = false
    const user = new User({
      email: validatedData.email,
      password: validatedData.password,
      name: validatedData.name,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      role: 'librarian',
      isVerified: false,      // ⬅️ Initially false
      isApproved: false,      // ⬅️ Needs admin approval
    });

    // ✅ Generate OTP
    const otp = user.generateOTP();
    await user.save();

    // ✅ Send OTP email
    const emailResult = await sendOTPEmail({
      recipientEmail: validatedData.email,
      recipientName: validatedData.name,
      otp: otp,
      expiryMinutes: 10,
    });

    if (!emailResult.success) {
      console.error(
        '\n[Register] OTP EMAIL FAILED — the account was created but the user ' +
          'will not be able to verify:\n  ' +
          emailResult.error +
          '\n'
      );
    }

    return NextResponse.json(
      successResponse(
        {
          message: emailResult.success
            ? 'Registration successful. Please verify your email with OTP.'
            : 'Account created, but the verification email could not be sent. Please use "Resend OTP".',
          userId: user._id,
          email: user.email,
          requiresApproval: true,
          // Frontend ko pata hona chahiye ki OTP screen dikhane ka fayda hai ya nahi
          emailSent: emailResult.success,
          ...(process.env.NODE_ENV !== 'production' && !emailResult.success
            ? { emailError: emailResult.error }
            : {}),
        },
        'User registered successfully',
        201
      ),
      { status: 201 }
    );

  } catch (error: any) {
    console.error('[Register Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed', 
          details: error.errors.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}