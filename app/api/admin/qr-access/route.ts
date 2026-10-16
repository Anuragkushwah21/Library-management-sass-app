// app/api/admin/qr-access/route.ts — every library's QR/OTP access (admin only)
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireAdmin } from '@/lib/middleware/auth';
import { Library } from '@/lib/models/Library';
import { SystemSettings } from '@/lib/models/SystemSettings';
import { qrAccessState } from '@/lib/services/qr-access';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const q = (sp.get('search') || '').trim();
    const filter: Record<string, unknown> = {};
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const libs = await Library.find(filter).populate('ownerId', 'name email').sort({ qrRequestedAt: -1, name: 1 }).limit(500);
    const rows = [];
    for (const lib of libs) {
      const state = await qrAccessState(lib); // also flips past-expiry ones to EXPIRED
      rows.push({
        _id: String(lib._id),
        name: lib.name,
        owner: lib.ownerId ? { name: (lib.ownerId as any).name, email: (lib.ownerId as any).email } : null,
        qrAttendanceEnabled: Boolean(lib.qrAttendanceEnabled),
        otpEnabled: Boolean(lib.otpEnabled),
        accessStatus: lib.accessStatus,
        accessExpiresAt: lib.accessExpiresAt ?? null,
        smsCreditBalance: lib.smsCreditBalance ?? 0,
        monthlyOtpLimit: lib.monthlyOtpLimit ?? null,
        otpUsedThisMonth: lib.otpUsageMonth ? lib.otpUsedThisMonth : 0,
        accessNote: lib.accessNote ?? '',
        accessUpdatedAt: lib.accessUpdatedAt ?? null,
        qrRequestedAt: lib.qrRequestedAt ?? null,
        live: state.qrEnabled,
      });
    }
    const settings = await SystemSettings.findOne().lean<any>();
    return NextResponse.json(
      successResponse({
        libraries: rows,
        pricing: {
          qrServicePrice: settings?.qrServicePrice ?? 0,
          smsCreditPrice: settings?.smsCreditPrice ?? 0,
          qrServiceNote: settings?.qrServiceNote ?? '',
        },
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load QR access.', 'Admin QR access list');
  }
}
