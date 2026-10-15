// lib/models/AuditLog.ts — PLAN R8
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

export interface IAuditLog extends Document {
  libraryId?: mongoose.Types.ObjectId | null;
  actorId?: mongoose.Types.ObjectId | null;
  actorRole: 'admin' | 'librarian' | 'student' | 'system';
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', default: null },
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorRole: {
      type: String,
      enum: ['admin', 'librarian', 'student', 'system'],
      required: true,
    },
    action: { type: String, required: true },
    entity: { type: String },
    entityId: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ libraryId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = defineModel<IAuditLog>('AuditLog', AuditLogSchema);
