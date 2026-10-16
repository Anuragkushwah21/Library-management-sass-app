// app/api/students/[id]/id-proof/route.ts — short-lived link to a private ID proof (D16)
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Student } from '@/lib/models/Students';
import { privateIdProofUrl } from '@/lib/cloudinary';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const student = mongoose.Types.ObjectId.isValid(id)
      ? await Student.findOne({ _id: id, libraryId: ctx.libraryId }).select('idProof')
      : null;
    if (!student?.idProof?.publicId) {
      return NextResponse.json({ success: false, error: 'No ID proof on file.' }, { status: 404 });
    }
    return NextResponse.json(successResponse({ url: privateIdProofUrl(student.idProof as any, 300), expiresIn: 300 }));
  } catch (error) {
    return handleRouteError(error, 'Could not open the ID proof.', 'ID proof');
  }
}
