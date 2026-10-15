// lib/services/student-status.ts — keep Student.status and the legacy fields in step
import type { StudentStatus } from '@/lib/models/Students';

/** Statuses that are set deliberately and never recomputed from dates. */
const MANUAL: StudentStatus[] = ['PENDING', 'DEMO', 'REJECTED', 'BLOCKED', 'DEMO_ENDED'];

/**
 * Member status from membership dates. A member with no end date is open-ended.
 * Used by the add/edit student routes, the scan, and the backfill.
 */
export function deriveMemberStatus(
  current: StudentStatus | undefined | null,
  membershipEndDate: Date | string | null | undefined,
  now = new Date()
): StudentStatus {
  if (current && MANUAL.includes(current)) return current;
  if (membershipEndDate) {
    const end = new Date(membershipEndDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) return 'EXPIRED';
  }
  return 'ACTIVE_MEMBER';
}

export function daysLeft(end: Date | string | null | undefined, now = new Date()): number | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
