// lib/models/SmsTransaction.ts — append-only SMS credit ledger (PLAN §12.1)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export const SMS_TX_TYPES = ['CREDIT_ADD', 'CREDIT_ADJUST', 'OTP_SEND', 'OTP_VERIFY', 'REFUND'] as const;
export type SmsTxType = (typeof SMS_TX_TYPES)[number];

export interface ISmsTransaction extends Document {
  libraryId: mongoose.Types.ObjectId;
  type: SmsTxType;
  /** +N top-up/refund, −1 send, 0 verify / test-mode send */
  credits: number;
  balanceAfter: number;
  monthKey: string;
  phoneMasked?: string;
  provider?: string;
  status: 'OK' | 'FAILED';
  refundOf?: mongoose.Types.ObjectId | null;
  actorId?: mongoose.Types.ObjectId | null;
  actorRole: 'admin' | 'student' | 'system';
  note?: string;
  requestId?: string;
  createdAt: Date;
}

const SmsTransactionSchema = new Schema<ISmsTransaction>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    type: { type: String, enum: SMS_TX_TYPES, required: true },
    credits: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    monthKey: { type: String, required: true },
    phoneMasked: { type: String },
    provider: { type: String },
    status: { type: String, enum: ['OK', 'FAILED'], default: 'OK' },
    refundOf: { type: Schema.Types.ObjectId, ref: 'SmsTransaction', default: null },
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorRole: { type: String, enum: ['admin', 'student', 'system'], required: true },
    note: { type: String, trim: true, maxlength: 300 },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SmsTransactionSchema.index({ libraryId: 1, createdAt: -1 });
SmsTransactionSchema.index({ libraryId: 1, monthKey: 1, type: 1 });
SmsTransactionSchema.index(
  { libraryId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } }
);

export const SmsTransaction = defineModel<ISmsTransaction>('SmsTransaction', SmsTransactionSchema);
