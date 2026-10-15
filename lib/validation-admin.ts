// lib/validation-admin.ts
import { z } from 'zod';

export const PlanInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().trim().max(300).optional().default(''),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  currency: z.string().trim().min(1).max(8).optional().default('INR'),
  durationDays: z.coerce.number().int().min(1, 'Duration must be at least 1 day'),
  features: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
  isActive: z.boolean().optional().default(true),
  isPopular: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional().default(0),
});

// Only http(s) links — a javascript: URL in an ad would run on the home page
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must start with http:// or https://');

// Digits with an optional leading +, spaces/dashes allowed while typing
const phoneNumber = z
  .string()
  .trim()
  .max(20)
  .refine(
    (v) => v === '' || /^\+?[\d\s-]{7,20}$/.test(v),
    'Enter a valid phone number, e.g. +91 98765 43210'
  );

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  // undefined stays undefined so a partial update (e.g. toggling isActive) leaves dates alone
  .transform((v) => (v === undefined ? undefined : v ? new Date(v) : null))
  .refine((d) => d == null || !Number.isNaN(d.getTime()), 'Invalid date');

export const AdInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
  description: z.string().trim().max(400).optional().default(''),
  imageUrl: httpUrl.optional().default(''),
  linkUrl: httpUrl.optional().default(''),
  ctaLabel: z.string().trim().max(30).optional().default(''),
  advertiserName: z.string().trim().max(60).optional().default(''),
  badgeText: z.string().trim().max(24).optional().default(''),
  phone: phoneNumber.optional().default(''),
  whatsapp: phoneNumber.optional().default(''),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Invalid email')
    .optional()
    .default(''),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
  startsAt: optionalDate,
  endsAt: optionalDate,
});

/** An ad with no link and no contact would show no buttons at all. */
export function adHasAction(ad: {
  linkUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}): boolean {
  return Boolean(ad.linkUrl || ad.phone || ad.whatsapp || ad.email);
}

export const AD_NO_ACTION_ERROR =
  'Add a website link, phone, WhatsApp or email so the ad has a button.';
