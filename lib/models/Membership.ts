// lib/models/Membership.ts — one paid period of a student (PLAN §4.2)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export type PaymentState = 'PAID' | 'PARTIAL' | 'PENDING';

export interface IMembership extends Document {
  libraryId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  planName: string;
  startDate: Date;
  endDate: Date;
  /** Whole rupees */
  fee: number;
  paidTotal: number;
  dueAmount: number;
  paymentStatus: PaymentState;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  shiftId?: mongoose.Types.ObjectId | null;
  seatNumber?: number | null;
  source: 'ACTIVATION' | 'RENEWAL' | 'MIGRATED' | 'WALK_IN';
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    planName: { type: String, required: true, trim: true, maxlength: 60 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    fee: { type: Number, required: true, min: 0 },
    paidTotal: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'PENDING'], required: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'], default: 'ACTIVE' },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null },
    seatNumber: { type: Number, default: null },
    source: { type: String, enum: ['ACTIVATION', 'RENEWAL', 'MIGRATED', 'WALK_IN'], default: 'ACTIVATION' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

MembershipSchema.index({ libraryId: 1, studentId: 1, status: 1 });
MembershipSchema.index({ libraryId: 1, endDate: 1 });
MembershipSchema.index({ libraryId: 1, dueAmount: 1 });

export const Membership = defineModel<IMembership>('Membership', MembershipSchema);
