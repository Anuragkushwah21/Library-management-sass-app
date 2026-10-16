import { Schema, model, models, Types } from 'mongoose';
import { defineModel } from './define-model';

export type SeatStatus = 'available' | 'reserved' | 'occupied';

const seatSchema = new Schema(
  {
    // Seat number per librarian (1,2,3...)
    seatNumber: {
      type: Number,
      required: true,
    },

    // Stored status: 'reserved' = assigned to a student. "Occupied" (student
    // inside right now) is computed from attendance in GET /api/seats.
    status: {
      type: String,
      enum: ['available', 'reserved', 'occupied'],
      default: 'available',
    },

    // Assigned student (null when released)
    studentId: {
      type: Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    studentName: {
      type: String,
      default: undefined,
    },
    studentEmail: {
      type: String,
      default: undefined,
    },

    // Reservation info
    reservedDate: {
      type: Date,
      default: null,
    },
    reservedUntil: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: undefined,
    },

    // Tenant (PLAN §2.1) — set on new writes, backfilled for old docs
    libraryId: { type: Types.ObjectId, ref: 'Library', default: null, index: true },

    // Multi-tenant: seat kis librarian ka hai
    librarianId: {
      type: Types.ObjectId,
      ref: 'User', // ya 'Librarian' model agar separate ho
      required: true,
    },
  },
  { timestamps: true }
);

// Per-librarian unique seat number
seatSchema.index({ librarianId: 1, seatNumber: 1 }, { unique: true });

// Convenience: release helper (optional)
seatSchema.methods.release = function () {
  this.status = 'available';
  this.studentId = null;
  this.studentName = undefined;
  this.studentEmail = undefined;
  this.reservedDate = null;
  this.reservedUntil = null;
  this.notes = undefined;
};

const Seat = defineModel<any>('Seat', seatSchema);
export default Seat;