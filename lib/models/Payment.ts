// lib/models/Payment.ts — one fee collection (PLAN §4.3, R6)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface IPayment extends Document {
  libraryId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  membershipId: mongoose.Types.ObjectId;
  /** Total fee of the membership (snapshot) */
  amount: number;
  /** Paid in this collection */
  paidAmount: number;
  /** Still owed after this collection */
  dueAmount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  receiptNumber: string;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  paidAt: Date;
  collectedBy?: mongoose.Types.ObjectId | null;
  /** Client-generated id, so a double click never charges twice */
  requestId?: string;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    membershipId: { type: Schema.Types.ObjectId, ref: 'Membership', required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 80 },
    receiptNumber: { type: String, required: true },
    status: { type: String, enum: ['PAID', 'PARTIAL', 'PENDING'], required: true },
    paidAt: { type: Date, default: Date.now },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PaymentSchema.index({ libraryId: 1, receiptNumber: 1 }, { unique: true });
PaymentSchema.index({ libraryId: 1, paidAt: -1 });
PaymentSchema.index({ libraryId: 1, studentId: 1, paidAt: -1 });
PaymentSchema.index({ libraryId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export const Payment = defineModel<IPayment>('Payment', PaymentSchema);
