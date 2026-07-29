// app/api/admin/librarians/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { requireAdmin } from '@/lib/middleware/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

// ✅ GET - Get single librarian
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);

    await connectDB();

    const { id: librarianId } = await params;

    const librarian = await User.findById(librarianId).select(
      '-password -otp -otpExpiry'
    );

    if (!librarian || librarian.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Librarian not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse(librarian, 'Librarian fetched', 200),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Get Librarian Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}

// ✅ PATCH - Update librarian (edit)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);

    await connectDB();

    const { id: librarianId } = await params;
    const body = await request.json();

    // Allowed editable fields
    const { name, email, phone, status } = body;

    const librarian = await User.findById(librarianId);

    if (!librarian || librarian.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Librarian not found' },
        { status: 404 }
      );
    }

    // Update only provided fields
    if (typeof name === 'string' && name.trim().length > 0) {
      librarian.name = name.trim();
    }

    if (typeof email === 'string' && email.trim().length > 0) {
      librarian.email = email.trim().toLowerCase();
    }

    if (typeof phone === 'string' && phone.trim().length > 0) {
      librarian.phone = phone.trim();
    }

    // Optional: status like 'active' | 'inactive'
    if (typeof status === 'string' && status.trim().length > 0) {
      librarian.status = status.trim();
    }

    await librarian.save();

    const sanitized = await User.findById(librarianId).select(
      '-password -otp -otpExpiry'
    );

    return NextResponse.json(
      successResponse(sanitized, 'Librarian updated', 200),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Update Librarian Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}

// ✅ DELETE - Delete librarian
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);

    await connectDB();

    const { id: librarianId } = await params;

    const librarian = await User.findById(librarianId);

    if (!librarian || librarian.role !== 'librarian') {
      return NextResponse.json(
        { success: false, error: 'Librarian not found' },
        { status: 404 }
      );
    }

    await User.findByIdAndDelete(librarianId);

    console.log('🗑️ Librarian deleted:', librarian.email);

    return NextResponse.json(
      successResponse(
        { message: 'Librarian deleted successfully' },
        'Librarian deleted',
        200
      ),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Delete Librarian Error]:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode || 500 });
  }
}