// lib/demo-rules.ts — demo dates (PLAN D8, R10, R15). Pure, unit-tested.
import { addDaysToKey, isDateKey, localDateKey, zonedTimeToUtc } from '@/lib/time';

export const MAX_DEMO_DAYS = 30;
export const MAX_DEMO_EXTENSION_DAYS = 7;

/** D8: default end date = start + demoDays (both inclusive library-local dates). */
export function defaultDemoEndKey(startKey: string, demoDays: number): string {
  return addDaysToKey(startKey, demoDays);
}

/** First instant of a library-local date. */
export function startOfDay(dateKey: string, tz: string): Date {
  return zonedTimeToUtc(dateKey, '00:00', tz);
}

/** Last instant of a library-local date — the demo is valid until then. */
export function endOfDay(dateKey: string, tz: string): Date {
  return new Date(zonedTimeToUtc(addDaysToKey(dateKey, 1), '00:00', tz).getTime() - 1);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** R15 date checks. Returns the error message, or null when the dates are fine. */
export function validateDemoDates(startKey: unknown, endKey: unknown, todayKey: string): string | null {
  if (!isDateKey(startKey)) return 'Demo start date is required.';
  if (!isDateKey(endKey)) return 'Demo end date is required.';
  if (startKey < todayKey) return "Demo start date can't be in the past.";
  if (endKey < startKey) return 'Demo end date must be on or after the start date.';
  if (daysBetween(startKey, endKey) + 1 > MAX_DEMO_DAYS) return `A demo can be at most ${MAX_DEMO_DAYS} days.`;
  return null;
}

/**
 * Whole days left in the demo, counted on the library's calendar.
 * 0 = today is the last day, negative = already over.
 */
export function demoDaysLeft(demoEndDate: Date, now: Date, tz: string): number {
  return daysBetween(localDateKey(now, tz), localDateKey(demoEndDate, tz));
}

/** Badge colour from the spec: green 2+ days left, yellow 1, red last day or over. */
export function demoBadge(daysLeft: number): 'green' | 'yellow' | 'red' {
  if (daysLeft >= 2) return 'green';
  if (daysLeft === 1) return 'yellow';
  return 'red';
}

/** Inclusive length of a demo in days, e.g. Mon→Thu = 4. */
export function demoLengthDays(startKey: string, endKey: string): number {
  return daysBetween(startKey, endKey) + 1;
}
