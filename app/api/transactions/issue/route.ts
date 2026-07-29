// app/api/transactions/issue/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { Transaction } from '@/lib/models/Transaction';
import Book from '@/lib/models/Book';
import { Student } from '@/lib/models/Students';
import { Types } from 'mongoose';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// POST /api/transactions/issue  (issue a book)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const body = await request.json();
    const {
      studentId,      // optional old name
      memberId,       // frontend se aa raha hai
      bookId,
      libraryId,
      dueDate,        // optional from UI
      notes,
    } = body;

    // normalize: allow memberId OR studentId
    const effectiveMemberId = memberId || studentId;

    if (!effectiveMemberId || !bookId) {
      return NextResponse.json(
        { success: false, error: 'Student and Book are required' },
        { status: 400 }
      );
    }

    if (
      !Types.ObjectId.isValid(effectiveMemberId) ||
      !Types.ObjectId.isValid(bookId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid student or book ID' },
        { status: 400 }
      );
    }

    // 1) Student fetch + membership checks (tenant scoped)
    const student = await Student.findOne({
      _id: effectiveMemberId,
      librarianId: userId, // ensure same tenant
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
        { status: 404 }
      );
    }

    // Payment must be "paid"
    if (student.paymentStatus !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only students with paid membership can issue books.',
        },
        { status: 400 }
      );
    }

    // membershipEndDate must exist and have > 3 days remaining
    if (!student.membershipEndDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Membership end date is not set for this student.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const diffMs = student.membershipEndDate.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 3) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Membership must have more than 3 days remaining to issue a book.',
        },
        { status: 400 }
      );
    }

    // 2) Book fetch + availability check (tenant scoped)
    const book = await Book.findOne({
      _id: bookId,
      librarianId: userId, // ensure same tenant, assuming Book has librarianId
    });

    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    if (book.availableCopies !== undefined && book.availableCopies <= 0) {
      return NextResponse.json(
        { success: false, error: 'No available copies for this book.' },
        { status: 400 }
      );
    }

    // 3) Due date: agar user ne nahi diya, default 14 days from now
    let finalDueDate: Date;
    if (dueDate) {
      const d = new Date(dueDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid due date' },
          { status: 400 }
        );
      }
      finalDueDate = d;
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      finalDueDate = d;
    }

    const issueDate = new Date();

    // 4) Create transaction (tenant + issuedBy set)
    const transaction = await Transaction.create({
      bookId,
      memberId: effectiveMemberId,
      libraryId,             // optional if you still use it
      librarianId: userId,   // tenant owner
      issuedBy: userId,
      issueDate,
      dueDate: finalDueDate,
      status: 'issued',
      fineAmount: 0,
      finePaid: false,
      notes,
    });

    // 5) Book update: availableCopies, currentHolder, dueDate
    if (typeof book.availableCopies === 'number') {
      book.availableCopies = Math.max(0, book.availableCopies - 1);
    }

    // yeh dono line add karo
    (book as any).currentHolder = effectiveMemberId;
    (book as any).dueDate = finalDueDate;

    await book.save();

    return NextResponse.json(
      {
        success: true,
        message: 'Book issued successfully',
        data: transaction,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to issue book', 'API');
  }
}