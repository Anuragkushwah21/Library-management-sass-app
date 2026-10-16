// proxy.ts (replaces `middleware.ts` in Next.js 16)
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Runs on the Edge runtime, so `jsonwebtoken` (Node crypto) is unavailable —
 * we use `jose` instead. This is only the first gate: is the token valid and
 * does the role match. The active/approved DB check happens in API routes via
 * `authenticateRequest` (the DB is not reachable from the Edge).
 */

const JWT_SECRET = process.env.JWT_SECRET;

const ADMIN_PREFIX = '/admin';
const LIBRARIAN_PREFIX = '/librarian';

interface TokenPayload {
  userId?: string;
  email?: string;
  role?: 'admin' | 'librarian';
}

async function readToken(request: NextRequest): Promise<TokenPayload | null> {
  const token = request.cookies.get('authToken')?.value;
  if (!token || !JWT_SECRET) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest) {
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);

  const response = NextResponse.redirect(url);
  // Clear the stale/invalid cookie, otherwise this can loop
  response.cookies.delete('authToken');
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  // Printable receipts live outside the dashboard layout but are librarian-only
  const isLibrarianRoute = pathname.startsWith(LIBRARIAN_PREFIX) || pathname.startsWith('/receipt/');

  if (!isAdminRoute && !isLibrarianRoute) {
    return NextResponse.next();
  }

  const payload = await readToken(request);

  if (!payload?.role) {
    return redirectToLogin(request);
  }

  if (isAdminRoute && payload.role !== 'admin') {
    return NextResponse.redirect(new URL('/librarian', request.url));
  }

  if (isLibrarianRoute && payload.role !== 'librarian') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/librarian/:path*', '/receipt/:path*'],
};
