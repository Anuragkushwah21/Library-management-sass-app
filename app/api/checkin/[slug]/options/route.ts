// app/api/checkin/[slug]/options/route.ts — what the QR demo form needs
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { libraryFromQr } from '@/lib/services/library';
import { assertQrOtpAccess } from '@/lib/services/qr-access';
import { freeSeatNumbers } from '@/lib/services/demo';
import { readStudentSession } from '@/lib/student-session';
import { Shift } from '@/lib/models/Shift';
import { isCloudinaryConfigured } from '@/lib/cloudinary';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { slug } = await params;
    const library = await libraryFromQr(slug, request.nextUrl.searchParams.get('k'));
    // §12.2: admin-controlled access is checked before anything else
    await assertQrOtpAccess(library);
    if (!readStudentSession(request, String(library._id))) {
      return NextResponse.json({ success: false, error: 'Please verify your phone number first.', code: 'SESSION_REQUIRED' }, { status: 401 });
    }
    const [shifts, freeSeats] = await Promise.all([
      Shift.find({ libraryId: library._id, isActive: true })
        .select('name startTime endTime')
        .sort({ sortOrder: 1, startTime: 1 })
        .lean(),
      freeSeatNumbers(String(library.ownerId)),
    ]);
    return NextResponse.json(
      successResponse({
        shifts,
        freeSeats,
        demoDays: library.settings?.demoDays ?? 3,
        uploadsEnabled: isCloudinaryConfigured(),
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Could not load the form.', 'Checkin options');
  }
}
