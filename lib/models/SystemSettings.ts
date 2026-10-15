import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface ISystemSettings extends Document {
  siteName: string;
  supportEmail: string;
  autoApproveLibrarians: boolean;
  maintenanceMode: boolean;
  trialDays: number;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    siteName: { type: String, default: 'Library Management System' },
    supportEmail: { type: String, default: 'support@library.com' },
    autoApproveLibrarians: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    trialDays: { type: Number, default: 3, min: 0, max: 365 },
  },
  { timestamps: true }
);

export const SystemSettings =
  defineModel<ISystemSettings>('SystemSettings', SystemSettingsSchema);