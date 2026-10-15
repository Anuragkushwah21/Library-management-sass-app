// lib/attendance-rules.ts — PLAN.md R1/R2 as pure functions. Unit-tested.
import { minutesBetween, MIN_MS } from '@/lib/time';

export const AUTO_CHECKOUT_AFTER_MINUTES = 30;
export const DEFAULT_GRACE_MINUTES = 15;
export const DEFAULT_EARLY_CHECKIN_MINUTES = 60;

export type ArrivalStatus = 'PRESENT' | 'LATE' | 'ABSENT';
export type AttendanceStatus = ArrivalStatus | 'LEFT_EARLY' | 'CURRENTLY_INSIDE';

/** R2: Late = checkInAt > shiftStart + grace. */
export function computeArrival(
  checkInAt: Date,
  shiftStart: Date,
  graceMinutes: number
): { arrivalStatus: 'PRESENT' | 'LATE'; lateMinutes: number } {
  const lateBy = (checkInAt.getTime() - shiftStart.getTime()) / MIN_MS;
  if (lateBy > graceMinutes) {
    return { arrivalStatus: 'LATE', lateMinutes: Math.ceil(lateBy) };
  }
  return { arrivalStatus: 'PRESENT', lateMinutes: 0 };
}

/** The single status used for filtering (PLAN §2.5). */
export function deriveStatus(r: {
  isInside: boolean;
  leftEarly?: boolean;
  arrivalStatus: ArrivalStatus;
}): AttendanceStatus {
  if (r.isInside) return 'CURRENTLY_INSIDE';
  if (r.leftEarly) return 'LEFT_EARLY';
  return r.arrivalStatus;
}

export function checkoutFields(checkInAt: Date, checkOutAt: Date, shiftEnd: Date) {
  return {
    checkOutAt,
    totalMinutes: minutesBetween(checkInAt, checkOutAt),
    leftEarly: checkOutAt.getTime() < shiftEnd.getTime(),
    isInside: false,
  };
}

/** R1: an open record is auto-closed once shift end + 30 min has passed. */
export function isPastAutoCheckout(shiftEnd: Date, now: Date): boolean {
  return now.getTime() > shiftEnd.getTime() + AUTO_CHECKOUT_AFTER_MINUTES * MIN_MS;
}

/** R1: check-in accepted from start − early minutes up to shift end. */
export function isWithinCheckinWindow(
  occ: { start: Date; end: Date },
  now: Date,
  earlyMinutes: number
): boolean {
  return (
    now.getTime() >= occ.start.getTime() - earlyMinutes * MIN_MS &&
    now.getTime() <= occ.end.getTime()
  );
}
