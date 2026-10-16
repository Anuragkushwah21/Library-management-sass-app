import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface ISystemSettings extends Document {
  siteName: string;
  supportEmail: string;
  autoApproveLibrarians: boolean;
  maintenanceMode: boolean;
  trialDays: number;
  /** Price of the QR attendance add-on shown to librarians (₹/month, 0 = not shown) */
  qrServicePrice: number;
  /** Price per SMS credit shown to librarians (₹, 0 = not shown) */
  smsCreditPrice: number;
  qrServiceNote?: string;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    siteName: { type: String, default: 'Library Management System' },
    supportEmail: { type: String, default: 'support@library.com' },
    autoApproveLibrarians: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    trialDays: { type: Number, default: 3, min: 0, max: 365 },
    qrServicePrice: { type: Number, default: 0, min: 0 },
    smsCreditPrice: { type: Number, default: 0, min: 0 },
    qrServiceNote: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export const SystemSettings =
  defineModel<ISystemSettings>('SystemSettings', SystemSettingsSchema);