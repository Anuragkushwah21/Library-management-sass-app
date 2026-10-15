// app/api/checkin/[slug]/route.ts — public: what the check-in page needs to start
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { libraryFromQr } from '@/lib/services/library';
import { libraryIsAvailable } from '@/lib/services/checkin';
import { readStudentSession } from '@/lib/student-session';
import { maskPhone } from '@/lib/phone';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { slug } = await params;
    const library = await libraryFromQr(slug, request.nextUrl.searchParams.get('k'));
    const session = readStudentSession(request, String(library._id));
    const geo = library.settings?.geofence;

    // No personal data here — only the library and whether this device is verified
    return NextResponse.json(
      successResponse({
        library: { name: library.name, phone: library.phone ?? null, address: library.address ?? null },
        available: await libraryIsAvailable(library),
        timezone: library.settings?.timezone || 'Asia/Kolkata',
        geofence: Boolean(geo?.enabled && geo.lat != null && geo.lng != null),
        session: session ? { phone: maskPhone(session.phone) } : null,
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Could not open check-in.', 'Checkin GET');
  }
}
