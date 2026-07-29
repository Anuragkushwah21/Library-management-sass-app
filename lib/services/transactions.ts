// lib/services/transactions.ts
import mongoose from 'mongoose';
import { addDays } from 'date-fns';
import { Transaction } from '@/lib/models/Transaction';
import Book from '@/lib/models/Book';
import type { UserRole } from '@/lib/middleware/auth';
import { ApiError } from '@/lib/api-response';

export const DEFAULT_RENEW_DAYS = 14;

export class TransactionError extends ApiError {
  constructor(statusCode: number, message: string) {
    super(statusCode, message);
    this.name = 'TransactionError';
  }
}

export interface TransactionActor {
  userId: string;
  role: UserRole;
}

/**
 * Tenant-scoped lookup: a librarian can only touch their own transactions;
 * admins are unrestricted.
 */
async function findScopedTransaction(id: string, actor: TransactionActor) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new TransactionError(400, 'Invalid transaction id.');
  }

  const tx = await Transaction.findById(id);

  if (!tx) {
    throw new TransactionError(404, 'Transaction not found.');
  }

  if (
    actor.role === 'librarian' &&
    String(tx.librarianId) !== String(actor.userId)
  ) {
    throw new TransactionError(
      403,
      'You do not have access to this transaction.'
    );
  }

  return tx;
}

export async function returnTransaction(
  id: string,
  actor: TransactionActor,
  notes?: string
) {
  const tx = await findScopedTransaction(id, actor);

  if (tx.status === 'returned') {
    throw new TransactionError(400, 'Book already returned.');
  }

  tx.status = 'returned';
  tx.returnDate = new Date();
  tx.returnedBy = new mongoose.Types.ObjectId(actor.userId);
  if (notes) {
    tx.notes = notes;
  }
  await tx.save();

  // Put the copy back into circulation and clear the holder
  if (tx.bookId) {
    const book = await Book.findById(tx.bookId);

    if (book) {
      const nextAvailable = (book.availableCopies ?? 0) + 1;
      book.availableCopies =
        typeof book.totalCopies === 'number'
          ? Math.min(nextAvailable, book.totalCopies)
          : nextAvailable;

      // Only clear the holder if it is this member
      if (String(book.currentHolder ?? '') === String(tx.memberId)) {
        book.currentHolder = null;
        book.dueDate = null;
      }

      await book.save();
    }
  }

  return tx;
}

export async function renewTransaction(
  id: string,
  actor: TransactionActor,
  days?: number
) {
  const tx = await findScopedTransaction(id, actor);

  if (tx.status === 'returned') {
    throw new TransactionError(400, 'Cannot renew a returned book.');
  }

  const daysToExtend = days && days > 0 ? days : DEFAULT_RENEW_DAYS;
  const currentDue = tx.dueDate ? new Date(tx.dueDate) : new Date();

  tx.dueDate = addDays(currentDue, daysToExtend);
  tx.status = 'issued';
  await tx.save();

  // Keep the book's mirrored dueDate in sync
  if (tx.bookId) {
    await Book.findByIdAndUpdate(tx.bookId, { $set: { dueDate: tx.dueDate } });
  }

  return tx;
}
