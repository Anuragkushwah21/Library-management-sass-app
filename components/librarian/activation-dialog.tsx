'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';
import { openReceipt } from '@/components/librarian/fees-dialog';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { todayInput } from '@/lib/date-rules';
import { cn } from '@/lib/utils';

export interface ActivatableStudent {
  _id: string;
  name: string;
  phone: string;
  status: string;
  seatNumber?: number | null;
  /** Set for members renewing: an active member's next period starts the day after */
  membershipEndDate?: string | null;
}

const PLANS = [
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly', months: 3 },
  { key: 'yearly', label: 'Yearly', months: 12 },
  { key: 'custom', label: 'Custom dates', months: 0 },
] as const;
type PlanKey = (typeof PLANS)[number]['key'];

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
/** Inclusive end: 1 month from 16 Oct ends 15 Nov. */
const planEnd = (start: string, months: number) => iso(addDays(addMonths(new Date(`${start}T00:00:00`), months), -1));
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * "Collect fee & activate" (PLAN R11). The student moves from Demo / Demo
 * Ended / Expired to All Students as soon as this succeeds.
 */
export function ActivationDialog({
  student,
  onClose,
  onDone,
}: {
  student: ActivatableStudent | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<PlanKey>('monthly');
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState(planEnd(todayInput(), 1));
  const [fee, setFee] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('CASH');
  const [reference, setReference] = useState('');
  const [seat, setSeat] = useState('');
  const [freeSeats, setFreeSeats] = useState<number[]>([]);
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ paymentId: string; receipt: string; paid: number; due: number } | null>(null);

  const needsSeat = Boolean(student && !student.seatNumber);
  const renewal = student?.status === 'ACTIVE_MEMBER' || student?.status === 'EXPIRED';

  // Fresh form (and a fresh request id) every time it opens
  useEffect(() => {
    if (!student) return;
    // An active member renewing early continues from the day after the current end
    const currentEnd = student.status === 'ACTIVE_MEMBER' && student.membershipEndDate ? iso(new Date(student.membershipEndDate)) : null;
    const t = currentEnd && currentEnd >= todayInput() ? iso(addDays(new Date(`${currentEnd}T00:00:00`), 1)) : todayInput();
    setPlan('monthly');
    setStart(t);
    setEnd(planEnd(t, 1));
    setFee('');
    setPaid('');
    setMethod('CASH');
    setReference('');
    setSeat('');
    setError(null);
    setDone(null);
    setRequestId(newRequestId());
    if (!student.seatNumber) {
      api
        .getDemoFormOptions()
        .then((r: any) => setFreeSeats(r.data?.freeSeats ?? []))
        .catch(() => setFreeSeats([]));
    }
  }, [student]);

  // Plan → end date
  useEffect(() => {
    const p = PLANS.find((x) => x.key === plan)!;
    if (p.months) setEnd(planEnd(start, p.months));
  }, [plan, start]);

  const feeNum = Number(fee || 0);
  const paidNum = paid === '' ? feeNum : Number(paid);
  const due = Math.max(0, feeNum - paidNum);
  const valid = useMemo(() => {
    if (!fee || !Number.isInteger(feeNum) || feeNum < 0) return 'Enter the fee in whole rupees.';
    if (!Number.isInteger(paidNum) || paidNum < 0) return 'Paid amount must be a whole number.';
    if (paidNum > feeNum) return 'Paid amount can’t be more than the fee.';
    if (end < start) return 'End date must be after the start date.';
    return null;
  }, [fee, feeNum, paidNum, start, end]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || valid) return setError(valid);
    setBusy(true);
    setError(null);
    try {
      const res: any = await api.activateMembership(student._id, {
        planName: PLANS.find((p) => p.key === plan)!.label,
        startDate: start,
        endDate: end,
        fee: feeNum,
        paidAmount: paidNum,
        method,
        reference: reference.trim() || undefined,
        seatNumber: needsSeat && seat ? Number(seat) : null,
        requestId,
      });
      toast.success('Membership activated successfully.');
      setDone({
        paymentId: res.data?.payment?._id,
        receipt: res.data?.payment?.receiptNumber ?? '—',
        paid: res.data?.payment?.paidAmount ?? paidNum,
        due: res.data?.payment?.dueAmount ?? due,
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {student && done ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <DialogTitle className="text-xl">{renewal ? 'Membership renewed' : 'Membership activated'}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {student.name} is now an active member and appears in <strong>All Students</strong>.
            </p>
            <dl className="mx-auto max-w-xs divide-y rounded-lg border text-sm">
              <div className="flex justify-between px-3 py-2">
                <dt className="text-muted-foreground">Receipt</dt>
                <dd className="font-semibold tabular-nums">{done.receipt}</dd>
              </div>
              <div className="flex justify-between px-3 py-2">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-semibold tabular-nums">₹{done.paid}</dd>
              </div>
              <div className="flex justify-between px-3 py-2">
                <dt className="text-muted-foreground">Due</dt>
                <dd className={cn('font-semibold tabular-nums', done.due > 0 && 'text-amber-600')}>₹{done.due}</dd>
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!done.paymentId} onClick={() => openReceipt(done.paymentId)}>
                <Printer className="mr-2 h-4 w-4" /> Receipt
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : student ? (
          <>
            <DialogHeader>
              <DialogTitle>{renewal ? 'Renew membership' : <>Collect fee &amp; activate</>}</DialogTitle>
              <DialogDescription>
                {student.name} · {student.phone}
                {student.status === 'ACTIVE_MEMBER' && student.membershipEndDate ? ` · member till ${format(new Date(student.membershipEndDate), 'd MMM yyyy')}` : ''}
                {student.seatNumber ? ` · Seat ${student.seatNumber} (kept)` : ''}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PLANS.map((p) => (
                    <Button
                      key={p.key}
                      type="button"
                      variant={plan === p.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPlan(p.key)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="act-start">Start date</Label>
                  <Input id="act-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="act-end">End date</Label>
                  <Input
                    id="act-end"
                    type="date"
                    min={start}
                    value={end}
                    onChange={(e) => {
                      setPlan('custom');
                      setEnd(e.target.value);
                    }}
                    required
                  />
                </div>
              </div>

              {needsSeat && (
                <div className="space-y-2">
                  <Label htmlFor="act-seat">Seat</Label>
                  <select
                    id="act-seat"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                  >
                    <option value="">{freeSeats.length ? 'No seat for now' : 'No free seats'}</option>
                    {freeSeats.map((n) => (
                      <option key={n} value={n}>
                        Seat {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="act-fee">Total fee (₹)</Label>
                  <Input id="act-fee" inputMode="numeric" type="number" min={0} step={1} value={fee} onChange={(e) => setFee(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="act-paid">Paid now (₹)</Label>
                  <Input
                    id="act-paid"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    placeholder={fee || '0'}
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                </div>
              </div>
              {fee && (
                <p className={cn('rounded-md px-3 py-2 text-sm', due > 0 ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300')}>
                  {due > 0 ? `Partial payment — ₹${due} will stay due.` : 'Fully paid.'}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="act-method">Payment method</Label>
                  <select
                    id="act-method"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="act-ref">Reference (optional)</Label>
                  <Input id="act-ref" placeholder="UPI / txn ID" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {renewal ? 'Renew & generate receipt' : 'Activate membership'}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
