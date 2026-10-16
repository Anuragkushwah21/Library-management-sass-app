// lib/services/checkin.ts — the QR scan state machine (PLAN §5.2, R1, R5)
import { Attendance } from '@/lib/models/Attendance';
import { Student, type IStudent } from '@/lib/models/Students';
import { User } from '@/lib/models/User';
import type { ILibrary } from '@/lib/models/Library';
import { Shift, type IShift } from '@/lib/models/Shift';
import { ACCESS_FIELDS, getAccessInfo } from '@/lib/services/access';
import {
  autoCloseOpenRecords,
  checkOut,
  createCheckIn,
  libraryTz,
  shiftsForStudent,
} from '@/lib/services/attendance';
import { daysLeft, deriveMemberStatus } from '@/lib/services/student-status';
import { expireDemos } from '@/lib/services/demo';
import { isWithinCheckinWindow, AUTO_CHECKOUT_AFTER_MINUTES } from '@/lib/attendance-rules';
import { localDateKey, MIN_MS, nearbyOccurrences, type ShiftOccurrence } from '@/lib/time';

/**
 * A second scan this soon after check-in is a double tap or a page refresh,
 * not a check-out (PLAN §9).
 */
export const REPEAT_SCAN_GUARD_MS = 2 * 60 * 1000;

/** D4: students keep checking in this long after the owner's own access lapses. */
export const OWNER_LAPSE_GRACE_DAYS = 7;

export type ScanOutcome =
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'ALREADY_CHECKED_OUT'
  | 'NOT_REGISTERED'
  | 'DEMO_NOT_STARTED'
  | 'QR_DISABLED'
  | 'AWAITING_APPROVAL'
  | 'REJECTED'
  | 'ACCESS_DENIED'
  | 'RENEWAL_REQUIRED'
  | 'OUTSIDE_SHIFT_HOURS'
  | 'NO_SHIFTS'
  | 'LIBRARY_UNAVAILABLE'
  | 'OUT_OF_RANGE'
  | 'LOCATION_REQUIRED';

export interface ScanResult {
  outcome: ScanOutcome;
  library: { name: string; phone?: string | null; address?: string | null };
  student?: { name: string; seatNumber: number | null; status: string };
  shift?: { name: string; startTime: string; endTime: string };
  membership?: { endDate: string | null; daysLeft: number | null; expiringSoon: boolean; isDemo?: boolean };
  attendance?: {
    checkInAt: string | null;
    checkOutAt: string | null;
    totalMinutes: number;
    arrivalStatus: string;
    lateMinutes: number;
    autoCheckedOut: boolean;
  };
  nextShiftStart?: string | null;
  /** true when this scan repeated a check-in seconds ago and changed nothing */
  repeat?: boolean;
  timezone?: string;
  message?: string;
}

/** Is the library open for check-ins? (suspended, or owner lapsed past D4 grace) */
export async function libraryIsAvailable(library: ILibrary, now = new Date()): Promise<boolean> {
  if (library.status === 'SUSPENDED') return false;
  const owner = await User.findById(library.ownerId).select(`status ${ACCESS_FIELDS}`);
  if (!owner || (owner.status && owner.status !== 'active')) return false;

  const access = getAccessInfo(owner, now);
  if (access.hasAccess) return true;

  const lockedSince =
    access.status === 'plan_expired'
      ? access.planExpiresAt
      : access.status === 'rejected'
      ? owner.rejectedAt ?? access.trialEndsAt
      : access.trialEndsAt;
  if (!lockedSince) return false;
  return now.getTime() - new Date(lockedSince).getTime() <= OWNER_LAPSE_GRACE_DAYS * 24 * 60 * MIN_MS;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function libraryInfo(library: ILibrary) {
  return { name: library.name, phone: library.phone ?? null, address: library.address ?? null };
}

function membershipInfo(student: IStudent, library: ILibrary, now: Date) {
  // Demo students count down their demo, members their membership
  const isDemo = student.status === 'DEMO' || student.status === 'DEMO_ENDED';
  const end = isDemo ? student.demoEndDate : student.membershipEndDate;
  const left = daysLeft(end, now);
  return {
    endDate: end ? end.toISOString() : null,
    daysLeft: left,
    expiringSoon: !isDemo && left !== null && left <= (library.settings?.expiringSoonDays ?? 7),
    isDemo,
  };
}



export async function findStudentByPhone(libraryId: unknown, phone: string) {
  // Newest first in case unresolved legacy duplicates exist (PLAN §2.2)
  return Student.findOne({ libraryId, phone, status: { $ne: 'REJECTED' } }).sort({ updatedAt: -1 });
}

export async function scan(args: {
  library: ILibrary;
  phone: string;
  now?: Date;
  location?: { lat: number; lng: number } | null;
}): Promise<ScanResult> {
  const { library, phone } = args;
  const now = args.now ?? new Date();
  const lib = libraryInfo(library);
  const tz = libraryTz(library);

  if (!(await libraryIsAvailable(library, now))) {
    return { outcome: 'LIBRARY_UNAVAILABLE', library: lib };
  }

  const geo = library.settings?.geofence;
  if (geo?.enabled && geo.lat != null && geo.lng != null) {
    if (!args.location) return { outcome: 'LOCATION_REQUIRED', library: lib };
    const d = distanceMeters(geo.lat, geo.lng, args.location.lat, args.location.lng);
    if (d > (geo.radiusMeters ?? 200)) {
      return { outcome: 'OUT_OF_RANGE', library: lib, message: `You are about ${Math.round(d)} m from the library.` };
    }
  }

  const student = await findStudentByPhone(library._id, phone);
  if (!student) return { outcome: 'NOT_REGISTERED', library: lib };

  // R4 at scan time: a demo past its end date ends now (seat freed)
  if (student.status === 'DEMO' && student.demoEndDate && student.demoEndDate < now) {
    await expireDemos(library._id, String(student.librarianId), now);
    const fresh = await Student.findById(student._id);
    if (fresh) Object.assign(student, { status: fresh.status, seatNumber: fresh.seatNumber });
  }

  const studentInfo = { name: student.name, seatNumber: student.seatNumber ?? null, status: student.status };

  if (student.status === 'DEMO' && student.demoStartDate && student.demoStartDate > now) {
    return {
      outcome: 'DEMO_NOT_STARTED',
      library: lib,
      student: studentInfo,
      membership: membershipInfo(student, library, now),
      message: student.demoStartDate.toISOString(),
    };
  }

  switch (student.status) {
    case 'PENDING':
      return { outcome: 'AWAITING_APPROVAL', library: lib, student: studentInfo };
    case 'BLOCKED':
      return { outcome: 'ACCESS_DENIED', library: lib, student: studentInfo };
  }

  // R5: lapsed membership found at scan time → mark expired, no attendance
  const derived = deriveMemberStatus(student.status, student.membershipEndDate, now);
  if (derived !== student.status) {
    student.status = derived;
    if (derived === 'EXPIRED') student.membershipStatus = 'expired';
    await student.save();
  }
  if (student.status === 'EXPIRED' || student.status === 'DEMO_ENDED') {
    return {
      outcome: 'RENEWAL_REQUIRED',
      library: lib,
      student: { ...studentInfo, status: student.status },
      membership: membershipInfo(student, library, now),
    };
  }

  // Close anything left open past shift end + 30 min before deciding
  await autoCloseOpenRecords({ studentId: student._id }, now);

  const shifts = await shiftsForStudent(library._id as any, student.shiftId);
  if (shifts.length === 0) return { outcome: 'NO_SHIFTS', library: lib, student: studentInfo };
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  const shiftPayload = (s: IShift) => ({ name: s.name, startTime: s.startTime, endTime: s.endTime });

  const base = {
    timezone: tz,
    library: lib,
    student: studentInfo,
    membership: membershipInfo(student, library, now),
  };
  const attendancePayload = (r: any) => ({
    checkInAt: r.checkInAt ? new Date(r.checkInAt).toISOString() : null,
    checkOutAt: r.checkOutAt ? new Date(r.checkOutAt).toISOString() : null,
    totalMinutes: r.totalMinutes ?? 0,
    arrivalStatus: r.arrivalStatus,
    lateMinutes: r.lateMinutes ?? 0,
    autoCheckedOut: Boolean(r.autoCheckedOut),
  });

  // R1 second scan: an open record → check-out
  const open = await Attendance.findOne({ studentId: student._id, isInside: true }).sort({ checkInAt: -1 });
  if (open) {
    if (open.checkInAt && now.getTime() - open.checkInAt.getTime() < REPEAT_SCAN_GUARD_MS) {
      const s = shiftById.get(String(open.shiftId)) ?? (await Shift.findById(open.shiftId));
      return {
        ...base,
        outcome: 'CHECKED_IN',
        repeat: true,
        shift: s ? shiftPayload(s) : undefined,
        attendance: attendancePayload(open),
      };
    }
    const closed = await checkOut(open, now, { source: 'QR' });
    const rec = closed ?? (await Attendance.findById(open._id));
    // The open shift may not be in `shifts` (student moved to another shift since)
    const s = shiftById.get(String(open.shiftId)) ?? (await Shift.findById(open.shiftId));
    return {
      ...base,
      outcome: 'CHECKED_OUT',
      shift: s ? shiftPayload(s) : undefined,
      attendance: attendancePayload(rec),
    };
  }

  // Which shift occurrence is "now"? Prefer one that has actually started.
  const early = library.settings?.earlyCheckinMinutes ?? 60;
  const candidates: { shift: IShift; occ: ShiftOccurrence }[] = [];
  for (const shift of shifts) {
    for (const occ of nearbyOccurrences(shift, now, tz)) {
      if (isWithinCheckinWindow(occ, now, early)) candidates.push({ shift, occ });
    }
  }
  candidates.sort((a, b) => {
    const aStarted = a.occ.start <= now ? 0 : 1;
    const bStarted = b.occ.start <= now ? 0 : 1;
    return aStarted - bStarted || a.occ.start.getTime() - b.occ.start.getTime();
  });

  for (const { shift, occ } of candidates) {
    const existing = await Attendance.findOne({ studentId: student._id, shiftId: shift._id, date: occ.date });
    if (existing?.checkOutAt) continue; // R1 third scan for this occurrence — try another shift
    const { record } = await createCheckIn({ library, student, shift, occ, at: now, source: 'QR' });
    if (record.checkOutAt) continue;
    return { ...base, outcome: 'CHECKED_IN', shift: shiftPayload(shift), attendance: attendancePayload(record) };
  }

  // R1 third scan: every current occurrence is already closed, or the student
  // checked out earlier today (incl. the 30-min tail after shift end)
  const today = localDateKey(now, tz);
  const closedToday = await Attendance.findOne({
    studentId: student._id,
    checkOutAt: { $ne: null },
    $or: [
      { date: today },
      { shiftEndAt: { $gte: new Date(now.getTime() - AUTO_CHECKOUT_AFTER_MINUTES * MIN_MS) } },
    ],
  }).sort({ checkOutAt: -1 });
  if (closedToday) {
    const s = shiftById.get(String(closedToday.shiftId)) ?? (await Shift.findById(closedToday.shiftId));
    return {
      ...base,
      outcome: 'ALREADY_CHECKED_OUT',
      shift: s ? shiftPayload(s) : undefined,
      attendance: attendancePayload(closedToday),
    };
  }

  // Outside every window — tell them when the next one starts
  const next = shifts
    .flatMap((s) => nearbyOccurrences(s, now, tz).map((o) => ({ s, o })))
    .filter(({ o }) => o.start.getTime() - early * MIN_MS > now.getTime())
    .sort((a, b) => a.o.start.getTime() - b.o.start.getTime())[0];

  return {
    ...base,
    outcome: 'OUTSIDE_SHIFT_HOURS',
    shift: next ? shiftPayload(next.s) : shiftPayload(shifts[0]),
    nextShiftStart: next ? next.o.start.toISOString() : null,
  };
}
