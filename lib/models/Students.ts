// lib/models/Student.ts
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export type PaymentStatus = 'paid' | 'unpaid' | 'pending';
export type MembershipStatus = 'active' | 'inactive' | 'expired';

/** Lifecycle (PLAN §2.2). The legacy paymentStatus/membershipStatus stay in sync. */
export const STUDENT_STATUSES = [
  'PENDING',
  'DEMO',
  'ACTIVE_MEMBER',
  'EXPIRED',
  'DEMO_ENDED',
  'REJECTED',
  'BLOCKED',
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export interface IStudent extends Document {
  name: string;
  email: string;
  phone: string;
  paymentStatus: PaymentStatus;        // membership payment status
  membershipStatus: MembershipStatus;  // active/inactive/expired (optional UI info)
  membershipStartDate?: Date;          // membership start date
  membershipEndDate?: Date;            // membership end date (for 3-day rule)
  seatNumber?: number | null;
  status: StudentStatus;
  /** As typed, before E.164 normalization */
  phoneRaw?: string;
  /** The shift this student attends (PLAN §2.5) */
  shiftId?: mongoose.Types.ObjectId | null;
  blockedReason?: string;
  createdAt: Date;
  updatedAt: Date;
  libraryId?: mongoose.Types.ObjectId; // multi-tenant per library (optional, if using Library model)
  librarianId: mongoose.Types.ObjectId; // owner user / tenant id
}

const StudentSchema = new Schema<IStudent>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    phone: { type: String, required: true },

    // Payment / membership fields
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'pending'],
      default: 'unpaid',
    },
    membershipStatus: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'inactive',
    },
    membershipStartDate: { type: Date },
    membershipEndDate: { type: Date },

    // Seat mapping
    seatNumber: { type: Number, default: null },

    // Lifecycle — existing rows are backfilled from their membership dates
    status: { type: String, enum: STUDENT_STATUSES, default: 'ACTIVE_MEMBER', index: true },
    phoneRaw: { type: String, trim: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null },
    blockedReason: { type: String, trim: true },

    // Library (for multi-tenant via Library model – optional)
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library' },

    // Multi-tenant owner (required)
    librarianId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // ya tumhara actual User/Librarian model name
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Helpful compound index: fast lookup per tenant
StudentSchema.index({ librarianId: 1, createdAt: -1 });
StudentSchema.index({ librarianId: 1, email: 1 });
// Check-in lookup. One phone per library is enforced by the API, and by a
// unique index that scripts/migrate-libraries.ts builds only once legacy
// duplicates are resolved — declaring it here would make every server start
// try (and fail) to build it, and break the backfill of duplicate rows.
export const ACTIVE_PHONE_STATUSES = STUDENT_STATUSES.filter((s) => s !== 'REJECTED');
export const UNIQUE_PHONE_INDEX = {
  key: { libraryId: 1, phone: 1 },
  options: {
    unique: true,
    name: 'libraryId_phone_unique',
    partialFilterExpression: { libraryId: { $type: 'objectId' }, status: { $in: ACTIVE_PHONE_STATUSES } },
  },
} as const;
StudentSchema.index({ libraryId: 1, phone: 1 });
StudentSchema.index({ libraryId: 1, status: 1 });

export const Student = defineModel<IStudent>('Student', StudentSchema);