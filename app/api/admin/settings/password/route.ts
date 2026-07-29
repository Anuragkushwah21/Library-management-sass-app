// app/api/admin/settings/password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { authenticateRequest } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);

    if (decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only admin can change password' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must be at least 8 characters',
        },
        { status: 400 }
      );
    }

    const admin = await User.findById(decoded.userId).select('+password');

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    admin.password = newPassword;
    await admin.save(); // pre-save hook will hash

    return NextResponse.json(
      successResponse(
        { message: 'Password updated successfully' },
        'Password updated',
        200
      ),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Admin Password Update Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, {
      status: response.statusCode || 500,
    });
  }
}