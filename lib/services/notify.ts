// lib/services/notify.ts — create in-app notifications. Never throws: a
// notification failing must not undo the action it reports.
import { Notification, type NotificationSection } from '@/lib/models/Notification';

interface Note {
  section: NotificationSection;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

async function create(doc: Record<string, unknown>) {
  try {
    await Notification.create(doc);
  } catch (err) {
    console.error('[Notify] failed', doc.type, err);
  }
}

/** For the librarian(s) of one library. */
export function notifyLibrary(libraryId: unknown, note: Note) {
  return create({ audience: 'library', libraryId, ...note });
}

/** For every platform admin. */
export function notifyAdmins(note: Note) {
  return create({ audience: 'admin', ...note });
}

/** For one user (e.g. a librarian about their own account). */
export function notifyUser(userId: unknown, note: Note) {
  return create({ audience: 'user', userId, ...note });
}
