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
  /** How the student joined: librarian form or QR demo form */
  registrationSource?: 'MANUAL' | 'QR';
  address?: string;
  examTarget?: string;
  collegeName?: string;
  parentContact?: string;
  notes?: string;
  photoUrl?: string;
  /** Private Cloudinary file — only reachable through a short-lived signed link */
  idProof?: { publicId: string; format: string; resourceType: string; uploadedAt: Date } | null;
  demoStartDate?: Date | null;
  /** Inclusive: the demo runs until the end of this library-local day */
  demoEndDate?: Date | null;
  demoExtendedDays?: number;
  demoEndedAt?: Date | null;
  activatedAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  libraryId?: mongoose.Types.ObjectId; // multi-tenant per library (optional, if using Library model)
  librarianId: mongoose.Types.ObjectId; // owner user / tenant id
}

const StudentSchema = new Schema<IStudent>(
  {
    name: { type: String, required: true },
    // Lowercased so Abc@x.com and abc@x.com are the same student. Optional for
    // demo students (QR form / quick manual admission); the Add Student form
    // still requires it.
    email: { type: String, index: true, lowercase: true, trim: true },
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

    registrationSource: { type: String, enum: ['MANUAL', 'QR'], default: 'MANUAL' },
    // address was sent by the Add Student form but never stored (no field) — fixed
    address: { type: String, trim: true, maxlength: 300 },
    examTarget: { type: String, trim: true, maxlength: 80 },
    collegeName: { type: String, trim: true, maxlength: 120 },
    parentContact: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 500 },
    photoUrl: { type: String, trim: true },
    idProof: {
      type: new Schema(
        { publicId: String, format: String, resourceType: String, uploadedAt: Date },
        { _id: false }
      ),
      default: null,
    },
    demoStartDate: { type: Date, default: null },
    demoEndDate: { type: Date, default: null },
    demoExtendedDays: { type: Number, default: 0 },
    demoEndedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

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

// One email per library, same approach as the phone index above
export const UNIQUE_EMAIL_INDEX = {
  key: { libraryId: 1, email: 1 },
  options: {
    unique: true,
    name: 'libraryId_email_unique',
    partialFilterExpression: {
      libraryId: { $type: 'objectId' },
      email: { $type: 'string' },
      status: { $in: ACTIVE_PHONE_STATUSES },
    },
  },
} as const;
StudentSchema.index({ libraryId: 1, status: 1 });

export const Student = defineModel<IStudent>('Student', StudentSchema);