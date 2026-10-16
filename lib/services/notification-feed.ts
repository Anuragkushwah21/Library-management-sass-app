// lib/services/notification-feed.ts — what one signed-in person can see
import mongoose from 'mongoose';
import type { DecodedToken } from '@/lib/middleware/auth';
import { libraryIdFor } from '@/lib/middleware/auth';

/** Mongo filter for the notifications addressed to this person. */
export async function audienceFilter(user: DecodedToken) {
  const userId = new mongoose.Types.ObjectId(user.userId);
  if (user.role === 'admin') {
    return { $or: [{ audience: 'admin' }, { audience: 'user', userId }] };
  }
  const libraryId = await libraryIdFor(user);
  return {
    $or: [
      ...(libraryId ? [{ audience: 'library', libraryId: new mongoose.Types.ObjectId(libraryId) }] : []),
      { audience: 'user', userId },
    ],
  };
}
