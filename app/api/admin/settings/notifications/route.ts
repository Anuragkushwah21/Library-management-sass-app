// app/api/admin/settings/notifications/route.ts
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
        { success: false, error: 'Only admin can update notifications' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      emailNotifications,
      newRegistrations,
      systemUpdates,
      weeklyReports,
    } = body;

    const admin = await User.findById(decoded.userId);

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    admin.notificationPrefs = {
      emailNotifications: !!emailNotifications,
      newRegistrations: !!newRegistrations,
      systemUpdates: !!systemUpdates,
      weeklyReports: !!weeklyReports,
    };

    await admin.save();

    return NextResponse.json(
      successResponse(
        admin.notificationPrefs,
        'Notification preferences updated',
        200
      ),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Admin Notification Update Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, {
      status: response.statusCode || 500,
    });
  }
}