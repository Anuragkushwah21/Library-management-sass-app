'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';
import { formatInstant, formatMinutes, formatTime } from '@/lib/time';

/* ───────────── types ───────────── */

interface Intro {
  library: { name: string; phone: string | null; address: string | null };
  available: boolean;
  timezone: string;
  geofence: boolean;
  session: { phone: string } | null;
}

interface ScanResult {
  outcome:
    | 'CHECKED_IN'
    | 'CHECKED_OUT'
    | 'ALREADY_CHECKED_OUT'
    | 'NOT_REGISTERED'
    | 'AWAITING_APPROVAL'
    | 'REJECTED'
    | 'ACCESS_DENIED'
    | 'RENEWAL_REQUIRED'
    | 'OUTSIDE_SHIFT_HOURS'
    | 'NO_SHIFTS'
    | 'LIBRARY_UNAVAILABLE'
    | 'OUT_OF_RANGE'
    | 'LOCATION_REQUIRED';
  library: { name: string; phone?: string | null };
  student?: { name: string; seatNumber: number | null; status: string };
  shift?: { name: string; startTime: string; endTime: string };
  membership?: { endDate: string | null; daysLeft: number | null; expiringSoon: boolean };
  attendance?: {
    checkInAt: string | null;
    checkOutAt: string | null;
    totalMinutes: number;
    arrivalStatus: string;
    lateMinutes: number;
    autoCheckedOut: boolean;
  };
  nextShiftStart?: string | null;
  repeat?: boolean;
  timezone?: string;
  message?: string;
}

type Step =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'phone' }
  | { kind: 'otp'; phone: string; devCode?: string }
  | { kind: 'scanning' }
  | { kind: 'result'; result: ScanResult }
  | { kind: 'error'; message: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error || 'Something went wrong. Please try again.') as Error & { code?: string };
    err.code = json?.code;
    throw err;
  }
  return json?.data;
}

function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

/* ───────────── component ───────────── */

export function CheckinFlow() {
  const { slug } = useParams<{ slug: string }>();
  const k = useSearchParams().get('k') ?? '';
  const base = `/api/checkin/${encodeURIComponent(slug)}`;

  const [intro, setIntro] = useState<Intro | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const scannedOnce = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const doScan = useCallback(
    async (geofence: boolean) => {
      setStep({ kind: 'scanning' });
      try {
        const location = geofence ? await getLocation() : null;
        const result: ScanResult = await post(`${base}/scan`, { k, location });
        setStep({ kind: 'result', result });
      } catch (err: any) {
        if (err.code === 'SESSION_REQUIRED') return setStep({ kind: 'phone' });
        setStep({ kind: 'error', message: err.message });
      }
    },
    [base, k]
  );

  // Open the QR link → already verified on this phone? Scan straight away.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}?k=${encodeURIComponent(k)}`, { credentials: 'same-origin' });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setStep({ kind: 'invalid', message: json?.error || 'This QR code is not valid.' });
          return;
        }
        const data: Intro = json.data;
        setIntro(data);
        if (!data.available) {
          setStep({ kind: 'result', result: { outcome: 'LIBRARY_UNAVAILABLE', library: data.library } });
        } else if (data.session && !scannedOnce.current) {
          scannedOnce.current = true;
          doScan(data.geofence);
        } else {
          setStep({ kind: 'phone' });
        }
      } catch {
        setStep({ kind: 'error', message: 'No internet connection. Check your network and try again.' });
      }
    })();
  }, [base, k, doScan]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return setFormError('Enter your 10-digit mobile number.');
    setBusy(true);
    try {
      const data = await post(`${base}/otp/send`, { k, phone });
      setCode('');
      setResendIn(data?.resendInSeconds ?? 60);
      setStep({ kind: 'otp', phone, devCode: data?.devCode });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (value.length !== 6 || step.kind !== 'otp') return;
    setFormError(null);
    setBusy(true);
    try {
      await post(`${base}/otp/verify`, { k, phone: step.phone, code: value });
      await doScan(Boolean(intro?.geofence));
    } catch (err: any) {
      setFormError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await post(`${base}/logout`, {}).catch(() => {});
    setPhone('');
    setStep({ kind: 'phone' });
    setIntro((i) => (i ? { ...i, session: null } : i));
  };

  const libraryName = intro?.library.name ?? (step.kind === 'result' ? step.result.library.name : '');
  const tz = intro?.timezone ?? 'Asia/Kolkata';

  return (
    <main className="flex min-h-dvh flex-col bg-muted/40">
      <header className="border-b bg-card px-4 py-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Library check-in</p>
        <h1 className="mt-0.5 truncate text-lg font-bold">{libraryName || ' '}</h1>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        {step.kind === 'loading' || step.kind === 'scanning' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">{step.kind === 'scanning' ? 'Recording your scan…' : 'Opening…'}</p>
          </div>
        ) : step.kind === 'invalid' ? (
          <Panel tone="red" icon={XCircle} title="QR code not valid" body={step.message} />
        ) : step.kind === 'error' ? (
          <Panel tone="red" icon={AlertTriangle} title="Something went wrong" body={step.message}>
            <Button className="h-12 w-full" onClick={() => location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </Panel>
        ) : step.kind === 'phone' ? (
          <form onSubmit={sendCode} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-bold">Verify your mobile number</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll text you a 6-digit code. You only need to do this once on this phone.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="flex h-12 overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center border-r bg-muted px-3 text-sm text-muted-foreground">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  className="h-full rounded-none border-0 text-base shadow-none focus-visible:ring-0"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'phone-error' : undefined}
                  autoFocus
                />
              </div>
              {formError && (
                <p id="phone-error" className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Send code
              {!busy && <ArrowRight className="ml-2 h-5 w-5" />}
            </Button>
          </form>
        ) : step.kind === 'otp' ? (
          <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-bold">Enter the code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sent to{' '}
                <span className="font-medium text-foreground">
                  {step.phone.trim().startsWith('+') ? step.phone : `+91 ${step.phone}`}
                </span>
                .{' '}
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setStep({ kind: 'phone' })}>
                  Change
                </button>
              </p>
            </div>
            {step.devCode && (
              <p className="rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                Test mode — no SMS was sent. Your code is <strong className="tracking-widest">{step.devCode}</strong>
              </p>
            )}
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (v.length === 6) verify(v);
                }}
                disabled={busy}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit code"
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {formError && (
              <p className="text-center text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            {busy && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking…
              </p>
            )}
            <Button variant="outline" className="h-11 w-full" disabled={resendIn > 0 || busy} onClick={() => sendCode()}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </Button>
          </div>
        ) : (
          <ResultView result={step.result} tz={step.result.timezone ?? tz} onRescan={() => doScan(Boolean(intro?.geofence))} />
        )}

        {intro?.session && step.kind === 'result' && (
          <button
            type="button"
            onClick={signOut}
            className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Not {intro.session.phone}? Use another number
          </button>
        )}
      </div>
    </main>
  );
}

/* ───────────── result screens ───────────── */

const TONES = {
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-destructive/10 text-destructive',
  gray: 'bg-muted text-muted-foreground',
};

function Panel({
  tone,
  icon: Icon,
  title,
  body,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof CheckCircle2;
  title: string;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 text-center shadow-sm" aria-live="polite">
      <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-full', TONES[tone])}>
        <Icon className="h-9 w-9" />
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">{title}</h2>
      {body && <div className="mt-2 text-sm text-muted-foreground">{body}</div>}
      {children && <div className="mt-6 space-y-3 text-left">{children}</div>}
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y rounded-xl border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CallLibrary({ phone }: { phone?: string | null }) {
  if (!phone) return <p className="text-center text-sm text-muted-foreground">Please speak to the librarian at the desk.</p>;
  return (
    <Button asChild className="h-12 w-full text-base">
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
        <Phone className="mr-2 h-5 w-5" />
        Call the library
      </a>
    </Button>
  );
}

function ResultView({ result: r, tz, onRescan }: { result: ScanResult; tz: string; onRescan: () => void }) {
  const t = (iso?: string | null) => (iso ? formatInstant(iso, tz) : '—');
  const date = (iso?: string | null) =>
    iso ? new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—';
  const shiftLabel = r.shift ? `${r.shift.name} · ${formatTime(r.shift.startTime)}–${formatTime(r.shift.endTime)}` : '—';
  const daysLeft = r.membership?.daysLeft;

  switch (r.outcome) {
    case 'CHECKED_IN': {
      const late = r.attendance?.arrivalStatus === 'LATE';
      return (
        <Panel
          tone={late ? 'amber' : 'green'}
          icon={CheckCircle2}
          title={r.repeat ? 'Already checked in' : `Welcome, ${r.student?.name.split(' ')[0]}!`}
          body={r.repeat ? 'Your check-in was recorded a moment ago. Scan again when you leave.' : 'You are checked in.'}
        >
          <div
            className={cn(
              'rounded-xl px-4 py-3 text-center text-sm font-semibold',
              late ? TONES.amber : TONES.green
            )}
          >
            {late ? `Late by ${r.attendance?.lateMinutes} min` : 'On time — Present'}
          </div>
          <Rows
            rows={[
              ['Library', r.library.name],
              ['Name', r.student?.name],
              ['Seat', r.student?.seatNumber ?? 'Not assigned'],
              ['Shift', shiftLabel],
              ['Checked in', t(r.attendance?.checkInAt)],
              ['Membership', daysLeft == null ? 'Active' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`],
            ]}
          />
          {r.membership?.expiringSoon && (
            <p className="flex gap-2 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-200" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Your membership ends on {date(r.membership.endDate)}. Renew at the desk to keep your seat.
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">Scan the QR again when you leave.</p>
        </Panel>
      );
    }
    case 'CHECKED_OUT':
      return (
        <Panel tone="blue" icon={LogOut} title="Checked out" body={`See you next time, ${r.student?.name.split(' ')[0]}.`}>
          <div className={cn('rounded-xl px-4 py-4 text-center', TONES.blue)}>
            <div className="text-3xl font-bold tabular-nums">{formatMinutes(r.attendance?.totalMinutes ?? 0)}</div>
            <div className="text-xs font-medium uppercase tracking-wide">Study time today</div>
          </div>
          <Rows
            rows={[
              ['Library', r.library.name],
              ['Seat', r.student?.seatNumber ?? 'Not assigned'],
              ['Checked in', t(r.attendance?.checkInAt)],
              ['Checked out', t(r.attendance?.checkOutAt)],
            ]}
          />
        </Panel>
      );
    case 'ALREADY_CHECKED_OUT':
      return (
        <Panel tone="gray" icon={CheckCircle2} title="You have already checked out today">
          <Rows
            rows={[
              ['Shift', shiftLabel],
              ['Checked in', t(r.attendance?.checkInAt)],
              ['Checked out', `${t(r.attendance?.checkOutAt)}${r.attendance?.autoCheckedOut ? ' (auto)' : ''}`],
              ['Study time', formatMinutes(r.attendance?.totalMinutes ?? 0)],
            ]}
          />
        </Panel>
      );
    case 'RENEWAL_REQUIRED':
      return (
        <Panel
          tone="red"
          icon={Hourglass}
          title="Membership expired"
          body={
            r.membership?.endDate ? (
              <>
                Your membership ended on <strong className="text-foreground">{date(r.membership.endDate)}</strong>. Attendance
                can&apos;t be marked until you renew.
              </>
            ) : (
              "Your membership has ended. Attendance can't be marked until you renew."
            )
          }
        >
          <CallLibrary phone={r.library.phone} />
          <p className="text-center text-xs text-muted-foreground">Ask the librarian to renew — your past attendance is kept.</p>
        </Panel>
      );
    case 'OUTSIDE_SHIFT_HOURS':
      return (
        <Panel
          tone="gray"
          icon={Clock}
          title="Outside your shift hours"
          body={
            r.nextShiftStart
              ? `Your next shift (${r.shift?.name}) starts at ${t(r.nextShiftStart)}${date(r.nextShiftStart) !== date(new Date().toISOString()) ? ` on ${date(r.nextShiftStart)}` : ''}.`
              : `Your shift: ${shiftLabel}.`
          }
        >
          <Button variant="outline" className="h-12 w-full" onClick={onRescan}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Scan again
          </Button>
        </Panel>
      );
    case 'NOT_REGISTERED':
      return (
        <Panel tone="amber" icon={UserX} title="Number not registered" body="This mobile number isn't registered with the library yet. Please ask the librarian to add you.">
          <CallLibrary phone={r.library.phone} />
        </Panel>
      );
    case 'AWAITING_APPROVAL':
      return <Panel tone="amber" icon={Hourglass} title="Waiting for approval" body="The librarian hasn't approved your registration yet. Please check back soon." />;
    case 'REJECTED':
      return <Panel tone="red" icon={XCircle} title="Registration not approved" body="Please speak to the librarian." />;
    case 'ACCESS_DENIED':
      return (
        <Panel tone="red" icon={Ban} title="Access denied" body="Your access to this library is blocked. Please speak to the librarian.">
          <CallLibrary phone={r.library.phone} />
        </Panel>
      );
    case 'NO_SHIFTS':
      return <Panel tone="gray" icon={Clock} title="No shifts set up" body="The library hasn't set up its shifts yet. Please tell the librarian." />;
    case 'LIBRARY_UNAVAILABLE':
      return <Panel tone="gray" icon={ShieldCheck} title="Check-in unavailable" body="This library's check-in is temporarily unavailable. Please speak to the librarian." />;
    case 'LOCATION_REQUIRED':
    case 'OUT_OF_RANGE':
      return (
        <Panel
          tone="amber"
          icon={MapPin}
          title={r.outcome === 'OUT_OF_RANGE' ? "You're not at the library" : 'Location needed'}
          body={
            r.outcome === 'OUT_OF_RANGE'
              ? `${r.message ?? ''} Scan the QR once you're inside.`
              : 'This library checks that you are inside before marking attendance. Allow location access and try again.'
          }
        >
          <Button className="h-12 w-full" onClick={onRescan}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </Panel>
      );
  }
}
