// app/api/shifts/route.ts — the librarian's shifts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireLibraryContext } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { Shift } from '@/lib/models/Shift';
import { Student } from '@/lib/models/Students';
import { ShiftSchema } from '@/lib/validation-library';
import { logAudit } from '@/lib/services/audit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const [shifts, counts] = await Promise.all([
      Shift.find({ libraryId: ctx.libraryId }).sort({ sortOrder: 1, startTime: 1 }).lean(),
      Student.aggregate([
        { $match: { libraryId: ctx.library._id, status: { $in: ['ACTIVE_MEMBER', 'DEMO'] } } },
        { $group: { _id: '$shiftId', n: { $sum: 1 } } },
      ]),
    ]);
    const byShift = new Map(counts.map((c: any) => [String(c._id), c.n]));
    return NextResponse.json(
      successResponse(shifts.map((s: any) => ({ ...s, studentCount: byShift.get(String(s._id)) ?? 0 })))
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to load shifts.', 'Shifts GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const ctx = await requireLibraryContext(request);
    const data = ShiftSchema.parse(await request.json().catch(() => ({})));

    let shift;
    try {
      shift = await Shift.create({ ...data, libraryId: ctx.libraryId });
    } catch (err: any) {
      if (err?.code === 11000) {
        return NextResponse.json(
          { success: false, error: `A shift named "${data.name}" already exists.` },
          { status: 409 }
        );
      }
      throw err;
    }

    await logAudit({
      action: 'shift.created',
      actorId: ctx.userId,
      actorRole: 'librarian',
      libraryId: ctx.libraryId,
      entity: 'Shift',
      entityId: String(shift._id),
      meta: data,
      request,
    });

    return NextResponse.json(successResponse(shift, 'Shift created', 201), { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create shift.', 'Shifts POST');
  }
}
