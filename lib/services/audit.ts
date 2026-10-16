// lib/services/audit.ts — PLAN R8. Never throws: an audit failure must not
// break the action being audited.
import type { NextRequest } from 'next/server';
import { AuditLog } from '@/lib/models/AuditLog';

export type AuditAction =
  | 'librarian.login'
  | 'attendance.manual_checkin'
  | 'attendance.manual_checkout'
  | 'attendance.override'
  | 'library.settings_updated'
  | 'library.qr_rotated'
  | 'shift.created'
  | 'shift.updated'
  | 'shift.deleted'
  | 'seat.assigned'
  | 'seat.released'
  | 'seat.created'
  | 'seat.deleted'
  | 'demo.started'
  | 'demo.extended'
  | 'demo.ended'
  | 'demo.expired'
  | 'membership.activated'
  | 'payment.recorded'
  | 'attendance.manual_present'
  | 'attendance.manual_absent'
  | 'library.otp_toggled'
  | 'qr_access.updated'
  | 'qr_access.credits_added'
  | 'qr_access.credits_adjusted'
  | 'qr_access.expired'
  | 'qr_access.requested';

export function clientIp(req?: NextRequest): string | undefined {
  if (!req) return undefined;
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined
  );
}

export async function logAudit(entry: {
  action: AuditAction;
  actorId?: string | null;
  actorRole: 'admin' | 'librarian' | 'student' | 'system';
  libraryId?: string | null;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  request?: NextRequest;
}): Promise<void> {
  try {
    await AuditLog.create({
      action: entry.action,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole,
      libraryId: entry.libraryId ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta,
      ip: clientIp(entry.request),
    });
  } catch (err) {
    console.error('[Audit] failed to write', entry.action, err);
  }
}
