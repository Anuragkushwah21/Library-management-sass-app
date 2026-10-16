'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, Printer, ReceiptIndianRupee, RefreshCw } from 'lucide-react';
import type { ActivatableStudent } from '@/components/librarian/activation-dialog';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface FeeStudent {
  _id: string;
  name: string;
  phone?: string;
}

interface MembershipRow {
  _id: string;
  planName: string;
  startDate: string;
  endDate: string;
  fee: number;
  paidTotal: number;
  dueAmount: number;
}

interface PaymentRow {
  _id: string;
  membershipId: string;
  receiptNumber: string;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  paidAt: string;
}

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (d: string) => format(new Date(d), 'd MMM yyyy');
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const openReceipt = (paymentId: string) => window.open(`/receipt/${paymentId}`, '_blank', 'noopener');

/** Fee summary, collect a payment, and every receipt for one student. */
export function FeesDialog({
  student,
  onClose,
  onChanged,
  onRenew,
}: {
  student: FeeStudent | null;
  onClose: () => void;
  onChanged: () => void;
  /** Start the next paid period (renewal) — opens the activation dialog */
  onRenew?: (student: ActivatableStudent) => void;
}) {
  const [data, setData] = useState<{ memberships: MembershipRow[]; payments: PaymentRow[]; totals: { fee: number; paid: number; due: number }; student: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [membershipId, setMembershipId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('CASH');
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ paymentId: string; receipt: string; paid: number; due: number } | null>(null);

  const load = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    try {
      const res: any = await api.getStudentFees(student._id);
      setData(res.data);
      const owing = (res.data.memberships as MembershipRow[]).filter((m) => m.dueAmount > 0);
      setMembershipId(owing.length ? owing[owing.length - 1]._id : '');
    } catch (err: any) {
      toast.error(err.message || 'Could not load fees.');
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (!student) return;
    setData(null);
    setAmount('');
    setFee('');
    setMethod('CASH');
    setReference('');
    setError(null);
    setDone(null);
    setRequestId(newRequestId());
    load();
  }, [student, load]);

  const owing = useMemo(() => (data?.memberships ?? []).filter((m) => m.dueAmount > 0), [data]);
  const noFeeRecord = data && data.memberships.length === 0;
  const target = owing.find((m) => m._id === membershipId);
  const maxAmount = noFeeRecord ? Number(fee || 0) : target?.dueAmount ?? 0;
  const amountNum = Number(amount || 0);
  const after = Math.max(0, maxAmount - amountNum);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (noFeeRecord && (!Number.isInteger(Number(fee)) || Number(fee) <= 0)) return setError('Enter the total fee in whole rupees.');
    if (!Number.isInteger(amountNum) || amountNum <= 0) return setError('Enter the amount received in whole rupees.');
    if (amountNum > maxAmount) return setError(`Only ${rupees(maxAmount)} is due.`);
    setBusy(true);
    setError(null);
    try {
      const res: any = await api.collectPayment(student._id, {
        membershipId: noFeeRecord ? null : membershipId,
        amount: amountNum,
        method,
        reference: reference.trim() || undefined,
        requestId,
        fee: noFeeRecord ? Number(fee) : null,
      });
      const p = res.data.payment;
      setDone({ paymentId: p._id, receipt: p.receiptNumber, paid: p.paidAmount, due: p.dueAmount });
      toast.success(`Payment of ${rupees(p.paidAmount)} recorded.`);
      setRequestId(newRequestId());
      setAmount('');
      setFee('');
      setReference('');
      onChanged();
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIndianRupee className="h-5 w-5" /> Fees · {student?.name}
          </DialogTitle>
          <DialogDescription>{student?.phone}</DialogDescription>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Totals */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Total fee" value={rupees(data.totals.fee)} />
              <Stat label="Paid" value={rupees(data.totals.paid)} tone="good" />
              <Stat label="Due" value={rupees(data.totals.due)} tone={data.totals.due > 0 ? 'bad' : 'good'} />
            </div>

            {done && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="flex-1">
                  Receipt <strong>{done.receipt}</strong> · paid {rupees(done.paid)} ·{' '}
                  {done.due > 0 ? <span className="text-amber-700 dark:text-amber-300">{rupees(done.due)} still due</span> : 'fully paid'}
                </span>
                <Button size="sm" variant="outline" onClick={() => openReceipt(done.paymentId)}>
                  <Printer className="mr-1.5 h-4 w-4" /> Receipt
                </Button>
              </div>
            )}

            {/* Collect */}
            {owing.length > 0 || noFeeRecord ? (
              <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
                <p className="font-medium">Collect fee</p>
                {noFeeRecord ? (
                  <p className="text-xs text-muted-foreground">
                    No fee is recorded for this member yet. Enter the total fee for the current membership
                    {data.student?.membershipEndDate ? ` (till ${day(data.student.membershipEndDate)})` : ''} and what they paid.
                  </p>
                ) : owing.length > 1 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="fee-period">Pay towards</Label>
                    <select
                      id="fee-period"
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={membershipId}
                      onChange={(e) => setMembershipId(e.target.value)}
                    >
                      {owing.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.planName} · {day(m.startDate)} – {day(m.endDate)} · {rupees(m.dueAmount)} due
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  target && (
                    <p className="text-xs text-muted-foreground">
                      {target.planName} · {day(target.startDate)} – {day(target.endDate)} · fee {rupees(target.fee)}, paid {rupees(target.paidTotal)}
                    </p>
                  )
                )}

                <div className="grid grid-cols-2 gap-3">
                  {noFeeRecord && (
                    <div className="space-y-1.5">
                      <Label htmlFor="fee-total">Total fee (₹)</Label>
                      <Input id="fee-total" type="number" inputMode="numeric" min={1} step={1} value={fee} onChange={(e) => setFee(e.target.value)} required />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="fee-amount">Amount received (₹)</Label>
                    <Input
                      id="fee-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      max={maxAmount || undefined}
                      placeholder={maxAmount ? String(maxAmount) : ''}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  {!noFeeRecord && (
                    <div className="flex items-end">
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setAmount(String(maxAmount))}>
                        Full {rupees(maxAmount)}
                      </Button>
                    </div>
                  )}
                </div>

                {amount && maxAmount > 0 && (
                  <p className={cn('rounded-md px-3 py-2 text-sm', after > 0 ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300')}>
                    {after > 0 ? `${rupees(after)} will still be due after this.` : 'This clears the balance.'}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fee-method">Method</Label>
                    <select
                      id="fee-method"
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
                  <div className="space-y-1.5">
                    <Label htmlFor="fee-ref">Reference (optional)</Label>
                    <Input id="fee-ref" placeholder="UPI / txn ID" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Collect &amp; generate receipt
                </Button>
              </form>
            ) : (
              <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">Nothing due — all fees are paid.</p>
            )}

            {onRenew && ['ACTIVE_MEMBER', 'EXPIRED'].includes(data.student?.status) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Next period</p>
                  <p className="text-xs text-muted-foreground">
                    {data.student?.membershipEndDate
                      ? `${data.student.status === 'EXPIRED' ? 'Expired' : 'Member till'} ${day(data.student.membershipEndDate)}. Renew to add the next month(s) and take the fee.`
                      : 'Renew to add a membership period and take the fee.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRenew({
                      _id: data.student._id,
                      name: data.student.name,
                      phone: data.student.phone,
                      status: data.student.status,
                      seatNumber: data.student.seatNumber,
                      membershipEndDate: data.student.membershipEndDate,
                    })
                  }
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Renew
                </Button>
              </div>
            )}

            {/* History */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Payment history</p>
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.payments.map((p) => (
                    <li key={p._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium tabular-nums">
                          {rupees(p.paidAmount)} <span className="font-normal text-muted-foreground">· {METHODS.find((m) => m.value === p.paymentMethod)?.label ?? p.paymentMethod}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.receiptNumber} · {day(p.paidAt)} · {p.dueAmount > 0 ? `${rupees(p.dueAmount)} due after` : 'cleared'}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openReceipt(p._id)} aria-label={`Receipt ${p.receiptNumber}`}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className={cn('text-base font-semibold tabular-nums sm:text-lg', tone === 'good' && 'text-emerald-600', tone === 'bad' && 'text-red-600')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
