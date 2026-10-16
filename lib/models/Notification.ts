// lib/models/Notification.ts — in-app notifications behind the bell / sidebar badges
import mongoose, { Schema, Document } from 'mongoose';
import { defineModel } from './define-model';

/** Which sidebar item the notification belongs to (drives the per-section badge). */
export const NOTIFICATION_SECTIONS = ['students', 'memberships', 'account', 'approvals', 'messages', 'librarians'] as const;
export type NotificationSection = (typeof NOTIFICATION_SECTIONS)[number];

export interface INotification extends Document {
  /** library = that library's librarian(s); admin = every admin; user = one person */
  audience: 'library' | 'admin' | 'user';
  libraryId?: mongoose.Types.ObjectId | null;
  userId?: mongoose.Types.ObjectId | null;
  section: NotificationSection;
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** Read per person, so several admins each have their own unread state */
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    audience: { type: String, enum: ['library', 'admin', 'user'], required: true },
    libraryId: { type: Schema.Types.ObjectId, ref: 'Library', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    section: { type: String, enum: NOTIFICATION_SECTIONS, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, maxlength: 300 },
    link: { type: String, maxlength: 200 },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ audience: 1, libraryId: 1, createdAt: -1 });
NotificationSchema.index({ audience: 1, userId: 1, createdAt: -1 });
// Old notifications clean themselves up after 60 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export const Notification = defineModel<INotification>('Notification', NotificationSchema);
