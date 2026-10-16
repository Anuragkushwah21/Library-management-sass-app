// lib/time.ts — library-timezone date/shift math. Pure (no DB), unit-tested.
//
// Every "today", shift window and attendance date goes through here, because
// the server runs in UTC while libraries run on local time (default IST).

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = formatterFor(tz).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Library-local calendar date, YYYY-MM-DD. */
export function localDateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidHHmm(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** "HH:mm" → minutes after midnight. */
export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

/** Offset of `tz` from UTC at instant `t`, in ms (IST → +19 800 000). */
function tzOffsetMs(t: number, tz: string): number {
  const p = zonedParts(new Date(t), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** The UTC instant of a library-local wall-clock time. */
export function zonedTimeToUtc(dateKey: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle DST edges; IST has none but other zones might
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return new Date(t);
}

export interface ShiftTimes {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export function crossesMidnight(shift: ShiftTimes): boolean {
  return hhmmToMinutes(shift.endTime) <= hhmmToMinutes(shift.startTime);
}

export function shiftDurationMinutes(shift: ShiftTimes): number {
  const s = hhmmToMinutes(shift.startTime);
  const e = hhmmToMinutes(shift.endTime);
  return e > s ? e - s : e + 24 * 60 - s;
}

export interface ShiftOccurrence {
  /** Library-local date the shift STARTS on — the attendance date. */
  date: string;
  start: Date;
  end: Date;
}

/** The concrete start/end instants of a shift on a given local start date. */
export function shiftOccurrence(shift: ShiftTimes, dateKey: string, tz: string): ShiftOccurrence {
  const start = zonedTimeToUtc(dateKey, shift.startTime, tz);
  const end = new Date(start.getTime() + shiftDurationMinutes(shift) * MIN_MS);
  return { date: dateKey, start, end };
}

/**
 * Occurrences that could be "current" at `now`: the one starting today and,
 * for midnight-crossing shifts, the one that started yesterday.
 */
export function nearbyOccurrences(shift: ShiftTimes, now: Date, tz: string): ShiftOccurrence[] {
  const today = localDateKey(now, tz);
  return [addDaysToKey(today, -1), today, addDaysToKey(today, 1)].map((k) =>
    shiftOccurrence(shift, k, tz)
  );
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MIN_MS));
}

/** "14:00" → "2:00 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** An instant as library-local "2:05 PM". */
export function formatInstant(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(date))
    .toUpperCase();
}

/** 135 → "2h 15m" */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Lateness for people: 25 → "25 min", 90 → "1 hour 30 min", 120 → "2 hours". */
export function formatLate(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return m ? `${hours} ${m} min` : hours;
}

export { MIN_MS, DAY_MS };
