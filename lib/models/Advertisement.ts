// lib/models/Advertisement.ts
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

/** Promo banner the super admin places in the home page ad space. */
export interface IAdvertisement extends Document {
  title: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  advertiserName?: string;
  badgeText?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isActive: boolean;
  sortOrder: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AdvertisementSchema = new Schema<IAdvertisement>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    linkUrl: { type: String, trim: true, default: '' },
    ctaLabel: { type: String, trim: true, default: '' },
    // Shown above the title, e.g. the shop or brand name
    advertiserName: { type: String, trim: true, default: '' },
    // Small highlight on the image, e.g. "50% OFF"
    badgeText: { type: String, trim: true, default: '' },
    // Contact buttons — each one only appears when filled in
    phone: { type: String, trim: true, default: '' },
    whatsapp: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AdvertisementSchema.index({ isActive: 1, sortOrder: 1 });

export const Advertisement =
  defineModel<IAdvertisement>('Advertisement', AdvertisementSchema);
