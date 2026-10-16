// lib/models/Library.ts — the tenant (PLAN §2.1)
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface LibrarySettings {
  timezone: string;
  /** R2: minutes after shift start before a check-in counts as late */
  graceMinutes: number;
  /** R1: how early before shift start a check-in is accepted */
  earlyCheckinMinutes: number;
  demoDays: number;
  /** @deprecated revisions 3–4 librarian switch; replaced by the admin-controlled top-level fields */
  otpEnabled?: boolean;
  expiringSoonDays: number;
  /** D3: optional location check on scan */
  geofence: {
    enabled: boolean;
    lat: number | null;
    lng: number | null;
    radiusMeters: number;
  };
}

export interface ILibrary extends Document {
  name: string;
  slug: string;
  subdomain?: string;
  email?: string;
  phone?: string;
  address?: string;
  ownerId: mongoose.Types.ObjectId;
  status: 'ACTIVE' | 'SUSPENDED';
  settings: LibrarySettings;
  /** Bumped when the librarian regenerates the QR — old prints stop working */
  qrVersion: number;
  receiptSeq: number;

  // ── QR/OTP access: controlled by the platform admin only (PLAN §12) ──
  qrAttendanceEnabled: boolean;
  otpEnabled: boolean;
  smsCreditBalance: number;
  monthlyOtpLimit: number | null;
  otpUsedThisMonth: number;
  otpUsageMonth?: string;
  accessStatus: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  accessExpiresAt?: Date | null;
  accessNote?: string;
  accessUpdatedAt?: Date | null;
  accessUpdatedBy?: mongoose.Types.ObjectId | null;
  lastCreditTopUp?: number;
  creditsLowNotifiedAt?: Date | null;
  qrRequestedAt?: Date | null;
  /** OTP cost guard: sends counted per library-local day */
  otpSendDay?: string;
  otpSendCount: number;
  // Legacy flags from the unused first version of this model
  isApproved?: boolean;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LibrarySchema = new Schema<ILibrary>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/,
    },
    subdomain: { type: String, lowercase: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    // One library per owner for now (PLAN §2.1); unique so concurrent first
    // requests can't create two
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    settings: {
      timezone: { type: String, default: 'Asia/Kolkata' },
      graceMinutes: { type: Number, default: 15, min: 0, max: 180 },
      earlyCheckinMinutes: { type: Number, default: 60, min: 0, max: 240 },
      demoDays: { type: Number, default: 3, min: 1, max: 30 },
      // deprecated librarian switch — kept so the migration can read it
      otpEnabled: { type: Boolean },
      expiringSoonDays: { type: Number, default: 7, min: 1, max: 60 },
      geofence: {
        enabled: { type: Boolean, default: false },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        radiusMeters: { type: Number, default: 200, min: 20, max: 5000 },
      },
    },
    qrVersion: { type: Number, default: 1 },
    receiptSeq: { type: Number, default: 0 },

    // QR/OTP access — admin only. Never accepted from the librarian settings API.
    qrAttendanceEnabled: { type: Boolean, default: false },
    otpEnabled: { type: Boolean, default: false },
    smsCreditBalance: { type: Number, default: 0, min: 0 },
    monthlyOtpLimit: { type: Number, default: null, min: 1 },
    otpUsedThisMonth: { type: Number, default: 0, min: 0 },
    otpUsageMonth: { type: String },
    accessStatus: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED'], default: 'ACTIVE' },
    accessExpiresAt: { type: Date, default: null },
    accessNote: { type: String, trim: true, maxlength: 300 },
    accessUpdatedAt: { type: Date, default: null },
    accessUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastCreditTopUp: { type: Number, default: 0 },
    creditsLowNotifiedAt: { type: Date, default: null },
    qrRequestedAt: { type: Date, default: null },
    otpSendDay: { type: String },
    otpSendCount: { type: Number, default: 0 },
    isApproved: { type: Boolean },
    isActive: { type: Boolean },
  },
  { timestamps: true }
);

export const Library = defineModel<ILibrary>('Library', LibrarySchema);
