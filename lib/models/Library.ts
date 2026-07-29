// lib/models/Library.ts (Update)

import mongoose, { Schema, Document } from 'mongoose';

export interface ILibrary extends Document {
  name: string;
  subdomain: string; // ✅ Add subdomain
  email: string;
  phone?: string;
  address?: string;
  ownerId: mongoose.Types.ObjectId;
  isApproved: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LibrarySchema = new Schema<ILibrary>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/, // ✅ Validate subdomain format
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Index for faster subdomain lookups
LibrarySchema.index({ subdomain: 1 });
LibrarySchema.index({ ownerId: 1 });

export const Library = mongoose.models.Library || mongoose.model<ILibrary>('Library', LibrarySchema);