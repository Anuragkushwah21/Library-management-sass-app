// lib/models/Attendance.ts — one row per student per shift occurrence (PLAN R1/R2)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export type EntryType = 'DEMO' | 'MEMBER';
export type AttendanceSource = 'QR' | 'MANUAL' | 'SYSTEM';

export interface IAttendance extends Document {
  libraryId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  shiftId: mongoose.Types.ObjectId;
  seatId?: mongoose.Types.ObjectId | null;
  /** Seat number at check-in time, so history survives seat changes */
  seatNumber?: number | null;
  /** Library-local YYYY-MM-DD on which the shift started */
  date: string;
  shiftStartAt: Date;
  shiftEndAt: Date;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  totalMinutes: number;
  arrivalStatus: 'PRESENT' | 'LATE' | 'ABSENT';
  lateMinutes: number;
  leftEarly: boolean;
  isInside: boolean;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEFT_EARLY' | 'CURRENTLY_INSIDE';
  entryType: EntryType;
  source: AttendanceSource;
  autoCheckedOut: boolean;
  manuallyEdited: boolean;
  /** false for Mark Present / Mark Absent: no real times, excluded from study hours (D17) */
  timesRecorded: boolean;
  overriddenBy?: mongoose.Types.ObjectId | null;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', default: null },
    seatNumber: { type: Number, default: null },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    shiftStartAt: { type: Date, required: true },
    shiftEndAt: { type: Date, required: true },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    totalMinutes: { type: Number, default: 0 },
    arrivalStatus: { type: String, enum: ['PRESENT', 'LATE', 'ABSENT'], required: true },
    lateMinutes: { type: Number, default: 0 },
    leftEarly: { type: Boolean, default: false },
    isInside: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['PRESENT', 'LATE', 'ABSENT', 'LEFT_EARLY', 'CURRENTLY_INSIDE'],
      required: true,
    },
    entryType: { type: String, enum: ['DEMO', 'MEMBER'], default: 'MEMBER' },
    source: { type: String, enum: ['QR', 'MANUAL', 'SYSTEM'], default: 'QR' },
    autoCheckedOut: { type: Boolean, default: false },
    manuallyEdited: { type: Boolean, default: false },
    timesRecorded: { type: Boolean, default: true },
    overriddenBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

// R1: one record per student per shift occurrence — also stops double-tap races
AttendanceSchema.index({ studentId: 1, shiftId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ studentId: 1, date: -1 });
AttendanceSchema.index({ libraryId: 1, date: 1 });
AttendanceSchema.index({ libraryId: 1, isInside: 1 });
AttendanceSchema.index({ seatId: 1, shiftId: 1, date: 1 });

export const Attendance = defineModel<IAttendance>('Attendance', AttendanceSchema);
