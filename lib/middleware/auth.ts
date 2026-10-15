// lib/middleware/auth.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { ApiError } from '@/lib/api-response';
import { ACCESS_FIELDS, getAccessInfo } from '@/lib/services/access';
import { ensureLibraryForUser } from '@/lib/services/library';
import type { ILibrary } from '@/lib/models/Library';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Please define the JWT_SECRET environment variable');
}

export type UserRole = 'admin' | 'librarian';

/** Auth/authorization failures jo apna HTTP status carry karti hain. */
export class AuthError extends ApiError {
  constructor(statusCode: number, message: string, code?: string) {
    super(statusCode, message, code);
    this.name = 'AuthError';
  }
}

/** Sent when a librarian's trial/plan is over — the client shows the request-approval screen. */
export const ACCESS_LOCKED = 'ACCESS_LOCKED';

export interface AuthOptions {
  /**
   * Let a librarian through even when their trial/plan has ended. Only for
   * the routes the lock screen itself needs (access status, profile).
   */
  allowLocked?: boolean;
}

export interface DecodedToken {
  userId: string;
  email: string;
  role: UserRole;
  isApproved?: boolean;
  iat?: number;
  exp?: number;
}

// Verify an existing JWT (structural verify only)
export function verifyToken(token: string): DecodedToken {
  return jwt.verify(token, JWT_SECRET!) as DecodedToken;
}

// Generate a JWT for a user
export function generateToken(
  userId: string,
  email: string,
  role: UserRole,
  isApproved: boolean = true
): string {
  const payload: DecodedToken = { userId, email, role, isApproved };
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: '7d' });
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // matches the token's 7d expiry

/** Sign a token for the user and set it as the httpOnly `authToken` cookie. */
export function attachSession(
  response: NextResponse,
  user: { _id: unknown; email: string; role: UserRole; isApproved?: boolean }
): string {
  const token = generateToken(
    String(user._id),
    user.email,
    user.role,
    Boolean(user.isApproved)
  );

  response.cookies.set('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return token;
}

/**
 * Token sources (priority order):
 * 1) Authorization: Bearer <token>
 * 2) Cookie: authToken
 */
export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookieToken = request.cookies.get('authToken')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

// ✅ For API routes: get current user from request (header/cookie)
//    and ensure user still exists, is active, and (if librarian) still has
//    access — trial running or approved plan not expired.
export async function authenticateRequest(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<DecodedToken> {
  const token = extractToken(request);
  if (!token) {
    throw new AuthError(401, 'No token provided');
  }

  const decoded = verifyToken(token);

  // DB se user ka current status check karo
  await connectDB();
  const user = await User.findById(decoded.userId).select(
    `status ${ACCESS_FIELDS}`
  );

  if (!user) {
    throw new AuthError(401, 'User not found');
  }

  // ✅ Account status check
  if (user.status && user.status !== 'active') {
    throw new AuthError(403, 'Account inactive. Please contact admin.');
  }

  // ✅ Librarian trial / approval check
  if (user.role === 'librarian' && !options.allowLocked) {
    const access = getAccessInfo(user);
    if (!access.hasAccess) {
      throw new AuthError(
        403,
        'Your free trial has ended. Send an approval request to continue.',
        ACCESS_LOCKED
      );
    }
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    role: user.role as UserRole,
    isApproved: user.isApproved,
  };
}

/**
 * For server components / server helpers:
 * Read authToken cookie directly and decode.
 */
export async function getCurrentUser(): Promise<DecodedToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('authToken')?.value;

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as DecodedToken;

    // Optional: yahan bhi active/approved check kar sakte ho
    await connectDB();
    const user = await User.findById(decoded.userId).select(
      'role isApproved status'
    );
    if (!user) return null;
    if (user.status && user.status !== 'active') return null;

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: user.role as UserRole,
      isApproved: user.isApproved,
    };
  } catch (error) {
    console.error('[getCurrentUser] Invalid token:', error);
    return null;
  }
}

// Role-based guards for API routes
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[],
  options: AuthOptions = {}
): Promise<DecodedToken> {
  const user = await authenticateRequest(request, options);
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      403,
      `Access denied. Required role: ${allowedRoles.join(' or ')}`
    );
  }
  return user;
}

export async function requireAdmin(
  request: NextRequest
): Promise<DecodedToken> {
  return requireRole(request, ['admin']);
}

export async function requireLibrarian(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<DecodedToken> {
  // Trial/approval check authenticateRequest me already ho chuka hai
  return requireRole(request, ['librarian'], options);
}

export async function requireAdminOrLibrarian(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<DecodedToken> {
  // Librarian ke liye trial/approval authenticateRequest already check kar chuka hai
  return requireRole(request, ['admin', 'librarian'], options);
}

// Convenience helpers
export function checkRole(
  decoded: DecodedToken | null,
  allowedRoles: UserRole[]
): boolean {
  if (!decoded) return false;
  return allowedRoles.includes(decoded.role);
}

export function isAdmin(decoded: DecodedToken | null): boolean {
  return decoded?.role === 'admin';
}

export function isLibrarian(decoded: DecodedToken | null): boolean {
  return decoded?.role === 'librarian';
}

export function isLibrarianOrAdmin(decoded: DecodedToken | null): boolean {
  return decoded?.role === 'admin' || decoded?.role === 'librarian';
}
/* ───────────── Library tenant context (PLAN §2.1) ───────────── */

export interface LibraryContext extends DecodedToken {
  libraryId: string;
  library: ILibrary;
}

/**
 * Librarian guard for library-scoped APIs. `libraryId` always comes from the
 * session — never from the request — so one library can't reach another's data.
 */
export async function requireLibraryContext(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<LibraryContext> {
  const user = await requireLibrarian(request, options);
  const library = await ensureLibraryForUser(user.userId);
  if (library.status === 'SUSPENDED') {
    throw new AuthError(
      403,
      'Your library has been suspended. Please contact the platform admin.',
      'LIBRARY_SUSPENDED'
    );
  }
  return { ...user, libraryId: String(library._id), library };
}

/** libraryId for writes from older librarian routes (null for admins). */
export async function libraryIdFor(user: DecodedToken): Promise<string | null> {
  if (user.role !== 'librarian') return null;
  const library = await ensureLibraryForUser(user.userId);
  return String(library._id);
}
