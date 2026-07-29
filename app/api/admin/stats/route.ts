// app/api/admin/stats/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    await connectDB();

    // ✅ Get stats
    const stats = await User.aggregate([
      {
        $match: { role: 'librarian' }
      },
      {
        $group: {
          _id: null,
          totalLibrarians: { $sum: 1 },
          approvedLibrarians: {
            $sum: {
              $cond: [{ $eq: ['$isApproved', true] }, 1, 0]
            }
          },
          pendingLibrarians: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isVerified', true] },
                    { $eq: ['$isApproved', false] },
                    { $eq: [{ $ifNull: ['$rejectedAt', null] }, null] }
                  ]
                },
                1,
                0
              ]
            }
          },
          rejectedLibrarians: {
            $sum: {
              $cond: [{ $ne: [{ $ifNull: ['$rejectedAt', null] }, null] }, 1, 0]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalLibrarians: 0,
      approvedLibrarians: 0,
      pendingLibrarians: 0,
      rejectedLibrarians: 0,
    };

    console.log('✅ Admin stats:', result);

    return NextResponse.json(
      successResponse(result, 'Stats fetched', 200),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Get Stats Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}