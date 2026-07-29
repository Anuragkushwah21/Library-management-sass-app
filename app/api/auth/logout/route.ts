// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * authToken is httpOnly, so client-side JS cannot delete it — logout has to
 * happen on the server.
 */
export async function POST() {
  const response = NextResponse.json(
    { success: true, message: 'Logged out' },
    { status: 200 }
  );

  response.cookies.set('authToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
