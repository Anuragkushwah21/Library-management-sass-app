// app/api/library/qr-access/route.ts — the librarian's own QR/OTP access (read-only)
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { SmsTransaction } from '@/lib/models/SmsTransaction';
import { SystemSettings } from '@/lib/models/SystemSettings';
import { monthKey, qrAccessState } from '@/lib/services/qr-access';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const lib = ctx.library;
    const state = await qrAccessState(lib);
    const [recent, settings] = await Promise.all([
      SmsTransaction.find({ libraryId: lib._id }).sort({ createdAt: -1 }).limit(20)
        .select('type credits balanceAfter phoneMasked status createdAt note').lean(),
      SystemSettings.findOne().lean<any>(),
    ]);
    return NextResponse.json(
      successResponse({
        enabled: state.qrEnabled,
        otpEnabled: state.otpEnabled,
        reason: state.reason,
        accessStatus: lib.accessStatus,
        accessExpiresAt: lib.accessExpiresAt ?? null,
        accessNote: lib.accessNote ?? '',
        smsCreditBalance: lib.smsCreditBalance ?? 0,
        monthlyOtpLimit: lib.monthlyOtpLimit ?? null,
        otpUsedThisMonth: lib.otpUsageMonth === monthKey(lib) ? lib.otpUsedThisMonth : 0,
        qrRequestedAt: lib.qrRequestedAt ?? null,
        recent,
        pricing: {
          qrServicePrice: settings?.qrServicePrice ?? 0,
          smsCreditPrice: settings?.smsCreditPrice ?? 0,
          qrServiceNote: settings?.qrServiceNote ?? '',
        },
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load QR access.', 'Library QR access');
  }
}
