// app/api/students/demo/route.ts — manual "Add Demo Student" (PLAN §6.2, R10, R15)
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Shift } from '@/lib/models/Shift';
import { freeSeatNumbers, startDemo } from '@/lib/services/demo';
import { libraryTz } from '@/lib/services/attendance';
import { checkIdProof, checkPhoto, parseDemoForm, readFile } from '@/lib/validation-demo';
import { isCloudinaryConfigured, uploadIdProof, uploadStudentPhoto } from '@/lib/cloudinary';
import { defaultDemoEndKey } from '@/lib/demo-rules';
import { localDateKey } from '@/lib/time';

export const runtime = 'nodejs';

/** GET — what the form needs: shifts, free seats, default dates. */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const tz = libraryTz(ctx.library);
    const today = localDateKey(new Date(), tz);
    const demoDays = ctx.library.settings?.demoDays ?? 3;
    const [shifts, seats] = await Promise.all([
      Shift.find({ libraryId: ctx.libraryId, isActive: true }).sort({ sortOrder: 1, startTime: 1 }).lean(),
      freeSeatNumbers(ctx.userId),
    ]);
    return NextResponse.json(
      successResponse({
        shifts,
        freeSeats: seats,
        today,
        demoDays,
        defaultEnd: defaultDemoEndKey(today, demoDays),
        uploadsEnabled: isCloudinaryConfigured(),
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Could not load the demo form.', 'Demo form GET');
  }
}

/** POST (multipart) — create a DEMO student and hold their seat. */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const fd = await request.formData().catch(() => null);
    if (!fd) return NextResponse.json({ success: false, error: 'Send the form as multipart/form-data.' }, { status: 400 });

    const fields = parseDemoForm(fd, { requireSeat: true });
    const startKey = String(fd.get('demoStartDate') || '');
    const endKey = String(fd.get('demoEndDate') || '') || defaultDemoEndKey(startKey, ctx.library.settings?.demoDays ?? 3);
    const photo = readFile(fd, 'photo');
    const idProofFile = readFile(fd, 'idProof');
    checkPhoto(photo);
    checkIdProof(idProofFile);

    // Uploads are a nice-to-have: a failure must not lose the admission
    const warnings: string[] = [];
    let photoUrl: string | undefined;
    let idProof: any = null;
    if ((photo || idProofFile) && !isCloudinaryConfigured()) {
      warnings.push("Photo/ID upload isn't set up yet, so the files were not saved.");
    } else {
      if (photo) {
        try {
          photoUrl = (await uploadStudentPhoto(Buffer.from(await photo.arrayBuffer()))).url;
        } catch (err) {
          console.error('[Demo] photo upload failed', err);
          warnings.push('The photo could not be uploaded. You can add it later.');
        }
      }
      if (idProofFile) {
        try {
          const up = await uploadIdProof(Buffer.from(await idProofFile.arrayBuffer()), idProofFile.type === 'application/pdf');
          idProof = { ...up, uploadedAt: new Date() };
        } catch (err) {
          console.error('[Demo] ID proof upload failed', err);
          warnings.push('The ID proof could not be uploaded. You can add it later.');
        }
      }
    }

    const student = await startDemo({
      library: ctx.library,
      librarianId: ctx.userId,
      actorId: ctx.userId,
      source: 'MANUAL',
      input: { ...fields, startKey, endKey, photoUrl, idProof },
    });

    return NextResponse.json(successResponse({ student, warnings }, `Demo started for ${student.name}`, 201), { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Could not add the demo student.', 'Demo POST');
  }
}
