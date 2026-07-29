import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  siteName: string;
  supportEmail: string;
  autoApproveLibrarians: boolean;
  maintenanceMode: boolean;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    siteName: { type: String, default: 'Library Management System' },
    supportEmail: { type: String, default: 'support@library.com' },
    autoApproveLibrarians: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SystemSettings =
  mongoose.models.SystemSettings ||
  mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);