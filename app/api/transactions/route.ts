// app/api/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Transaction } from '@/lib/models/Transaction';
import Book from '@/lib/models/Book';
import { Student } from '@/lib/models/Students';
import { authenticateRequest } from '@/lib/middleware/auth';
import { IssueBookSchema } from '@/lib/validation';
import { successResponse, handleApiError } from '@/lib/api-response';

// GET all transactions with filters (tenant scoped)
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const query: any = {
      // tenant isolation
      librarianId: userId,
    };

    if (memberId) query.memberId = memberId;
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const transactions = await Transaction.find(query)
      .populate('memberId', 'name email') // Student fields
      .populate('bookId', 'title author isbn')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Transaction.countDocuments(query);

    return NextResponse.json(
      successResponse(
        {
          transactions,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        },
        'Transactions fetched successfully'
      )
    );
  } catch (error: any) {
    console.log('[v0] Get transactions error:', error);
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode });
  }
}

// POST issue book (create transaction) with membership checks (tenant scoped)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const body = await request.json();
    const validatedData = IssueBookSchema.parse(body);
    // validatedData: { libraryId, memberId, bookId, ... }

    // 1) Membership checks — also ensure student belongs to same tenant
    const student = await Student.findOne({
      _id: validatedData.memberId,
      librarianId: userId, // tenant isolation
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // paymentStatus must be "paid"
    if (student.paymentStatus !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only paid members can issue books.',
        },
        { status: 400 }
      );
    }

    // membershipEndDate must exist
    if (!student.membershipEndDate) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Membership end date is missing. Please update membership before issuing books.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const end = new Date(student.membershipEndDate);
    const diffMs = end.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // must have more than 3 days remaining
    if (diffDays <= 3) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Membership must have more than 3 days remaining to issue books.',
        },
        { status: 400 }
      );
    }

    // 2) Check if book exists and belongs to same tenant (if Book is tenant-scoped)
    const book = await Book.findOne({
      _id: validatedData.bookId,
      librarianId: userId, // ensure same tenant, assuming Book has librarianId
    });

    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    if (book.availableCopies <= 0) {
      return NextResponse.json(
        { success: false, error: 'Book not available' },
        { status: 400 }
      );
    }

    // 3) Calculate due date (14 days from now by default)
    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 14);

    const transaction = new Transaction({
      librarianId: userId,              // tenant owner
      libraryId: validatedData.libraryId,
      memberId: validatedData.memberId,
      bookId: validatedData.bookId,
      issueDate,
      dueDate,
      status: 'issued',
      issuedBy: userId,                 // optional: who issued
    });

    await transaction.save();

    // 4) Update book availability
    book.availableCopies -= 1;
    book.issuedCopies += 1;
    if (book.availableCopies === 0) {
      book.status = 'issued';
    }
    await book.save();

    return NextResponse.json(
      successResponse(transaction, 'Book issued successfully', 201),
      { status: 201 }
    );
  } catch (error: any) {
    console.log('[v0] Issue book error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    const response = handleApiError(error);
    return NextResponse.json(response, { status: response.statusCode });
  }
}