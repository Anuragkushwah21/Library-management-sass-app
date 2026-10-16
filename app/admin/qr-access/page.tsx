'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Coins, Loader2, QrCode, RefreshCw, Save, Search, Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Row {
  _id: string;
  name: string;
  owner: { name: string; email: string } | null;
  qrAttendanceEnabled: boolean;
  otpEnabled: boolean;
  accessStatus: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  accessExpiresAt: string | null;
  smsCreditBalance: number;
  monthlyOtpLimit: number | null;
  otpUsedThisMonth: number;
  accessNote: string;
  accessUpdatedAt: string | null;
  qrRequestedAt: string | null;
  live: boolean;
}

const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const STATUS_BADGE: Record<Row['accessStatus'], string> = {
  ACTIVE: 'bg-emerald-600 hover:bg-emerald-600',
  SUSPENDED: 'bg-rose-600 hover:bg-rose-600',
  EXPIRED: 'bg-zinc-500 hover:bg-zinc-500',
};

const TX_LABEL: Record<string, string> = {
  CREDIT_ADD: 'Credits added',
  CREDIT_ADJUST: 'Credits adjusted',
  OTP_SEND: 'OTP sent',
  OTP_VERIFY: 'OTP verified',
  REFUND: 'Refund (SMS failed)',
};

export default function AdminQrAccessPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pricing, setPricing] = useState({ qrServicePrice: '', smsCreditPrice: '', qrServiceNote: '' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res: any = await api.adminListQrAccess();
      setRows(res.data.libraries);
      setPricing((p) =>
        p.qrServicePrice === '' && p.smsCreditPrice === ''
          ? {
              qrServicePrice: String(res.data.pricing.qrServicePrice || ''),
              smsCreditPrice: String(res.data.pricing.smsCreditPrice || ''),
              qrServiceNote: res.data.pricing.qrServiceNote || '',
            }
          : p
      );
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.owner?.email.toLowerCase().includes(q) || r.owner?.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const savePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrice(true);
    try {
      await api.updateSystemSettings({
        qrServicePrice: Number(pricing.qrServicePrice) || 0,
        smsCreditPrice: Number(pricing.smsCreditPrice) || 0,
        qrServiceNote: pricing.qrServiceNote,
      });
      toast({ title: 'Pricing saved', description: 'Librarians without QR now see this price.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingPrice(false);
    }
  };

  const requested = (rows ?? []).filter((r) => r.qrRequestedAt && !r.live).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">QR/OTP Access</h1>
          <p className="text-muted-foreground">
            QR attendance is a paid add-on. Only you decide which library gets it, and how many SMS credits it has.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh">
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4" />
            Pricing shown to librarians
          </CardTitle>
          <CardDescription>Libraries without QR see this on their QR Attendance page, with a “Request QR service” button.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePricing} className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="qr-price">QR service (₹/month)</Label>
              <Input id="qr-price" type="number" min={0} value={pricing.qrServicePrice} onChange={(e) => setPricing({ ...pricing, qrServicePrice: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-price">Per SMS credit (₹)</Label>
              <Input id="sms-price" type="number" min={0} step="0.01" value={pricing.smsCreditPrice} onChange={(e) => setPricing({ ...pricing, smsCreditPrice: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-note">Note (optional)</Label>
              <Input id="qr-note" placeholder="e.g. Pay by UPI to admin@upi, then request" value={pricing.qrServiceNote} onChange={(e) => setPricing({ ...pricing, qrServiceNote: e.target.value })} />
            </div>
            <Button type="submit" disabled={savingPrice}>
              {savingPrice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Library or librarian" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search libraries" />
        </div>
        {requested > 0 && <Badge className="bg-sky-600 hover:bg-sky-600">{requested} waiting for QR</Badge>}
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !rows ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No libraries found.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Library</th>
                    <th className="px-4 py-2.5 font-medium">QR + OTP service</th>
                    <th className="px-4 py-2.5 font-medium">Credits</th>
                    <th className="px-4 py-2.5 font-medium">This month</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => (
                    <tr key={r._id} className="align-middle">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium">
                          {r.name}
                          {r.qrRequestedAt && !r.live && <Badge className="bg-sky-600 text-[10px] hover:bg-sky-600">Requested</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.owner?.email ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {r.accessStatus !== 'ACTIVE' ? (
                          <Badge className={STATUS_BADGE[r.accessStatus]}>{r.accessStatus.toLowerCase()}</Badge>
                        ) : r.qrAttendanceEnabled ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">On</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Off</Badge>
                        )}
                        {r.accessExpiresAt && <div className="mt-1 text-xs text-muted-foreground">paid until {format(new Date(r.accessExpiresAt), 'd MMM yyyy')}</div>}
                      </td>
                      <td className={cn('px-4 py-3 font-semibold tabular-nums', r.smsCreditBalance === 0 ? 'text-rose-600' : r.smsCreditBalance <= 10 ? 'text-amber-600' : '')}>
                        {r.smsCreditBalance}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {r.otpUsedThisMonth}
                        <span className="text-muted-foreground"> / {r.monthlyOtpLimit ?? '∞'}</span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setOpenId(r._id)}>
                          <Settings2 className="mr-1.5 h-4 w-4" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ManageSheet libraryId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function ManageSheet({ libraryId, onClose, onChanged }: { libraryId: string | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ on: false, expires: '', limit: '', note: '' });
  const [credit, setCredit] = useState({ amount: '', note: '' });
  const [creditReq, setCreditReq] = useState(newRequestId);
  const [busy, setBusy] = useState<'save' | 'credit' | null>(null);
  const [tab, setTab] = useState<'ledger' | 'changes'>('ledger');

  const load = useCallback(async () => {
    if (!libraryId) return;
    try {
      const res: any = await api.adminGetQrAccess(libraryId);
      const lib = res.data.library;
      setDetail(res.data);
      setForm({
        on: Boolean(lib.qrAttendanceEnabled) && (lib.accessStatus ?? 'ACTIVE') === 'ACTIVE',
        expires: lib.accessExpiresAt ? String(lib.accessExpiresAt).slice(0, 10) : '',
        limit: lib.monthlyOtpLimit ? String(lib.monthlyOtpLimit) : '',
        note: '',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [libraryId, toast]);

  useEffect(() => {
    setDetail(null);
    setCredit({ amount: '', note: '' });
    setCreditReq(newRequestId());
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libraryId) return;
    if (form.note.trim().length < 3) {
      toast({ title: 'Add a reason', description: 'Every access change needs a short note.', variant: 'destructive' });
      return;
    }
    setBusy('save');
    try {
      await api.adminUpdateQrAccess(libraryId, {
        // One switch: on = QR check-in + phone OTP; off = both stop
        qrAttendanceEnabled: form.on,
        accessExpiresAt: form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : null,
        monthlyOtpLimit: form.limit ? Number(form.limit) : null,
        note: form.note.trim(),
      });
      toast({ title: form.on ? 'Service is on' : 'Service is off', description: 'The librarian has been notified.' });
      await load();
      onChanged();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const addCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libraryId) return;
    const n = Number(credit.amount);
    if (!Number.isInteger(n) || n === 0) {
      toast({ title: 'Enter a whole number of credits', variant: 'destructive' });
      return;
    }
    if (credit.note.trim().length < 3) {
      toast({ title: 'Add a note', description: 'e.g. “Paid ₹500 by UPI”.', variant: 'destructive' });
      return;
    }
    setBusy('credit');
    try {
      const res: any = await api.adminAddSmsCredits(libraryId, { credits: n, note: credit.note.trim(), requestId: creditReq });
      toast({ title: res.message, description: `New balance: ${res.data.balance}` });
      setCredit({ amount: '', note: '' });
      setCreditReq(newRequestId());
      await load();
      onChanged();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const lib = detail?.library;

  return (
    <Sheet open={!!libraryId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {lib?.name ?? 'Library'}
          </SheetTitle>
          <SheetDescription>{lib?.ownerId?.email ?? ''}</SheetDescription>
        </SheetHeader>

        {!detail ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 px-4 pb-8">
            <form onSubmit={save} className="space-y-4 rounded-xl border p-4">
              <h3 className="font-semibold">Service</h3>
              <label
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors',
                  form.on ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-muted/40'
                )}
              >
                <span>
                  <span className="font-medium">QR attendance + phone OTP</span>
                  <span className="block text-xs text-muted-foreground">
                    {form.on ? 'On — students scan the QR, verify their phone and check in.' : 'Off — the library uses manual attendance only.'}
                  </span>
                </span>
                <Switch checked={form.on} onCheckedChange={(v) => setForm({ ...form, on: v })} aria-label="QR + OTP service" />
              </label>
              {lib && lib.accessStatus !== 'ACTIVE' && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  {lib.accessStatus === 'EXPIRED' ? 'The paid period has ended.' : 'Access is suspended.'} Set a new paid-until date and switch the service on after payment.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="acc-exp">Paid until (optional)</Label>
                <Input id="acc-exp" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
                <p className="text-xs text-muted-foreground">The service switches itself off after this date until it's renewed.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-limit">Monthly OTP limit</Label>
                <Input id="acc-limit" type="number" min={1} placeholder="No limit" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-note">Reason / note *</Label>
                <Textarea id="acc-note" rows={2} maxLength={300} placeholder="e.g. Paid ₹499 for October by UPI" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                {lib?.accessNote && <p className="text-xs text-muted-foreground">Last note: “{lib.accessNote}”</p>}
              </div>
              <Button type="submit" className="w-full" disabled={busy === 'save'}>
                {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save access
              </Button>
            </form>

            <form onSubmit={addCredits} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">SMS credits</h3>
                <span className={cn('text-2xl font-bold tabular-nums', (lib?.smsCreditBalance ?? 0) === 0 && 'text-rose-600')}>{lib?.smsCreditBalance ?? 0}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 500, 1000].map((n) => (
                  <Button key={n} type="button" size="sm" variant={credit.amount === String(n) ? 'default' : 'outline'} onClick={() => setCredit({ ...credit, amount: String(n) })}>
                    +{n}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <Input type="number" placeholder="Amount" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} aria-label="Credits (negative to correct)" />
                <Input placeholder="Note, e.g. Paid ₹500 UPI" value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} aria-label="Credit note" />
              </div>
              <p className="text-xs text-muted-foreground">Use a negative number to correct a mistake.</p>
              <Button type="submit" variant="secondary" className="w-full" disabled={busy === 'credit'}>
                {busy === 'credit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update credits
              </Button>
            </form>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['OTP sent', detail.usage.sends],
                ['Verified', detail.usage.verifies],
                ['Refunded', detail.usage.refunds],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg border p-2">
                  <div className="text-lg font-bold tabular-nums">{v as number}</div>
                  <div className="text-xs text-muted-foreground">{k} · {detail.month}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist">
                {(['ledger', 'changes'] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    {t === 'ledger' ? 'Credits & OTP' : 'Changes'}
                  </button>
                ))}
              </div>
              <ul className="divide-y rounded-lg border text-sm">
                {(tab === 'ledger' ? detail.transactions : detail.changes).length === 0 && (
                  <li className="px-3 py-6 text-center text-muted-foreground">Nothing yet.</li>
                )}
                {tab === 'ledger'
                  ? detail.transactions.map((t: any) => (
                      <li key={t._id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {TX_LABEL[t.type] ?? t.type}
                            {t.status === 'FAILED' && <span className="ml-1 text-xs text-rose-600">(failed)</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.note || t.phoneMasked || ''} · {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className={cn('block font-semibold', t.credits > 0 ? 'text-emerald-600' : t.credits < 0 ? 'text-rose-600' : 'text-muted-foreground')}>
                            {t.credits > 0 ? `+${t.credits}` : t.credits}
                          </span>
                          <span className="block text-xs text-muted-foreground">bal {t.balanceAfter}</span>
                        </span>
                      </li>
                    ))
                  : detail.changes.map((c: any) => (
                      <li key={c._id} className="px-3 py-2">
                        <span className="block font-medium">{String(c.action).replace('qr_access.', '').replace('_', ' ')}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.meta?.note ? `“${c.meta.note}” · ` : ''}
                          {c.meta?.changed?.length ? `changed ${c.meta.changed.join(', ')} · ` : ''}
                          {c.meta?.credits ? `${c.meta.credits > 0 ? '+' : ''}${c.meta.credits} credits · ` : ''}
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                        </span>
                      </li>
                    ))}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
