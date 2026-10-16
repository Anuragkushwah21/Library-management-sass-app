// app/api/students/[id]/fees/route.ts — a student's fees: balance, history, collect a payment
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Student } from '@/lib/models/Students';
import { PAYMENT_METHODS } from '@/lib/models/Payment';
import { collectPayment, studentFees } from '@/lib/services/membership';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function findStudent(request: NextRequest, params: Ctx['params']) {
  const ctx = await requireLibraryContext(request);
  const { id } = await params;
  const student = mongoose.Types.ObjectId.isValid(id) ? await Student.findOne({ _id: id, libraryId: ctx.libraryId }) : null;
  return { ctx, student };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { ctx, student } = await findStudent(request, params);
    if (!student) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    const fees = await studentFees(ctx.library._id, student._id);
    return NextResponse.json(
      successResponse({
        student: {
          _id: student._id,
          name: student.name,
          phone: student.phone,
          status: student.status,
          seatNumber: student.seatNumber ?? null,
          membershipStartDate: student.membershipStartDate ?? null,
          membershipEndDate: student.membershipEndDate ?? null,
        },
        ...fees,
      })
    );
  } catch (error) {
    return handleRouteError(error, 'Could not load fees.', 'Fees');
  }
}

const Body = z.object({
  membershipId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
  amount: z.coerce.number(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).optional(),
  requestId: z.string().min(8).max(64),
  fee: z.coerce.number().nullable().optional(),
  planName: z.string().trim().max(60).nullable().optional(),
});

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { ctx, student } = await findStudent(request, params);
    if (!student) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    const b = Body.parse(await request.json().catch(() => ({})));
    const result = await collectPayment({ library: ctx.library, actorId: ctx.userId, student, input: b });
    return NextResponse.json(successResponse(result, 'Payment recorded.'));
  } catch (error) {
    return handleRouteError(error, 'Could not record the payment.', 'Fees');
  }
}
