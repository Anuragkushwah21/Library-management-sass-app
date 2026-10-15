// lib/models/StudentOtp.ts — hashed phone OTPs for QR check-in (PLAN §2.6)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface IStudentOtp extends Document {
  libraryId: mongoose.Types.ObjectId;
  phone: string; // E.164
  /** HMAC-SHA256 of the code — the code itself is never stored */
  codeHash?: string | null;
  expiresAt?: Date | null;
  attempts: number;
  /** Rolling one-hour send window for this phone */
  windowStart: Date;
  sendCount: number;
  lastSentAt?: Date | null;
  /** TTL: the doc (with its counters) disappears a day after the last send */
  purgeAt: Date;
}

const StudentOtpSchema = new Schema<IStudentOtp>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
    phone: { type: String, required: true },
    codeHash: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    windowStart: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

StudentOtpSchema.index({ libraryId: 1, phone: 1 }, { unique: true });
StudentOtpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const StudentOtp = defineModel<IStudentOtp>('StudentOtp', StudentOtpSchema);
