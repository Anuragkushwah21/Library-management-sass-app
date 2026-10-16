// lib/services/membership.ts — collect fee & activate (PLAN R11, R6)
import mongoose from 'mongoose';
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
import { addDaysToKey, isDateKey, localDateKey } from '@/lib/time';

/** Students who can be activated: demo running/ended, a lapsed member, or an active member renewing early. */
const ACTIVATABLE = ['DEMO', 'DEMO_ENDED', 'EXPIRED', 'ACTIVE_MEMBER'];

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
    throw new ApiError(409, `${student.name} can't be activated while ${student.status.toLowerCase().replace('_', ' ')}.`);
  }

  // Validation (R15)
  const tz = libraryTz(library);
  const today = localDateKey(new Date(), tz);
  // Early renewal: the new period must start after the current one ends (no overlap, no double charge)
  const renewingActive = student.status === 'ACTIVE_MEMBER';
  if (renewingActive && student.membershipEndDate) {
    const currentEnd = localDateKey(student.membershipEndDate, tz);
    if (isDateKey(input.startKey) && input.startKey <= currentEnd) {
      throw new ApiError(409, `${student.name} is a member till ${currentEnd}. Start the renewal on ${addDaysToKey(currentEnd, 1)} or later.`);
    }
  }
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
    source: student.status === 'EXPIRED' || renewingActive ? 'RENEWAL' : 'ACTIVATION',
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

  // Status change = the student moves from the Demo list to All Students.
  // An early renewal only pushes the end date out; the member stays where they are.
  await Student.updateOne(
    { _id: student._id },
    {
      $set: renewingActive
        ? { membershipEndDate: membership.endDate, membershipStatus: 'active' }
        : {
            status: 'ACTIVE_MEMBER',
            membershipStartDate: membership.startDate,
            membershipEndDate: membership.endDate,
            membershipStatus: 'active',
            activatedAt: new Date(),
          },
    }
  );
  await syncStudentPayment(student._id);

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

// ---------------------------------------------------------------------------
// Fees: collect the balance, record a fee for older members, receipts
// ---------------------------------------------------------------------------

/**
 * The student's payment badge is derived from what is actually owed across all
 * fee periods: nothing due = paid, part paid = pending, nothing paid = unpaid.
 */
export async function syncStudentPayment(studentId: unknown) {
  const [t] = await Membership.aggregate([
    { $match: { studentId: new mongoose.Types.ObjectId(String(studentId)), status: { $ne: 'CANCELLED' } } },
    { $group: { _id: null, paid: { $sum: '$paidTotal' }, due: { $sum: '$dueAmount' } } },
  ]);
  if (!t) return;
  const paymentStatus = t.due <= 0 ? 'paid' : t.paid > 0 ? 'pending' : 'unpaid';
  await Student.updateOne({ _id: studentId }, { $set: { paymentStatus } });
}

/** All fee periods and payments of one student, newest first. */
export async function studentFees(libraryId: unknown, studentId: unknown) {
  const [memberships, payments] = await Promise.all([
    Membership.find({ libraryId, studentId, status: { $ne: 'CANCELLED' } }).sort({ startDate: -1 }).lean(),
    Payment.find({ libraryId, studentId }).sort({ paidAt: -1 }).lean(),
  ]);
  const totals = memberships.reduce(
    (t, m) => ({ fee: t.fee + m.fee, paid: t.paid + m.paidTotal, due: t.due + m.dueAmount }),
    { fee: 0, paid: 0, due: 0 }
  );
  return { memberships, payments, totals };
}

export interface CollectInput {
  /** Pay towards this membership; omitted = the oldest one with a balance */
  membershipId?: string | null;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  requestId: string;
  /** Only for a member added before fees were tracked (no membership yet) */
  fee?: number | null;
  planName?: string | null;
}

/**
 * Take a payment from a student. Pays towards an existing balance, or — for a
 * member who has no fee record yet — records the fee and the first payment.
 * Never takes more than is owed; a retried request returns the first receipt.
 */
export async function collectPayment(args: { library: ILibrary; actorId: string; student: IStudent; input: CollectInput }) {
  const { library, actorId, student, input } = args;
  const libraryId = library._id;

  const replay = await Payment.findOne({ libraryId, requestId: input.requestId });
  if (replay) return { payment: replay, membership: await Membership.findById(replay.membershipId), replayed: true };

  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ApiError(400, 'Enter the amount received in whole rupees.');

  let membership = input.membershipId
    ? await Membership.findOne({ _id: input.membershipId, libraryId, studentId: student._id, status: { $ne: 'CANCELLED' } })
    : await Membership.findOne({ libraryId, studentId: student._id, status: { $ne: 'CANCELLED' }, dueAmount: { $gt: 0 } }).sort({ startDate: 1 });

  let created = false;
  if (!membership) {
    const anyMembership = await Membership.exists({ libraryId, studentId: student._id, status: { $ne: 'CANCELLED' } });
    if (anyMembership) throw new ApiError(409, `${student.name} has no balance to pay.`);
    // Member added before fees were tracked: record the fee now
    const fee = Number(input.fee);
    if (!Number.isInteger(fee) || fee <= 0) throw new ApiError(400, 'Enter the total fee for this membership.');
    if (input.amount > fee) throw new ApiError(400, 'Amount received can’t be more than the fee.');
    if (!student.membershipEndDate) throw new ApiError(400, 'Set the membership end date for this student first.');
    membership = await Membership.create({
      libraryId,
      studentId: student._id,
      planName: (input.planName || 'Membership').trim().slice(0, 60),
      startDate: student.membershipStartDate ?? student.createdAt ?? new Date(),
      endDate: student.membershipEndDate,
      fee,
      paidTotal: 0,
      dueAmount: fee,
      paymentStatus: 'PENDING',
      shiftId: student.shiftId ?? null,
      seatNumber: student.seatNumber ?? null,
      source: 'WALK_IN',
      createdBy: actorId,
    });
    created = true;
  }

  // Atomic: only succeeds if the balance still covers the amount (no overpaying,
  // two cashiers can't both take the last ₹500)
  const updated = await Membership.findOneAndUpdate(
    { _id: membership._id, dueAmount: { $gte: input.amount } },
    { $inc: { paidTotal: input.amount, dueAmount: -input.amount } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    if (created) await Membership.deleteOne({ _id: membership._id });
    throw new ApiError(
      400,
      membership.dueAmount > 0
        ? `Only ₹${membership.dueAmount} is due — you can’t collect ₹${input.amount}.`
        : 'Nothing is due on this membership.'
    );
  }
  const state = paymentState(updated.fee, updated.paidTotal);
  if (updated.paymentStatus !== state) await Membership.updateOne({ _id: updated._id }, { $set: { paymentStatus: state } });
  updated.paymentStatus = state;

  let payment;
  try {
    payment = await Payment.create({
      libraryId,
      studentId: student._id,
      membershipId: updated._id,
      amount: updated.fee,
      paidAmount: input.amount,
      dueAmount: updated.dueAmount,
      paymentMethod: input.method,
      reference: input.reference || undefined,
      receiptNumber: await nextReceiptNumber(libraryId),
      status: state,
      paidAt: new Date(),
      collectedBy: actorId,
      requestId: input.requestId,
    });
  } catch (err: any) {
    // Put the balance back exactly as it was
    if (created) await Membership.deleteOne({ _id: updated._id });
    else
      await Membership.updateOne(
        { _id: updated._id },
        { $inc: { paidTotal: -input.amount, dueAmount: input.amount }, $set: { paymentStatus: membership.paymentStatus } }
      );
    if (err?.code === 11000) {
      const first = await Payment.findOne({ libraryId, requestId: input.requestId });
      if (first) return { payment: first, membership: await Membership.findById(first.membershipId), replayed: true };
    }
    throw err;
  }

  await syncStudentPayment(student._id);
  // Membership validity comes from the dates, not from whether it's paid
  if (student.membershipEndDate && student.membershipEndDate > new Date() && student.membershipStatus !== 'active') {
    await Student.updateOne({ _id: student._id }, { $set: { membershipStatus: 'active' } });
  }

  await logAudit({
    action: 'payment.recorded',
    actorId,
    actorRole: 'librarian',
    libraryId: String(libraryId),
    entity: 'Payment',
    entityId: String(payment._id),
    meta: { receipt: payment.receiptNumber, studentId: String(student._id), fee: updated.fee, paid: input.amount, due: updated.dueAmount, method: input.method, newFeeRecord: created },
  });

  return { payment, membership: updated, replayed: false };
}

/** Everything a printed receipt needs. Paid-before is computed from earlier receipts. */
export async function receiptFor(libraryId: unknown, paymentId: unknown) {
  const payment = await Payment.findOne({ _id: paymentId, libraryId }).lean();
  if (!payment) return null;
  const { Shift } = await import('@/lib/models/Shift');
  const { User } = await import('@/lib/models/User');
  const [library, student, membership, earlier, collector] = await Promise.all([
    Library.findById(libraryId).select('name address phone email settings.timezone').lean(),
    Student.findById(payment.studentId).select('name phone email seatNumber shiftId').lean(),
    Membership.findById(payment.membershipId).lean(),
    Payment.aggregate([
      { $match: { libraryId: payment.libraryId, membershipId: payment.membershipId, _id: { $ne: payment._id }, paidAt: { $lte: payment.paidAt } } },
      { $group: { _id: null, paid: { $sum: '$paidAmount' } } },
    ]),
    payment.collectedBy ? User.findById(payment.collectedBy).select('name').lean() : null,
  ]);
  const shiftId = membership?.shiftId ?? student?.shiftId;
  const shift = shiftId ? await Shift.findById(shiftId).select('name startTime endTime').lean() : null;
  const paidBefore = earlier[0]?.paid ?? 0;
  return {
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    method: payment.paymentMethod,
    reference: payment.reference ?? null,
    status: payment.status,
    totalFee: payment.amount,
    paidBefore,
    paidNow: payment.paidAmount,
    totalPaid: paidBefore + payment.paidAmount,
    balanceDue: payment.dueAmount,
    library: library && { name: library.name, address: library.address ?? '', phone: library.phone ?? '', email: library.email ?? '', timezone: (library as any).settings?.timezone ?? 'Asia/Kolkata' },
    student: student && { name: student.name, phone: student.phone, email: student.email ?? '', seatNumber: membership?.seatNumber ?? student.seatNumber ?? null },
    membership: membership && { planName: membership.planName, startDate: membership.startDate, endDate: membership.endDate },
    shift: shift && { name: (shift as any).name, startTime: (shift as any).startTime ?? null, endTime: (shift as any).endTime ?? null },
    collectedBy: (collector as any)?.name ?? null,
  };
}

/** Per-student fee summary for list views: { fee, paid, due } over all periods. */
export async function feeSummaries(libraryId: unknown, studentIds: unknown[]) {
  if (!studentIds.length) return new Map<string, { fee: number; paid: number; due: number }>();
  const rows = await Membership.aggregate([
    {
      $match: {
        libraryId: new mongoose.Types.ObjectId(String(libraryId)),
        studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
        status: { $ne: 'CANCELLED' },
      },
    },
    { $group: { _id: '$studentId', fee: { $sum: '$fee' }, paid: { $sum: '$paidTotal' }, due: { $sum: '$dueAmount' } } },
  ]);
  return new Map(rows.map((r: any) => [String(r._id), { fee: r.fee, paid: r.paid, due: r.due }]));
}

/**
 * Add Member with a fee: records the membership for the student's dates and,
 * if anything was paid, the first payment + receipt. Paid 0 = all of it due.
 */
export async function recordJoiningFee(args: {
  library: ILibrary;
  actorId: string;
  student: IStudent;
  input: { planName?: string | null; fee: number; paidAmount: number; method: PaymentMethod; reference?: string; requestId: string };
}) {
  const { library, actorId, student, input } = args;
  if (!Number.isInteger(input.fee) || input.fee <= 0) throw new ApiError(400, 'Fee must be a whole amount in rupees.');
  if (!Number.isInteger(input.paidAmount) || input.paidAmount < 0) throw new ApiError(400, 'Paid amount must be a whole amount in rupees.');
  if (input.paidAmount > input.fee) throw new ApiError(400, 'Paid amount can’t be more than the fee.');
  if (!student.membershipEndDate) throw new ApiError(400, 'Membership dates are required.');

  const state = paymentState(input.fee, input.paidAmount);
  const membership = await Membership.create({
    libraryId: library._id,
    studentId: student._id,
    planName: (input.planName || 'Membership').trim().slice(0, 60),
    startDate: student.membershipStartDate ?? new Date(),
    endDate: student.membershipEndDate,
    fee: input.fee,
    paidTotal: input.paidAmount,
    dueAmount: input.fee - input.paidAmount,
    paymentStatus: state,
    shiftId: student.shiftId ?? null,
    seatNumber: student.seatNumber ?? null,
    source: 'WALK_IN',
    createdBy: actorId,
  });

  let payment = null;
  if (input.paidAmount > 0) {
    try {
      payment = await Payment.create({
        libraryId: library._id,
        studentId: student._id,
        membershipId: membership._id,
        amount: input.fee,
        paidAmount: input.paidAmount,
        dueAmount: input.fee - input.paidAmount,
        paymentMethod: input.method,
        reference: input.reference || undefined,
        receiptNumber: await nextReceiptNumber(library._id),
        status: state,
        paidAt: new Date(),
        collectedBy: actorId,
        requestId: input.requestId,
      });
    } catch (err) {
      await Membership.deleteOne({ _id: membership._id });
      throw err;
    }
  }
  await syncStudentPayment(student._id);
  await logAudit({
    action: 'payment.recorded',
    actorId,
    actorRole: 'librarian',
    libraryId: String(library._id),
    entity: 'Membership',
    entityId: String(membership._id),
    meta: { receipt: payment?.receiptNumber ?? null, studentId: String(student._id), fee: input.fee, paid: input.paidAmount, method: input.method, joining: true },
  });
  return { membership, payment };
}

/** Money overview for the dashboard, in the library's own days and months. */
export async function feesOverview(library: ILibrary) {
  const libraryId = library._id;
  const tz = libraryTz(library);
  const todayKey = localDateKey(new Date(), tz);
  const monthKey = todayKey.slice(0, 7);
  const todayStart = startOfDay(todayKey, tz);
  const monthStart = startOfDay(`${monthKey}-01`, tz);
  // First day of the month five months back, for a 6-month trend
  const [y, m] = monthKey.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1 - 5, 1));
  const trendStart = startOfDay(`${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, '0')}-01`, tz);

  const [today, month, dues, byMethod, trend, recent] = await Promise.all([
    Payment.aggregate([
      { $match: { libraryId, paidAt: { $gte: todayStart } } },
      { $group: { _id: null, amount: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { libraryId, paidAt: { $gte: monthStart } } },
      { $group: { _id: null, amount: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
    ]),
    Membership.aggregate([
      { $match: { libraryId, status: { $ne: 'CANCELLED' }, dueAmount: { $gt: 0 } } },
      { $group: { _id: '$studentId', due: { $sum: '$dueAmount' } } },
      { $group: { _id: null, due: { $sum: '$due' }, students: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { libraryId, paidAt: { $gte: monthStart } } },
      { $group: { _id: '$paymentMethod', amount: { $sum: '$paidAmount' } } },
    ]),
    Payment.aggregate([
      { $match: { libraryId, paidAt: { $gte: trendStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: tz } }, amount: { $sum: '$paidAmount' } } },
    ]),
    Payment.find({ libraryId }).sort({ paidAt: -1 }).limit(6).populate('studentId', 'name').lean(),
  ]);

  const trendByMonth = new Map(trend.map((t: any) => [t._id, t.amount]));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - 5 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), amount: trendByMonth.get(key) ?? 0 };
  });

  return {
    today: { amount: today[0]?.amount ?? 0, count: today[0]?.count ?? 0 },
    month: { amount: month[0]?.amount ?? 0, count: month[0]?.count ?? 0 },
    due: { amount: dues[0]?.due ?? 0, students: dues[0]?.students ?? 0 },
    byMethod: Object.fromEntries(['CASH', 'UPI', 'BANK_TRANSFER'].map((k) => [k, byMethod.find((b: any) => b._id === k)?.amount ?? 0])),
    trend: months,
    recent: recent.map((p: any) => ({
      _id: String(p._id),
      receiptNumber: p.receiptNumber,
      studentName: p.studentId?.name ?? 'Student',
      paidAmount: p.paidAmount,
      dueAmount: p.dueAmount,
      method: p.paymentMethod,
      paidAt: p.paidAt,
    })),
  };
}
