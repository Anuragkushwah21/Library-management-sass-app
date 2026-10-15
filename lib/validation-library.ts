// lib/validation-library.ts — zod schemas for the library/shift/attendance APIs
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/time';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 09:00');

export const LibraryUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Library name is too short').max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  settings: z
    .object({
      timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional(),
      graceMinutes: z.coerce.number().int().min(0).max(180).optional(),
      earlyCheckinMinutes: z.coerce.number().int().min(0).max(240).optional(),
      expiringSoonDays: z.coerce.number().int().min(1).max(60).optional(),
      geofence: z
        .object({
          enabled: z.boolean(),
          lat: z.number().min(-90).max(90).nullable(),
          lng: z.number().min(-180).max(180).nullable(),
          radiusMeters: z.coerce.number().int().min(20).max(5000),
        })
        .refine((g) => !g.enabled || (g.lat != null && g.lng != null), {
          message: 'Set the library location before turning on the location check.',
        })
        .optional(),
    })
    .optional(),
});

export const ShiftSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(40),
    startTime: hhmm,
    endTime: hhmm,
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((s) => s.startTime !== s.endTime, {
    message: 'Start and end time cannot be the same.',
    path: ['endTime'],
  });

export const ManualAttendanceSchema = z.object({
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid student'),
  shiftId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid shift'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(['checkin', 'checkout']),
  /** Library-local HH:mm; defaults to now */
  time: hhmm.optional(),
  note: z.string().trim().max(300).optional(),
});

export const AttendanceOverrideSchema = z
  .object({
    arrivalStatus: z.enum(['PRESENT', 'LATE']).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.arrivalStatus !== undefined || v.note !== undefined, 'Nothing to change.');
