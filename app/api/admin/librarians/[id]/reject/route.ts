// app/api/admin/librarians/[id]/reject/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { notifyLibrarianOfDecision } from '@/lib/services/librarian-review';
import { z } from 'zod';

const RejectSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // ⬅️ CHANGED: Promise
) {
  try {
    await requireAdmin(request);

    await connectDB();

    const body = await request.json();
    const { reason } = RejectSchema.parse(body);

    // ✅ FIXED: Await params
    const { id: librarianId } = await params;

    // Find librarian
    const librarian = await User.findById(librarianId);

    if (!librarian) {
      return NextResponse.json(
        { success: false, error: 'Librarian not found' },
        { status: 404 }
      );
    }

    if (librarian.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'User is not a librarian' },
        { status: 400 }
      );
    }

    // ✅ Reject librarian
    librarian.isApproved = false;
    librarian.rejectedAt = new Date();
    librarian.rejectionReason = reason || 'No reason provided';
    await librarian.save();

    console.log('❌ Librarian rejected:', librarian.email);

    notifyLibrarianOfDecision(
      { name: librarian.name, email: librarian.email },
      false,
      reason
    ).catch(() => {});

    return NextResponse.json(
      successResponse(
        {
          message: 'Librarian rejected successfully',
          librarian: {
            id: librarian._id,
            name: librarian.name,
            email: librarian.email,
            rejectedAt: librarian.rejectedAt,
            rejectionReason: librarian.rejectionReason,
          },
        },
        'Librarian rejected',
        200
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Reject Librarian Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}