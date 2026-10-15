import { describe, expect, it } from 'vitest';
import {
  checkoutFields,
  computeArrival,
  deriveStatus,
  isPastAutoCheckout,
  isWithinCheckinWindow,
} from '@/lib/attendance-rules';

const start = new Date('2026-10-16T03:30:00Z'); // 09:00 IST
const end = new Date('2026-10-16T09:30:00Z'); // 15:00 IST
const at = (min: number) => new Date(start.getTime() + min * 60000);

describe('R2 grace period', () => {
  it('on time and exactly at grace is Present', () => {
    expect(computeArrival(at(0), start, 15)).toEqual({ arrivalStatus: 'PRESENT', lateMinutes: 0 });
    expect(computeArrival(at(15), start, 15).arrivalStatus).toBe('PRESENT');
    expect(computeArrival(at(-30), start, 15).arrivalStatus).toBe('PRESENT');
  });
  it('after grace is Late by the full minutes from start', () => {
    expect(computeArrival(at(16), start, 15)).toEqual({ arrivalStatus: 'LATE', lateMinutes: 16 });
    expect(computeArrival(at(42.2), start, 15).lateMinutes).toBe(43);
  });
  it('grace of 0 makes any delay late', () => {
    expect(computeArrival(at(1), start, 0).arrivalStatus).toBe('LATE');
  });
});

describe('status and checkout', () => {
  it('inside wins, then left early, then arrival', () => {
    expect(deriveStatus({ isInside: true, arrivalStatus: 'LATE' })).toBe('CURRENTLY_INSIDE');
    expect(deriveStatus({ isInside: false, leftEarly: true, arrivalStatus: 'LATE' })).toBe('LEFT_EARLY');
    expect(deriveStatus({ isInside: false, leftEarly: false, arrivalStatus: 'LATE' })).toBe('LATE');
  });
  it('computes study minutes and left-early', () => {
    const r = checkoutFields(at(0), at(125), end);
    expect(r.totalMinutes).toBe(125);
    expect(r.leftEarly).toBe(true);
    expect(checkoutFields(at(0), end, end).leftEarly).toBe(false);
  });
});

describe('R1 windows', () => {
  it('auto check-out only after end + 30 min', () => {
    expect(isPastAutoCheckout(end, new Date(end.getTime() + 30 * 60000))).toBe(false);
    expect(isPastAutoCheckout(end, new Date(end.getTime() + 31 * 60000))).toBe(true);
  });
  it('check-in window opens 60 min early and closes at shift end', () => {
    const occ = { start, end };
    expect(isWithinCheckinWindow(occ, at(-61), 60)).toBe(false);
    expect(isWithinCheckinWindow(occ, at(-60), 60)).toBe(true);
    expect(isWithinCheckinWindow(occ, end, 60)).toBe(true);
    expect(isWithinCheckinWindow(occ, new Date(end.getTime() + 1000), 60)).toBe(false);
  });
});
