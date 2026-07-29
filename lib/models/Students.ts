// lib/models/Student.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export type PaymentStatus = 'paid' | 'unpaid' | 'pending';
export type MembershipStatus = 'active' | 'inactive' | 'expired';

export interface IStudent extends Document {
  name: string;
  email: string;
  phone: string;
  paymentStatus: PaymentStatus;        // membership payment status
  membershipStatus: MembershipStatus;  // active/inactive/expired (optional UI info)
  membershipStartDate?: Date;          // membership start date
  membershipEndDate?: Date;            // membership end date (for 3-day rule)
  seatNumber?: number | null;
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

export const Student =
  models.Student || model<IStudent>('Student', StudentSchema);