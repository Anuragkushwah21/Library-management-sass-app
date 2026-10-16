// app/api/students/[id]/demo/route.ts — extend or end a running demo
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { Student } from '@/lib/models/Students';
import { endDemoNow, extendDemo } from '@/lib/services/demo';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('extend'), days: z.coerce.number().int().min(1).max(3) }),
  z.object({ action: z.literal('end') }),
]);

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const { id } = await params;
    const student = mongoose.Types.ObjectId.isValid(id)
      ? await Student.findOne({ _id: id, libraryId: ctx.libraryId })
      : null;
    if (!student) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });

    const body = Body.parse(await request.json().catch(() => ({})));
    if (body.action === 'extend') {
      const newEnd = await extendDemo(student, body.days, ctx.library, ctx.userId);
      return NextResponse.json(successResponse({ demoEnd: newEnd }, `Demo extended to ${newEnd}`));
    }
    await endDemoNow(student, ctx.userId, ctx.userId);
    return NextResponse.json(successResponse({ status: 'DEMO_ENDED' }, `Demo ended for ${student.name}`));
  } catch (error) {
    return handleRouteError(error, 'Could not update the demo.', 'Demo action');
  }
}
