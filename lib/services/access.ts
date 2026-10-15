// lib/services/access.ts
import { SystemSettings } from '@/lib/models/SystemSettings';

export const DEFAULT_TRIAL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a librarian stands:
 * - trial          free trial running, no request sent yet
 * - pending        request sent, waiting for the admin (usable while the trial lasts)
 * - active         approved, plan not expired
 * - trial_expired  trial over, no request sent yet
 * - rejected       admin rejected the request (can send a new one)
 * - plan_expired   approved plan has run out (can request a renewal)
 */
export type AccessStatus =
  | 'trial'
  | 'pending'
  | 'active'
  | 'trial_expired'
  | 'rejected'
  | 'plan_expired';

export interface AccessInfo {
  status: AccessStatus;
  hasAccess: boolean;
  trialEndsAt: Date;
  planExpiresAt: Date | null;
  approvalRequestedAt: Date | null;
  rejectionReason: string | null;
}

/** The fields `getAccessInfo` reads — select these when loading the user. */
export const ACCESS_FIELDS =
  'role isApproved createdAt trialEndsAt rejectedAt rejectionReason approvalRequestedAt planExpiresAt';

interface AccessSubject {
  role: string;
  isApproved?: boolean;
  createdAt?: Date;
  trialEndsAt?: Date | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  approvalRequestedAt?: Date | null;
  planExpiresAt?: Date | null;
}

export async function getTrialDays(): Promise<number> {
  const settings = await SystemSettings.findOne().select('trialDays').lean<{
    trialDays?: number;
  }>();
  const days = settings?.trialDays;
  return typeof days === 'number' && days >= 0 ? days : DEFAULT_TRIAL_DAYS;
}

export function trialEndFrom(start: Date, trialDays: number): Date {
  return new Date(start.getTime() + trialDays * DAY_MS);
}

export function getAccessInfo(user: AccessSubject, now = new Date()): AccessInfo {
  // Accounts created before trials existed have no trialEndsAt
  const trialEndsAt =
    user.trialEndsAt ??
    trialEndFrom(user.createdAt ?? now, DEFAULT_TRIAL_DAYS);
  const trialRunning = trialEndsAt > now;

  const base = {
    trialEndsAt,
    planExpiresAt: user.planExpiresAt ?? null,
    approvalRequestedAt: user.approvalRequestedAt ?? null,
    rejectionReason: user.rejectionReason ?? null,
  };

  if (user.role !== 'librarian') {
    return { ...base, status: 'active', hasAccess: true };
  }

  if (user.isApproved) {
    if (user.planExpiresAt && user.planExpiresAt <= now) {
      return { ...base, status: 'plan_expired', hasAccess: false };
    }
    return { ...base, status: 'active', hasAccess: true };
  }

  if (user.rejectedAt) {
    return { ...base, status: 'rejected', hasAccess: false };
  }

  if (user.approvalRequestedAt) {
    return { ...base, status: 'pending', hasAccess: trialRunning };
  }

  return trialRunning
    ? { ...base, status: 'trial', hasAccess: true }
    : { ...base, status: 'trial_expired', hasAccess: false };
}

/** Approval end date for a plan, counted from now. */
export function planExpiryFrom(durationDays: number | undefined | null): Date | null {
  if (!durationDays || durationDays <= 0) return null;
  return new Date(Date.now() + durationDays * DAY_MS);
}
