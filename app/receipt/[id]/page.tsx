'use client';

import { use, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Receipt {
  receiptNumber: string;
  paidAt: string;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  reference: string | null;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  totalFee: number;
  paidBefore: number;
  paidNow: number;
  totalPaid: number;
  balanceDue: number;
  library: { name: string; address: string; phone: string; email: string; timezone: string } | null;
  student: { name: string; phone: string; email: string; seatNumber: number | null } | null;
  membership: { planName: string; startDate: string; endDate: string } | null;
  shift: { name: string; startTime: string | null; endTime: string | null } | null;
  collectedBy: string | null;
}

const METHOD: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' };
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// Indian numbering: 1,25,000 → "One Lakh Twenty Five Thousand"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function inWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const hundred = Math.floor((n % 1e3) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getReceipt(id)
      .then((r: any) => setReceipt(r.data))
      .catch((e: any) => setError(e.message || 'Could not load the receipt.'));
  }, [id]);

  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="space-y-3">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => history.back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  if (!receipt)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  const tz = receipt.library?.timezone || 'Asia/Kolkata';
  const date = (d: string, withTime = false) =>
    new Date(d).toLocaleString('en-IN', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  const cleared = receipt.balanceDue === 0;

  const shareText = [
    `${receipt.library?.name ?? 'Library'} — Fee receipt ${receipt.receiptNumber}`,
    `${receipt.student?.name ?? ''}`,
    `Paid now: ${rupees(receipt.paidNow)} (${METHOD[receipt.method]})`,
    `Total fee: ${rupees(receipt.totalFee)} · Total paid: ${rupees(receipt.totalPaid)}`,
    cleared ? 'Balance: fully paid' : `Balance due: ${rupees(receipt.balanceDue)}`,
    receipt.membership ? `Valid ${date(receipt.membership.startDate)} – ${date(receipt.membership.endDate)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const waPhone = receipt.student?.phone?.replace(/\D/g, '') ?? '';

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6 print:bg-white print:p-0">
      {/* Toolbar (not printed) */}
      <div className="mx-auto mb-4 flex max-w-xl flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => (history.length > 1 ? history.back() : window.close())}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
              <Share2 className="mr-1.5 h-4 w-4" /> WhatsApp
            </a>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-xl rounded-xl border bg-white p-6 text-zinc-900 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{receipt.library?.name}</h1>
            {receipt.library?.address && <p className="text-sm text-zinc-600">{receipt.library.address}</p>}
            <p className="text-sm text-zinc-600">{[receipt.library?.phone, receipt.library?.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Fee receipt</p>
            <p className="text-lg font-bold tabular-nums">{receipt.receiptNumber}</p>
            <p className="text-sm text-zinc-600">{date(receipt.paidAt, true)}</p>
          </div>
        </header>

        {/* Student + membership */}
        <section className="grid grid-cols-1 gap-4 border-b border-zinc-200 py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Received from</p>
            <p className="font-semibold">{receipt.student?.name}</p>
            <p className="text-zinc-600">{receipt.student?.phone}</p>
            {receipt.student?.email && <p className="text-zinc-600">{receipt.student.email}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Membership</p>
            <p className="font-semibold">{receipt.membership?.planName ?? '—'}</p>
            {receipt.membership && (
              <p className="text-zinc-600">
                {date(receipt.membership.startDate)} – {date(receipt.membership.endDate)}
              </p>
            )}
            <p className="text-zinc-600">
              {[receipt.student?.seatNumber ? `Seat ${receipt.student.seatNumber}` : null, receipt.shift ? `${receipt.shift.name}${receipt.shift.startTime ? ` (${receipt.shift.startTime}–${receipt.shift.endTime})` : ''}` : null]
                .filter(Boolean)
                .join(' · ') || ' '}
            </p>
          </div>
        </section>

        {/* Amounts */}
        <section className="py-4">
          <table className="w-full text-sm">
            <tbody className="[&_td]:py-1.5">
              <tr>
                <td className="text-zinc-600">Total fee</td>
                <td className="text-right font-medium tabular-nums">{rupees(receipt.totalFee)}</td>
              </tr>
              <tr>
                <td className="text-zinc-600">Paid earlier</td>
                <td className="text-right tabular-nums">{rupees(receipt.paidBefore)}</td>
              </tr>
              <tr className="border-y border-zinc-200 text-base">
                <td className="py-2.5 font-semibold">Paid now</td>
                <td className="py-2.5 text-right font-bold tabular-nums">{rupees(receipt.paidNow)}</td>
              </tr>
              <tr>
                <td className="text-zinc-600">Total paid</td>
                <td className="text-right font-medium tabular-nums">{rupees(receipt.totalPaid)}</td>
              </tr>
              <tr>
                <td className="font-semibold">Balance due</td>
                <td className={cn('text-right font-bold tabular-nums', cleared ? 'text-emerald-700' : 'text-red-600')}>{rupees(receipt.balanceDue)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-zinc-600">
            Amount received in words: <span className="font-medium text-zinc-900">Rupees {inWords(receipt.paidNow)} Only</span>
          </p>
        </section>

        {/* Payment details */}
        <section className="flex flex-wrap items-end justify-between gap-4 border-t border-zinc-200 pt-4 text-sm">
          <div className="space-y-0.5 text-zinc-600">
            <p>
              Method: <span className="font-medium text-zinc-900">{METHOD[receipt.method]}</span>
              {receipt.reference && <> · Ref: <span className="font-medium text-zinc-900">{receipt.reference}</span></>}
            </p>
            {receipt.collectedBy && <p>Collected by: {receipt.collectedBy}</p>}
          </div>
          <span
            className={cn(
              'rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider',
              cleared ? 'border-emerald-600 text-emerald-700' : 'border-amber-500 text-amber-700'
            )}
          >
            {cleared ? 'Fully paid' : 'Partially paid'}
          </span>
        </section>

        <p className="mt-6 text-center text-xs text-zinc-500">This is a computer-generated receipt and needs no signature.</p>
      </article>
    </div>
  );
}
