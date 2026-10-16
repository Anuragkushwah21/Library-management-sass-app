import { describe, expect, it } from 'vitest';
import {
  defaultDemoEndKey,
  demoBadge,
  demoDaysLeft,
  demoLengthDays,
  endOfDay,
  validateDemoDates,
} from '@/lib/demo-rules';

const IST = 'Asia/Kolkata';

describe('demo dates (D8, R15)', () => {
  it('default end = start + 3 days, inclusive (Mon → Thu = 4 days)', () => {
    expect(defaultDemoEndKey('2026-10-19', 3)).toBe('2026-10-22');
    expect(demoLengthDays('2026-10-19', '2026-10-22')).toBe(4);
  });
  it('the demo runs until 23:59:59.999 library time on the end date', () => {
    expect(endOfDay('2026-10-22', IST).toISOString()).toBe('2026-10-22T18:29:59.999Z');
  });
  it('validation messages', () => {
    const today = '2026-10-16';
    expect(validateDemoDates('2026-10-16', '2026-10-19', today)).toBeNull();
    expect(validateDemoDates('2026-10-15', '2026-10-19', today)).toBe("Demo start date can't be in the past.");
    expect(validateDemoDates('2026-10-18', '2026-10-17', today)).toBe('Demo end date must be on or after the start date.');
    expect(validateDemoDates('2026-10-16', '2026-11-15', today)).toBe('A demo can be at most 30 days.');
    expect(validateDemoDates('2026-10-16', '2026-11-14', today)).toBeNull();
    expect(validateDemoDates('', '2026-11-14', today)).toBe('Demo start date is required.');
  });
  it('days left and badge colour', () => {
    const end = endOfDay('2026-10-22', IST);
    const at = (iso: string) => new Date(iso);
    expect(demoDaysLeft(end, at('2026-10-19T05:00:00Z'), IST)).toBe(3);
    expect(demoBadge(3)).toBe('green');
    expect(demoBadge(2)).toBe('green');
    expect(demoDaysLeft(end, at('2026-10-21T05:00:00Z'), IST)).toBe(1);
    expect(demoBadge(1)).toBe('yellow');
    expect(demoDaysLeft(end, at('2026-10-22T05:00:00Z'), IST)).toBe(0);
    expect(demoBadge(0)).toBe('red');
    expect(demoDaysLeft(end, at('2026-10-23T05:00:00Z'), IST)).toBe(-1);
    expect(demoBadge(-1)).toBe('red');
  });
});
