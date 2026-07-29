// lib/middleware/auth.ts
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { ApiError } from '@/lib/api-response';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Please define the JWT_SECRET environment variable');
}

export type UserRole = 'admin' | 'librarian';

/** Auth/authorization failures jo apna HTTP status carry karti hain. */
export class AuthError extends ApiError {
  constructor(statusCode: number, message: string) {
    super(statusCode, message);
    this.name = 'AuthError';
  }
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
//    and ensure user still exists, is active, and (if librarian) approved.
export async function authenticateRequest(
  request: NextRequest
): Promise<DecodedToken> {
  const token = extractToken(request);
  if (!token) {
    throw new AuthError(401, 'No token provided');
  }

  const decoded = verifyToken(token);

  // DB se user ka current status check karo
  await connectDB();
  const user = await User.findById(decoded.userId).select(
    'role isApproved status'
  );

  if (!user) {
    throw new AuthError(401, 'User not found');
  }

  // ✅ Account status check
  if (user.status && user.status !== 'active') {
    throw new AuthError(403, 'Account inactive. Please contact admin.');
  }

  // ✅ Librarian approval check (extra safety)
  if (user.role === 'librarian' && !user.isApproved) {
    throw new AuthError(403, 'Your account is pending approval');
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
  allowedRoles: UserRole[]
): Promise<DecodedToken> {
  const user = await authenticateRequest(request);
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
  request: NextRequest
): Promise<DecodedToken> {
  const user = await requireRole(request, ['librarian']);
  // isApproved check authenticateRequest me already ho chuka hai
  return user;
}

export async function requireAdminOrLibrarian(
  request: NextRequest
): Promise<DecodedToken> {
  const user = await requireRole(request, ['admin', 'librarian']);
  // librarian ke liye approval/authenticateRequest already check kar chuka hai
  return user;
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