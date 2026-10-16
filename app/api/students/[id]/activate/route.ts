// app/api/students/[id]/activate/route.ts — collect fee & activate membership (R11)
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Student } from '@/lib/models/Students';
import { PAYMENT_METHODS } from '@/lib/models/Payment';
import { activateMembership } from '@/lib/services/membership';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  planName: z.string().trim().min(1, 'Choose a plan.').max(60),
  startDate: z.string(),
  endDate: z.string(),
  fee: z.coerce.number(),
  paidAmount: z.coerce.number(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).optional(),
  seatNumber: z.coerce.number().int().positive().nullable().optional(),
  requestId: z.string().min(8).max(64),
});

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const student = mongoose.Types.ObjectId.isValid(id)
      ? await Student.findOne({ _id: id, libraryId: ctx.libraryId })
      : null;
    if (!student) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });

    const b = Body.parse(await request.json().catch(() => ({})));
    const result = await activateMembership({
      library: ctx.library,
      librarianId: ctx.userId,
      actorId: ctx.userId,
      student,
      input: {
        planName: b.planName,
        startKey: b.startDate,
        endKey: b.endDate,
        fee: b.fee,
        paidAmount: b.paidAmount,
        method: b.method,
        reference: b.reference,
        seatNumber: b.seatNumber ?? null,
        requestId: b.requestId,
      },
    });
    return NextResponse.json(successResponse(result, 'Membership activated successfully.'));
  } catch (error) {
    return handleRouteError(error, 'Could not activate the membership.', 'Activate');
  }
}
