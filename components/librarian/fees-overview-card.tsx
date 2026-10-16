'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, IndianRupee, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { openReceipt } from '@/components/librarian/fees-dialog';
import { cn } from '@/lib/utils';

export interface FeesOverview {
  today: { amount: number; count: number };
  month: { amount: number; count: number };
  due: { amount: number; students: number };
  byMethod: Record<'CASH' | 'UPI' | 'BANK_TRANSFER', number>;
  trend: { month: string; amount: number }[];
  recent: {
    _id: string;
    receiptNumber: string;
    studentName: string;
    paidAmount: number;
    dueAmount: number;
    method: string;
    paidAt: string;
  }[];
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const METHOD: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank' };

/** Money at a glance: collected today / this month, what is still owed, trend and latest receipts. */
export function FeesOverviewCard({ fees }: { fees: FeesOverview }) {
  const monthTotal = fees.month.amount || 1;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-primary" /> Fees
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/librarian/students?tab=due">
            Collect dues <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Collected today" value={rupees(fees.today.amount)} sub={`${fees.today.count} receipt${fees.today.count === 1 ? '' : 's'}`} tone="good" />
          <Tile label="This month" value={rupees(fees.month.amount)} sub={`${fees.month.count} receipt${fees.month.count === 1 ? '' : 's'}`} />
          <Link href="/librarian/students?tab=due" className="contents">
            <Tile
              label="Pending dues"
              value={rupees(fees.due.amount)}
              sub={fees.due.students ? `from ${fees.due.students} student${fees.due.students === 1 ? '' : 's'}` : 'nothing pending'}
              tone={fees.due.amount > 0 ? 'bad' : 'good'}
              interactive
            />
          </Link>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">This month by method</p>
            <div className="mt-2 space-y-1.5">
              {(['CASH', 'UPI', 'BANK_TRANSFER'] as const).map((k) => (
                <div key={k} className="text-xs">
                  <div className="flex justify-between">
                    <span>{METHOD[k]}</span>
                    <span className="font-medium tabular-nums">{rupees(fees.byMethod[k] ?? 0)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((fees.byMethod[k] ?? 0) / monthTotal) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="mb-2 text-sm font-medium">Collected, last 6 months</p>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fees.trend} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                  <Tooltip formatter={(v: number) => [rupees(v), 'Collected']} cursor={{ fillOpacity: 0.1 }} />
                  <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2">
            <p className="mb-2 text-sm font-medium">Latest receipts</p>
            {fees.recent.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No fees collected yet. Use <strong>Collect</strong> on the Students page.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {fees.recent.map((p) => (
                  <li key={p._id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.receiptNumber} · {METHOD[p.method] ?? p.method} · {formatDistanceToNow(new Date(p.paidAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-emerald-600">+{rupees(p.paidAmount)}</p>
                      {p.dueAmount > 0 && <p className="text-xs tabular-nums text-red-600">{rupees(p.dueAmount)} due</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openReceipt(p._id)} aria-label={`Print receipt ${p.receiptNumber}`}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, sub, tone, interactive }: { label: string; value: string; sub: string; tone?: 'good' | 'bad'; interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'bad' && 'border-red-500/30 bg-red-500/5',
        interactive && 'cursor-pointer transition-colors hover:border-primary/50'
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums sm:text-2xl', tone === 'good' && 'text-emerald-600', tone === 'bad' && 'text-red-600')}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
