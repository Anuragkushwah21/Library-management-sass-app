// app/api/admin/librarians/pending/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    await connectDB();

    // ✅ Librarians who sent an approval request from their dashboard
    const pendingLibrarians = await User.find({
      role: 'librarian',
      isVerified: true,
      isApproved: false,
      approvalRequestedAt: { $ne: null },
      rejectedAt: null, // matches missing too
    })
    .select('name email phone firstName lastName createdAt isVerified isApproved trialEndsAt approvalRequestedAt approvalRequestNote requestedPlan planExpiresAt')
    .populate('requestedPlan', 'name price currency durationDays')
    .sort({ approvalRequestedAt: -1 }); // Newest request first

    console.log(`✅ Found ${pendingLibrarians.length} pending librarians`);

    return NextResponse.json(
      successResponse(pendingLibrarians, 'Pending librarians fetched', 200),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Get Pending Librarians Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}