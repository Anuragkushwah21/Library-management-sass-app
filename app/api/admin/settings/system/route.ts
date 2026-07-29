// app/api/admin/settings/system/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { SystemSettings } from '@/lib/models/SystemSettings';

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);

    if (decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only admin can update system settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      siteName,
      supportEmail,
      autoApproveLibrarians,
      maintenanceMode,
    } = body;

    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
    }

    if (typeof siteName === 'string' && siteName.trim()) {
      settings.siteName = siteName.trim();
    }
    if (typeof supportEmail === 'string' && supportEmail.trim()) {
      settings.supportEmail = supportEmail.trim();
    }
    if (typeof autoApproveLibrarians === 'boolean') {
      settings.autoApproveLibrarians = autoApproveLibrarians;
    }
    if (typeof maintenanceMode === 'boolean') {
      settings.maintenanceMode = maintenanceMode;
    }

    await settings.save();

    return NextResponse.json(
      successResponse(settings, 'System settings updated', 200),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Admin System Settings Update Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, {
      status: response.statusCode || 500,
    });
  }
}