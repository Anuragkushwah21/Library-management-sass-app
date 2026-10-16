// app/api/checkin/[slug]/register/route.ts — QR demo form: an unregistered,
// OTP-verified number starts its own demo, then is checked in (PLAN §2.3, R10)
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { libraryFromQr } from '@/lib/services/library';
import { assertQrOtpAccess } from '@/lib/services/qr-access';
import { findStudentByPhone, scan } from '@/lib/services/checkin';
import { freeSeatNumbers, startDemo } from '@/lib/services/demo';
import { libraryTz } from '@/lib/services/attendance';
import { readStudentSession } from '@/lib/student-session';
import { checkPhoto, parseDemoForm, readFile } from '@/lib/validation-demo';
import { isCloudinaryConfigured, uploadStudentPhoto } from '@/lib/cloudinary';
import { defaultDemoEndKey } from '@/lib/demo-rules';
import { localDateKey } from '@/lib/time';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const limited = enforceRateLimit(request, 'checkin:register', { limit: 10, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;

    await connectDB();
    const { slug } = await params;
    const fd = await request.formData().catch(() => null);
    if (!fd) return NextResponse.json({ success: false, error: 'Please fill in the form.' }, { status: 400 });

    const library = await libraryFromQr(slug, fd.get('k'));
    // §12.2: admin-controlled access is checked before anything else
    await assertQrOtpAccess(library);
    const session = readStudentSession(request, String(library._id));
    if (!session) {
      return NextResponse.json({ success: false, error: 'Please verify your phone number first.', code: 'SESSION_REQUIRED' }, { status: 401 });
    }

    // One demo per number, ever: an existing record never gets the form again
    const existing = await findStudentByPhone(library._id, session.phone);
    if (existing) {
      const result = await scan({ library, phone: session.phone });
      return NextResponse.json(successResponse({ alreadyRegistered: true, scan: result }));
    }

    // The phone is the verified one from the session — never from the form
    fd.set('phone', session.phone);
    const librarianId = String(library.ownerId);
    const anySeatFree = (await freeSeatNumbers(librarianId)).length > 0;
    const fields = parseDemoForm(fd, { requireSeat: anySeatFree });

    const photo = readFile(fd, 'photo');
    checkPhoto(photo);
    let photoUrl: string | undefined;
    if (photo && isCloudinaryConfigured()) {
      try {
        photoUrl = (await uploadStudentPhoto(Buffer.from(await photo.arrayBuffer()))).url;
      } catch (err) {
        console.error('[QR register] photo upload failed', err);
      }
    }

    const tz = libraryTz(library);
    const today = localDateKey(new Date(), tz);
    const student = await startDemo({
      library,
      librarianId,
      actorId: null,
      source: 'QR',
      input: {
        ...fields,
        phoneRaw: session.phone,
        startKey: today,
        endKey: defaultDemoEndKey(today, library.settings?.demoDays ?? 3),
        photoUrl,
      },
    });

    // The student is standing in the library: check them in straight away
    const location = (() => {
      const lat = Number(fd.get('lat'));
      const lng = Number(fd.get('lng'));
      return Number.isFinite(lat) && Number.isFinite(lng) && fd.get('lat') ? { lat, lng } : null;
    })();
    const result = await scan({ library, phone: session.phone, location });

    return NextResponse.json(
      successResponse({ demoStarted: true, student: { name: student.name, seatNumber: student.seatNumber ?? null }, scan: result }, 'Demo started', 201),
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, 'Could not start your demo. Please try again.', 'Checkin register');
  }
}
