// app/api/books/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import Book from '@/lib/models/Book';
import { Transaction } from '@/lib/models/Transaction';
import { Student } from '@/lib/models/Students';
import { authenticateRequest, libraryIdFor } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// GET /api/books?search=...
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const query: any = {};

    // Multi-tenant filter: librarian sirf apne books
    if (decoded.role === 'librarian') {
      query.librarianId = userId;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
        { isbn: { $regex: search, $options: 'i' } },
      ];
    }

    // 1) Sab books lao (current tenant ke)
    const books = await Book.find(query).sort({ createdAt: -1 });

    if (!books.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    const bookIds = books.map((b) => b._id);

    // 2) In books ke transactions lao (latest per book)
    const transactions = await Transaction.find({
      bookId: { $in: bookIds },
    })
      .sort({ issueDate: -1 })
      .populate('memberId'); // Student details

    // 3) bookId -> latest transaction map
    const txMap = new Map<string, any>();
    for (const tx of transactions) {
      const key = tx.bookId.toString();
      if (!txMap.has(key)) {
        txMap.set(key, tx);
      }
    }

    // 4) Combined response banao
    const result = books.map((book) => {
      const tx = txMap.get(book._id.toString());

      let currentHolder: null | {
        _id: string;
        name?: string;
        email?: string;
      } = null;

      let issueDate: Date | null = null;
      let dueDate: Date | null = (book as any).dueDate || null;
      let status: 'available' | 'issued' | 'overdue' | 'returned' = 'available';

      if (tx) {
        const member = tx.memberId as any;

        currentHolder = member
          ? {
              _id: member._id?.toString(),
              name:
                member.name ||
                member.fullName ||
                member.studentName ||
                undefined,
              email: member.email || member.studentEmail || undefined,
            }
          : null;

        issueDate = tx.issueDate || tx.createdAt;
        dueDate = tx.dueDate;

        if (tx.status === 'issued' || tx.status === 'overdue') {
          status = tx.status;
        } else if (tx.status === 'returned') {
          status = 'returned';
        } else {
          status = 'available';
        }
      }

      return {
        _id: book._id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        totalCopies: (book as any).totalCopies,
        availableCopies: (book as any).availableCopies,
        issuedCount: (book as any).issuedCount,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,

        currentHolder,
        issueDate,
        dueDate,
        status,

        // 👇 yahi se frontend ko sahi transactionId milega
        transactionId: tx?._id?.toString() ?? undefined,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(error, 'Failed to load books', 'API');
  }
}

// POST /api/books  (add book)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const body = await request.json();
    const { title, author, isbn, totalCopies } = body;

    if (!title || !author) {
      return NextResponse.json(
        { success: false, error: 'Title and author are required' },
        { status: 400 }
      );
    }

    const copies = totalCopies && totalCopies > 0 ? totalCopies : 1;

    const book = await Book.create({
      title,
      author,
      isbn: isbn || undefined,
      totalCopies: copies,
      availableCopies: copies,
      librarianId: userId,
      libraryId: await libraryIdFor(decoded),
    });

    return NextResponse.json(
      { success: true, message: 'Book added', data: book },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to add book', 'API');
  }
}