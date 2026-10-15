// lib/models/Shift.ts — per-library shifts (PLAN §2.5)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface IShift extends Document {
  libraryId: mongoose.Types.ObjectId;
  name: string;
  startTime: string; // HH:mm, library-local
  endTime: string; // HH:mm; <= startTime means it ends the next day
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const ShiftSchema = new Schema<IShift>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    startTime: { type: String, required: true, match: HHMM },
    endTime: { type: String, required: true, match: HHMM },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ShiftSchema.index({ libraryId: 1, isActive: 1, sortOrder: 1 });
// Case-insensitive unique names per library
ShiftSchema.index(
  { libraryId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

export const Shift = defineModel<IShift>('Shift', ShiftSchema);
