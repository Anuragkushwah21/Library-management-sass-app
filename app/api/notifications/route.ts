// app/api/librarian/settings/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import {User }from '@/lib/models/User';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    if (decoded.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Not authorized' },
        { status: 403 }
      );
    }

    const user = await User.findById(userId).select(
      'notificationSettings'
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const defaults = {
      emailNotifications: true,
      overdueReminders: true,
      newMemberAlerts: false,
      systemUpdates: true,
    };

    const settings = {
      ...defaults,
      ...(user.notificationSettings?.toObject
        ? user.notificationSettings.toObject()
        : user.notificationSettings || {}),
    };

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return handleRouteError(error, 'Failed to load notification settings', 'Librarian Notifications GET');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    if (decoded.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Not authorized' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      emailNotifications = true,
      overdueReminders = true,
      newMemberAlerts = false,
      systemUpdates = true,
    } = body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'notificationSettings.emailNotifications': emailNotifications,
          'notificationSettings.overdueReminders': overdueReminders,
          'notificationSettings.newMemberAlerts': newMemberAlerts,
          'notificationSettings.systemUpdates': systemUpdates,
        },
      },
      { new: true }
    ).select('notificationSettings');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification settings updated',
      data: user.notificationSettings,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update notification settings', 'Librarian Notifications PUT');
  }
}