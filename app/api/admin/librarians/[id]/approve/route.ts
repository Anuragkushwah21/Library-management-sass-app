// app/api/admin/librarians/[id]/approve/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { notifyLibrarianOfDecision } from '@/lib/services/librarian-review';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // ⬅️ CHANGED: Promise
) {
  try {
    await requireAdmin(request);

    await connectDB();

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

    if (!librarian.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Librarian email is not verified' },
        { status: 400 }
      );
    }

    if (librarian.isApproved) {
      return NextResponse.json(
        { success: false, error: 'Librarian is already approved' },
        { status: 400 }
      );
    }

    // ✅ Approve librarian
    librarian.isApproved = true;
    librarian.approvedAt = new Date();
    librarian.rejectedAt = undefined;
    librarian.rejectionReason = undefined;
    await librarian.save();

    console.log('✅ Librarian approved:', librarian.email);

    // Email fail hone se approval revert nahi karna
    notifyLibrarianOfDecision(
      { name: librarian.name, email: librarian.email },
      true
    ).catch(() => {});

    return NextResponse.json(
      successResponse(
        {
          message: 'Librarian approved successfully',
          librarian: {
            id: librarian._id,
            name: librarian.name,
            email: librarian.email,
            isApproved: librarian.isApproved,
          },
        },
        'Librarian approved',
        200
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[Approve Librarian Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}