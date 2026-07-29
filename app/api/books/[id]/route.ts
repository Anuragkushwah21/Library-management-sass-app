import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import Book from '@/lib/models/Book';
import { Types } from 'mongoose';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// GET /api/books/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈 params unwrap

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid book ID' },
        { status: 400 }
      );
    }

    const book = await Book.findById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apna book dekh sakta
    if (
      decoded.role === 'librarian' &&
      String(book.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to access this book' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: book });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch book', 'API');
  }
}

// PUT /api/books/[id]  (update book details or "reverse" issue)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈
    const body = await request.json();
    const { title, author, isbn, totalCopies, reverseIssue } = body;

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid book ID' },
        { status: 400 }
      );
    }

    const book = await Book.findById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apna book update / reverseIssue kar sakta
    if (
      decoded.role === 'librarian' &&
      String(book.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this book' },
        { status: 403 }
      );
    }

    // reverse (return book)
    if (reverseIssue) {
      if ((book as any).currentHolder) {
        (book as any).currentHolder = null;
        (book as any).dueDate = null;
        (book as any).availableCopies = Math.min(
          (book as any).totalCopies,
          (book as any).availableCopies + 1
        );
        await book.save();
      }
      return NextResponse.json({
        success: true,
        message: 'Book issue reversed (returned)',
        data: book,
      });
    }

    // normal update
    if (title !== undefined) book.title = title;
    if (author !== undefined) book.author = author;
    if (isbn !== undefined) book.isbn = isbn;
    if (totalCopies !== undefined && totalCopies > 0) {
      const diff = totalCopies - (book as any).totalCopies;
      (book as any).totalCopies = totalCopies;
      (book as any).availableCopies = Math.max(
        0,
        (book as any).availableCopies + diff
      );
    }

    await book.save();

    return NextResponse.json({
      success: true,
      message: 'Book updated',
      data: book,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update book', 'API');
  }
}

// DELETE /api/books/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const { id } = await context.params; // 👈

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid book ID' },
        { status: 400 }
      );
    }

    const book = await Book.findById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    // Librarian sirf apna book delete kar sakta
    if (
      decoded.role === 'librarian' &&
      String(book.librarianId) !== String(userId)
    ) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this book' },
        { status: 403 }
      );
    }

    await book.deleteOne();

    return NextResponse.json({
      success: true,
      message: 'Book deleted',
      data: book,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to delete book', 'API');
  }
}