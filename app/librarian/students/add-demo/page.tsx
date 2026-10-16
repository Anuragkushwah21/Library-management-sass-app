'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { Camera, ChevronDown, FileLock2, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/time';

interface Options {
  shifts: { _id: string; name: string; startTime: string; endTime: string }[];
  freeSeats: number[];
  today: string;
  demoDays: number;
  defaultEnd: string;
  uploadsEnabled: boolean;
}

type FieldErrors = Partial<Record<string, string>>;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p className="text-xs text-destructive" role="alert">
      {msg}
    </p>
  ) : null;
}

export default function AddDemoStudentPage() {
  const router = useRouter();
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    shiftId: '',
    seatNumber: '',
    demoStartDate: '',
    demoEndDate: '',
    examTarget: '',
    collegeName: '',
    parentContact: '',
    notes: '',
  });
  const [endTouched, setEndTouched] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [idProof, setIdProof] = useState<File | null>(null);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const firstErrorRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const res: any = await api.getDemoFormOptions();
      const o: Options = res.data;
      setOpts(o);
      setForm((f) => ({
        ...f,
        shiftId: f.shiftId || o.shifts[0]?._id || '',
        demoStartDate: f.demoStartDate || o.today,
        demoEndDate: f.demoEndDate || o.defaultEnd,
      }));
    } catch (err: any) {
      setLoadError(err.message || 'Could not load the form.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  // D8: end follows start (+ demoDays) until the librarian edits it
  const setStart = (v: string) => {
    setForm((f) => ({
      ...f,
      demoStartDate: v,
      demoEndDate: !endTouched && v && opts ? format(addDays(new Date(`${v}T00:00:00`), opts.demoDays), 'yyyy-MM-dd') : f.demoEndDate,
    }));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const length = form.demoStartDate && form.demoEndDate && form.demoEndDate >= form.demoStartDate ? days(form.demoStartDate, form.demoEndDate) : null;

  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (photoPreview && URL.revokeObjectURL(photoPreview)), [photoPreview]);

  /** Same rules the server applies (R15), so most mistakes show before submitting. */
  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (form.name.trim().length < 2) e.name = 'Full name is required.';
    if (!form.phone.trim()) e.phone = 'Mobile number is required.';
    else if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid 10-digit mobile number.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (!form.shiftId) e.shiftId = 'Choose a shift.';
    if (!form.seatNumber) e.seatNumber = 'Choose a seat.';
    if (!form.demoStartDate) e.demoStartDate = 'Demo start date is required.';
    else if (opts && form.demoStartDate < opts.today) e.demoStartDate = "Demo start date can't be in the past.";
    if (!form.demoEndDate) e.demoEndDate = 'Demo end date is required.';
    else if (form.demoEndDate < form.demoStartDate) e.demoEndDate = 'Demo end date must be on or after the start date.';
    else if (length && length > 30) e.demoEndDate = 'A demo can be at most 30 days.';
    if (form.parentContact && form.parentContact.replace(/\D/g, '').length < 10) e.parentContact = 'Enter a valid 10-digit parent contact number.';
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) e.photo = 'Photo must be a JPG, PNG or WebP under 5 MB.';
    if (idProof && (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(idProof.type) || idProof.size > 5 * 1024 * 1024)) e.idProof = 'ID proof must be a JPG, PNG, WebP or PDF under 5 MB.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.examTarget || e.collegeName || e.parentContact || e.idProof) setMore(true);
      setTimeout(() => firstErrorRef.current?.querySelector('[role=alert]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v.trim()) fd.append(k, v.trim());
      if (photo) fd.append('photo', photo);
      if (idProof) fd.append('idProof', idProof);
      const res: any = await api.addDemoStudent(fd);
      toast.success(res.message || `Demo started for ${form.name}`);
      for (const w of res.data?.warnings ?? []) toast.warn(w);
      router.push('/librarian/students?tab=demo');
    } catch (err: any) {
      // Server errors come with a field code like FIELD_phone, or a named conflict
      const code: string = err.code || '';
      const field = code.startsWith('FIELD_')
        ? code.slice(6)
        : code === 'DUPLICATE_PHONE'
        ? 'phone'
        : code === 'DUPLICATE_EMAIL'
        ? 'email'
        : code === 'SEAT_TAKEN'
        ? 'seatNumber'
        : code === 'INVALID_DEMO_DATES'
        ? 'demoEndDate'
        : code === 'BAD_PHOTO'
        ? 'photo'
        : code === 'BAD_ID_PROOF'
        ? 'idProof'
        : null;
      if (field) setErrors({ [field]: err.message });
      else toast.error(err.message);
      if (code === 'SEAT_TAKEN') load(); // refresh the free seats
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!opts) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-5" ref={firstErrorRef as any}>
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Add Demo Student</h1>
        <p className="text-muted-foreground">
          Start a free demo at the desk. The student appears in Demo Students straight away.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <label className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed bg-muted/50 text-muted-foreground hover:border-foreground/40">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Student photo preview" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-7 w-7" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                className="sr-only"
                disabled={!opts.uploadsEnabled}
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                aria-label="Student photo"
              />
            </label>
            <span className="text-xs text-muted-foreground">{opts.uploadsEnabled ? 'Photo (optional)' : 'Photo upload not set up'}</span>
            <FieldError msg={errors.photo} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Full name *</Label>
              <Input id="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} autoFocus />
              <FieldError msg={errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number *</Label>
              <Input id="phone" type="tel" inputMode="tel" placeholder="98765 43210" value={form.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
              <FieldError msg={errors.phone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
              <FieldError msg={errors.email} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={set('address')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo</CardTitle>
          <CardDescription>Default length: start date + {opts.demoDays} days. You can change the end date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="shift">Shift *</Label>
              <select
                id="shift"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.shiftId}
                onChange={set('shiftId')}
                aria-invalid={!!errors.shiftId}
              >
                {opts.shifts.length === 0 && <option value="">No shifts — add one first</option>}
                {opts.shifts.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({formatTime(s.startTime)}–{formatTime(s.endTime)})
                  </option>
                ))}
              </select>
              <FieldError msg={errors.shiftId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Start date *</Label>
              <Input id="start" type="date" min={opts.today} value={form.demoStartDate} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.demoStartDate} />
              <FieldError msg={errors.demoStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End date *</Label>
              <Input
                id="end"
                type="date"
                min={form.demoStartDate || opts.today}
                value={form.demoEndDate}
                onChange={(e) => {
                  setEndTouched(true);
                  setForm((f) => ({ ...f, demoEndDate: e.target.value }));
                }}
                aria-invalid={!!errors.demoEndDate}
              />
              {length && !errors.demoEndDate && <p className="text-xs text-muted-foreground">{length} days of demo</p>}
              <FieldError msg={errors.demoEndDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Seat * <span className="font-normal text-muted-foreground">— free seats only</span></Label>
            {opts.freeSeats.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No free seats. <Link href="/librarian/seats" className="text-primary hover:underline">Add seats</Link> or free one first.
              </p>
            ) : (
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Seat">
                {opts.freeSeats.map((n) => {
                  const on = form.seatNumber === String(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setForm((f) => ({ ...f, seatNumber: String(n) }))}
                      className={cn(
                        'flex h-11 items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums transition-colors',
                        on
                          ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
            <FieldError msg={errors.seatNumber} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
          aria-expanded={more}
        >
          <span className="font-semibold">More details (optional)</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', more && 'rotate-180')} />
        </button>
        {more && (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam">Exam target</Label>
              <Input id="exam" placeholder="e.g. UPSC 2027" value={form.examTarget} onChange={set('examTarget')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="college">College</Label>
              <Input id="college" value={form.collegeName} onChange={set('collegeName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parent">Parent contact</Label>
              <Input id="parent" type="tel" inputMode="tel" value={form.parentContact} onChange={set('parentContact')} aria-invalid={!!errors.parentContact} />
              <FieldError msg={errors.parentContact} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idproof" className="flex items-center gap-1.5">
                <FileLock2 className="h-3.5 w-3.5" />
                ID proof <span className="font-normal text-muted-foreground">(private)</span>
              </Label>
              <Input
                id="idproof"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={!opts.uploadsEnabled}
                onChange={(e) => setIdProof(e.target.files?.[0] ?? null)}
              />
              <FieldError msg={errors.idProof} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} />
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/librarian/students?tab=demo">Cancel</Link>
        </Button>
        <Button type="submit" disabled={busy || opts.shifts.length === 0}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Start demo
        </Button>
      </div>
    </form>
  );
}
