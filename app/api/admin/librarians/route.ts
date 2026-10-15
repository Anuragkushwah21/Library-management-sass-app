// app/api/admin/librarians/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    await connectDB();

    // ✅ Get all librarians
    const librarians = await User.find({
      role: 'librarian',
    })
    .select('name email phone firstName lastName createdAt isVerified isApproved approvedAt rejectedAt rejectionReason status trialEndsAt approvalRequestedAt planExpiresAt plan')
    .populate('plan', 'name')
    .sort({ createdAt: -1 });

    console.log(`✅ Found ${librarians.length} librarians`);

    return NextResponse.json(
      successResponse(librarians, 'All librarians fetched', 200),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Get All Librarians Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}