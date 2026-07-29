// app/api/auth/change-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { User } from '@/lib/models/User';
import { authenticateRequest } from '@/lib/middleware/auth';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    // agar admin ko bhi allow karna ho to condition adjust kar sakte ho
    if (decoded.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Not authorized' },
        { status: 403 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Current and new password are required',
        },
        { status: 400 }
      );
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // ⚠️ Yahin pe pehle tum double-hash kar rahe the.
    // Correct: plain password set karo, hook hash karega.
    user.password = newPassword;
    await user.save();

    return NextResponse.json(
      { success: true, message: 'Password changed successfully' },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to change password', 'Librarian Password');
  }
}