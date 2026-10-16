import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  formatLate,
  crossesMidnight,
  localDateKey,
  nearbyOccurrences,
  shiftOccurrence,
  zonedTimeToUtc,
} from '@/lib/time';

const IST = 'Asia/Kolkata';

describe('time helpers', () => {
  it('local date key follows the library timezone, not UTC', () => {
    // 20:00 UTC = 01:30 next day in IST
    expect(localDateKey(new Date('2026-10-15T20:00:00Z'), IST)).toBe('2026-10-16');
    expect(localDateKey(new Date('2026-10-15T20:00:00Z'), 'UTC')).toBe('2026-10-15');
  });

  it('converts library wall time to UTC', () => {
    expect(zonedTimeToUtc('2026-10-16', '09:00', IST).toISOString()).toBe('2026-10-16T03:30:00.000Z');
    // DST zone: 09:00 New York in July is EDT (UTC-4)
    expect(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });

  it('adds days across month ends', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('night shift crosses midnight and ends the next day', () => {
    const night = { startTime: '22:00', endTime: '06:00' };
    expect(crossesMidnight(night)).toBe(true);
    const occ = shiftOccurrence(night, '2026-10-16', IST);
    expect(occ.start.toISOString()).toBe('2026-10-16T16:30:00.000Z');
    expect(occ.end.toISOString()).toBe('2026-10-17T00:30:00.000Z');
  });

  it('a 02:00 scan finds the night shift that started yesterday', () => {
    const night = { startTime: '22:00', endTime: '06:00' };
    const now = zonedTimeToUtc('2026-10-17', '02:00', IST);
    const current = nearbyOccurrences(night, now, IST).find((o) => o.start <= now && now <= o.end);
    expect(current?.date).toBe('2026-10-16');
  });
});

describe('formatLate', () => {
  it('stays in minutes under an hour, switches to hours from 60', () => {
    expect(formatLate(25)).toBe('25 min');
    expect(formatLate(59)).toBe('59 min');
    expect(formatLate(60)).toBe('1 hour');
    expect(formatLate(90)).toBe('1 hour 30 min');
    expect(formatLate(61)).toBe('1 hour 1 min');
    expect(formatLate(120)).toBe('2 hours');
    expect(formatLate(155)).toBe('2 hours 35 min');
  });
});
