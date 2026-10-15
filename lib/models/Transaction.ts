// lib/models/Transaction.ts
import mongoose from 'mongoose';
import { defineModel } from './define-model';

const { Schema, model, models } = mongoose;

export interface ITransaction {
  _id: mongoose.Types.ObjectId;
  bookId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  issuedBy?: mongoose.Types.ObjectId;
  issueDate: Date;
  dueDate: Date;
  returnDate?: Date;
  returnedBy?: mongoose.Types.ObjectId;
  status: 'issued' | 'returned' | 'overdue';
  fineAmount: number;
  finePaid: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;

  // multi-tenant owner
  librarianId: mongoose.Types.ObjectId;
  libraryId?: mongoose.Types.ObjectId | null;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    bookId: {
      type: Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Student', // Student hi rakho
      required: true,
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    issueDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    returnDate: {
      type: Date,
    },
    returnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['issued', 'returned', 'overdue'],
      default: 'issued',
    },
    fineAmount: {
      type: Number,
      default: 0,
    },
    finePaid: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },

    // Tenant (PLAN §2.1) — set on new writes, backfilled for old docs
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', default: null, index: true },

    // Multi-tenant owner (required)
    librarianId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // ya tumhara actual user/librarian model name
      required: true,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Tenant-scoped indexes
TransactionSchema.index({ librarianId: 1, createdAt: -1 });
TransactionSchema.index({ librarianId: 1, bookId: 1, memberId: 1 });

// Auto set status to overdue if past dueDate while saving
TransactionSchema.pre('save', function () {
  if (this.status === 'issued' && new Date() > this.dueDate) {
    this.status = 'overdue';
  }
});

export const Transaction =
  defineModel<ITransaction>('Transaction', TransactionSchema);