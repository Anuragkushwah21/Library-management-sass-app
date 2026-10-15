// lib/date-rules.ts — "no past dates" rules shared by forms and API routes
import { format } from 'date-fns';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today as yyyy-MM-dd in the browser's timezone — for `min` on <input type="date">. */
export function todayInput(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * `min` for editing a saved date: today, or the saved value if it is already
 * in the past, so an untouched old date doesn't block saving the form.
 */
export function minForExisting(saved?: string | null): string {
  const today = todayInput();
  return saved && saved < today ? saved : today;
}

/**
 * Server check: is this date before today? Allows one day of slack, because
 * the server's "today" (often UTC) can lag the user's local date — the
 * browser `min` already enforces the exact day.
 */
export function isPastDate(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const startOfUtcToday = new Date();
  startOfUtcToday.setUTCHours(0, 0, 0, 0);
  return d.getTime() < startOfUtcToday.getTime() - DAY_MS;
}

/** Same calendar day (yyyy-MM-dd, UTC) — used to let an unchanged saved date through. */
export function sameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}
