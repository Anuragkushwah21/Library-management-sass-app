// lib/services/membership.ts — collect fee & activate (PLAN R11, R6)
import { Student, type IStudent } from '@/lib/models/Students';
import { Library, type ILibrary } from '@/lib/models/Library';
import { Membership } from '@/lib/models/Membership';
import { Payment, type PaymentMethod } from '@/lib/models/Payment';
import { ApiError } from '@/lib/api-response';
import { setStudentSeat } from '@/lib/services/seats';
import { assertSeatFree } from '@/lib/services/demo';
import { logAudit } from '@/lib/services/audit';
import { libraryTz } from '@/lib/services/attendance';
import { endOfDay, startOfDay } from '@/lib/demo-rules';
import { isDateKey, localDateKey } from '@/lib/time';

/** Students who can be activated: demo running/ended, or a lapsed member renewing. */
const ACTIVATABLE = ['DEMO', 'DEMO_ENDED', 'EXPIRED'];

export function paymentState(fee: number, paid: number): 'PAID' | 'PARTIAL' | 'PENDING' {
  if (paid >= fee) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'PENDING';
}

/** Next receipt number for the library, e.g. "R-00042". Atomic, never repeats. */
export async function nextReceiptNumber(libraryId: unknown): Promise<string> {
  const lib = await Library.findByIdAndUpdate(libraryId, { $inc: { receiptSeq: 1 } }, { returnDocument: 'after' });
  return `R-${String(lib?.receiptSeq ?? 1).padStart(5, '0')}`;
}

export interface ActivationInput {
  planName: string;
  startKey: string;
  endKey: string;
  fee: number;
  paidAmount: number;
  method: PaymentMethod;
  reference?: string;
  /** Required when the student has no seat (e.g. demo ended); ignored otherwise */
  seatNumber?: number | null;
  requestId: string;
}

export async function activateMembership(args: {
  library: ILibrary;
  librarianId: string;
  actorId: string;
  student: IStudent;
  input: ActivationInput;
}) {
  const { library, librarianId, actorId, student, input } = args;
  const libraryId = library._id;

  // A replayed request (double click / retry) returns the first result
  const replay = await Payment.findOne({ libraryId, requestId: input.requestId });
  if (replay) {
    return {
      student: await Student.findById(replay.studentId),
      membership: await Membership.findById(replay.membershipId),
      payment: replay,
      replayed: true,
    };
  }

  if (!ACTIVATABLE.includes(student.status)) {
    throw new ApiError(
      409,
      student.status === 'ACTIVE_MEMBER'
        ? `${student.name} is already an active member.`
        : `${student.name} can't be activated while ${student.status.toLowerCase().replace('_', ' ')}.`
    );
  }

  // Validation (R15)
  const tz = libraryTz(library);
  const today = localDateKey(new Date(), tz);
  if (!input.planName.trim()) throw new ApiError(400, 'Choose a plan.');
  if (!isDateKey(input.startKey) || !isDateKey(input.endKey)) throw new ApiError(400, 'Membership dates are required.');
  if (input.endKey < input.startKey) throw new ApiError(400, 'Membership end date must be after the start date.');
  if (input.endKey < today) throw new ApiError(400, "Membership end date can't be in the past.");
  if (!Number.isInteger(input.fee) || input.fee < 0) throw new ApiError(400, 'Fee must be a whole amount in rupees.');
  if (!Number.isInteger(input.paidAmount) || input.paidAmount < 0) throw new ApiError(400, 'Paid amount must be a whole amount in rupees.');
  if (input.paidAmount > input.fee) throw new ApiError(400, 'Paid amount can’t be more than the fee.');

  // Seat: keep the current one, or take the chosen free seat
  const needsSeat = !student.seatNumber && input.seatNumber != null;
  if (needsSeat) await assertSeatFree(librarianId, input.seatNumber!);

  const state = paymentState(input.fee, input.paidAmount);
  const due = input.fee - input.paidAmount;

  const membership = await Membership.create({
    libraryId,
    studentId: student._id,
    planName: input.planName.trim(),
    startDate: startOfDay(input.startKey, tz),
    endDate: endOfDay(input.endKey, tz),
    fee: input.fee,
    paidTotal: input.paidAmount,
    dueAmount: due,
    paymentStatus: state,
    shiftId: student.shiftId ?? null,
    seatNumber: student.seatNumber ?? input.seatNumber ?? null,
    source: student.status === 'EXPIRED' ? 'RENEWAL' : 'ACTIVATION',
    createdBy: actorId,
  });

  let payment;
  try {
    payment = await Payment.create({
      libraryId,
      studentId: student._id,
      membershipId: membership._id,
      amount: input.fee,
      paidAmount: input.paidAmount,
      dueAmount: due,
      paymentMethod: input.method,
      reference: input.reference || undefined,
      receiptNumber: await nextReceiptNumber(libraryId),
      status: state,
      paidAt: new Date(),
      collectedBy: actorId,
      requestId: input.requestId,
    });
  } catch (err: any) {
    await Membership.deleteOne({ _id: membership._id });
    // Same requestId raced in from a second click — return that one
    if (err?.code === 11000) {
      const first = await Payment.findOne({ libraryId, requestId: input.requestId });
      if (first) return { student: await Student.findById(first.studentId), membership: await Membership.findById(first.membershipId), payment: first, replayed: true };
    }
    throw err;
  }

  if (needsSeat) {
    try {
      await setStudentSeat({ studentId: String(student._id), seatNumber: input.seatNumber!, librarianId });
    } catch (err) {
      await Payment.deleteOne({ _id: payment._id });
      await Membership.deleteOne({ _id: membership._id });
      throw err;
    }
  }

  // Status change = the student moves from the Demo list to All Students
  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        status: 'ACTIVE_MEMBER',
        membershipStartDate: membership.startDate,
        membershipEndDate: membership.endDate,
        paymentStatus: state === 'PAID' ? 'paid' : 'pending',
        membershipStatus: 'active',
        activatedAt: new Date(),
      },
    }
  );

  await logAudit({
    action: 'membership.activated',
    actorId,
    actorRole: 'librarian',
    libraryId: String(libraryId),
    entity: 'Membership',
    entityId: String(membership._id),
    meta: { studentId: String(student._id), from: student.status, plan: input.planName, start: input.startKey, end: input.endKey },
  });
  await logAudit({
    action: 'payment.recorded',
    actorId,
    actorRole: 'librarian',
    libraryId: String(libraryId),
    entity: 'Payment',
    entityId: String(payment._id),
    meta: { receipt: payment.receiptNumber, fee: input.fee, paid: input.paidAmount, method: input.method },
  });

  return { student: await Student.findById(student._id), membership, payment, replayed: false };
}
