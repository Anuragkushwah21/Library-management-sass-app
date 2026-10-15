// lib/student-session.ts — the OTP-verified student session (PLAN D2, §2.6)
//
// Separate cookie and a separate `purpose` from the staff authToken: a student
// token can never pass staff guards, and a staff token can never act as a student.
import jwt from 'jsonwebtoken';
import type { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;
const PURPOSE = 'student-session';
export const STUDENT_SESSION_DAYS = 30;

export interface StudentSession {
  purpose: typeof PURPOSE;
  libraryId: string;
  phone: string; // E.164
}

/** One cookie per library, so a student of two libraries keeps both sessions. */
export function studentCookieName(libraryId: string): string {
  return `ss_${libraryId}`;
}

export function setStudentSession(res: NextResponse, libraryId: string, phone: string) {
  const token = jwt.sign({ purpose: PURPOSE, libraryId, phone }, JWT_SECRET!, {
    expiresIn: `${STUDENT_SESSION_DAYS}d`,
  });
  res.cookies.set(studentCookieName(libraryId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STUDENT_SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearStudentSession(res: NextResponse, libraryId: string) {
  res.cookies.set(studentCookieName(libraryId), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function readStudentSession(req: NextRequest, libraryId: string): StudentSession | null {
  const token = req.cookies.get(studentCookieName(libraryId))?.value;
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET!) as StudentSession;
    if (p.purpose !== PURPOSE || p.libraryId !== libraryId || !p.phone) return null;
    return p;
  } catch {
    return null;
  }
}
