// app/api/admin/settings/profile/route.ts
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
        { success: false, error: 'Only admin can update profile settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, phone } = body;

    const admin = await User.findById(decoded.userId);

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    if (typeof name === 'string' && name.trim()) {
      admin.name = name.trim();
    }
    if (typeof email === 'string' && email.trim()) {
      admin.email = email.trim().toLowerCase();
    }
    if (typeof phone === 'string') {
      admin.phone = phone.trim();
    }

    await admin.save();

    const sanitized = {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,
    };

    return NextResponse.json(
      successResponse(sanitized, 'Profile updated', 200),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Admin Profile Update Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, {
      status: response.statusCode || 500,
    });
  }
}