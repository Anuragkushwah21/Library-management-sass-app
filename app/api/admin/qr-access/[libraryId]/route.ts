// app/api/admin/qr-access/[libraryId]/route.ts — one library: details, history, changes
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireAdmin } from '@/lib/middleware/auth';
import { Library } from '@/lib/models/Library';
import { SmsTransaction } from '@/lib/models/SmsTransaction';
import { AuditLog } from '@/lib/models/AuditLog';
import { adminUpdateAccess, monthKey, qrAccessState } from '@/lib/services/qr-access';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ libraryId: string }> };
const notFound = () => NextResponse.json({ success: false, error: 'Library not found' }, { status: 404 });

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin(request);
    await connectDB();
    const { libraryId } = await params;
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return notFound();
    const lib = await Library.findById(libraryId).populate('ownerId', 'name email phone');
    if (!lib) return notFound();
    await qrAccessState(lib);

    const month = monthKey(lib);
    const [transactions, changes, usage] = await Promise.all([
      SmsTransaction.find({ libraryId }).sort({ createdAt: -1 }).limit(50).lean(),
      AuditLog.find({ libraryId, action: /^qr_access\./ }).sort({ createdAt: -1 }).limit(20).lean(),
      SmsTransaction.aggregate([
        { $match: { libraryId: lib._id, monthKey: month } },
        { $group: { _id: '$type', n: { $sum: 1 }, credits: { $sum: '$credits' } } },
      ]),
    ]);
    const byType = Object.fromEntries(usage.map((u: any) => [u._id, u.n]));
    return NextResponse.json(
      successResponse({
        library: lib,
        month,
        usage: { sends: byType.OTP_SEND ?? 0, verifies: byType.OTP_VERIFY ?? 0, refunds: byType.REFUND ?? 0 },
        transactions,
        changes,
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load library access.', 'Admin QR access GET');
  }
}

const Patch = z.object({
  qrAttendanceEnabled: z.boolean().optional(),
  otpEnabled: z.boolean().optional(),
  accessStatus: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
  accessExpiresAt: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? new Date(v) : null))
    .refine((d) => d == null || !Number.isNaN(d.getTime()), 'Invalid expiry date'),
  monthlyOtpLimit: z.union([z.number().int().min(1, 'Monthly limit must be at least 1.').max(1_000_000), z.null()]).optional(),
  note: z.string().trim().min(3, 'Add a short reason for this change.').max(300),
});

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin(request);
    await connectDB();
    const { libraryId } = await params;
    if (!mongoose.Types.ObjectId.isValid(libraryId)) return notFound();
    const { note, ...patch } = Patch.parse(await request.json().catch(() => ({})));
    const lib = await adminUpdateAccess({ libraryId, actorId: admin.userId, patch, note });
    return NextResponse.json(successResponse({ library: lib }, 'Access updated'));
  } catch (error) {
    return handleRouteError(error, 'Failed to update access.', 'Admin QR access PATCH');
  }
}
