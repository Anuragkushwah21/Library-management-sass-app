// lib/review-token.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Please define the JWT_SECRET environment variable');
}

const PURPOSE = 'librarian-review';

export interface ReviewTokenPayload {
  purpose: typeof PURPOSE;
  librarianId: string;
  iat?: number;
  exp?: number;
}

/**
 * Short-lived token for the approve/reject link emailed to admins.
 *
 * The purpose field exists so an auth token cannot be used here, and this
 * token cannot be used elsewhere — both are signed with the same JWT_SECRET.
 */
export function createReviewToken(librarianId: string): string {
  return jwt.sign({ purpose: PURPOSE, librarianId }, JWT_SECRET!, {
    expiresIn: '7d',
  });
}

export function verifyReviewToken(token: string): ReviewTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as ReviewTokenPayload;
    if (decoded?.purpose !== PURPOSE || !decoded.librarianId) return null;
    return decoded;
  } catch {
    return null;
  }
}
