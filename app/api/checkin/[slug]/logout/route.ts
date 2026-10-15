// app/api/checkin/[slug]/logout/route.ts — "Not you?" on the check-in page
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Library } from '@/lib/models/Library';
import { clearStudentSession } from '@/lib/student-session';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(_request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { slug } = await params;
    const library = await Library.findOne({ slug }).select('_id');
    const res = NextResponse.json(successResponse({ loggedOut: true }));
    if (library) clearStudentSession(res, String(library._id));
    return res;
  } catch (error) {
    return handleRouteError(error, 'Could not sign out.', 'Checkin logout');
  }
}
