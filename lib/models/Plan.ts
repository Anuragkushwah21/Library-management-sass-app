// lib/models/Plan.ts
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

/**
 * Subscription plan a librarian can pick when requesting approval. Managed by
 * the super admin from /admin/plans and shown on the home page pricing section.
 */
export interface IPlan extends Document {
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', trim: true },
    durationDays: { type: Number, required: true, min: 1 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PlanSchema.index({ isActive: 1, sortOrder: 1 });

export const Plan =
  defineModel<IPlan>('Plan', PlanSchema);
