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
  Smartphone,
  UserX,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';
import { formatInstant, formatLate, formatMinutes, formatTime } from '@/lib/time';

/* ───────────── types ───────────── */

interface Intro {
  library: { name: string; phone: string | null; address: string | null };
  available: boolean;
  qrEnabled: boolean;
  otpEnabled: boolean;
  reason: 'LIBRARY_UNAVAILABLE' | 'QR_DISABLED' | 'OTP_DISABLED' | null;
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
    | 'LOCATION_REQUIRED'
    | 'DEMO_NOT_STARTED'
    | 'QR_DISABLED'
    | 'OTP_DISABLED';
  library: { name: string; phone?: string | null };
  student?: { name: string; seatNumber: number | null; status: string };
  shift?: { name: string; startTime: string; endTime: string };
  membership?: { endDate: string | null; daysLeft: number | null; expiringSoon: boolean; isDemo?: boolean };
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
  | { kind: 'register' }
  | { kind: 'demoStarted'; result: ScanResult; demoDays: number }
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
        // Number not registered yet → the demo form (PLAN §2.3)
        setStep(result.outcome === 'NOT_REGISTERED' ? { kind: 'register' } : { kind: 'result', result });
      } catch (err: any) {
        if (err.code === 'SESSION_REQUIRED') return setStep({ kind: 'phone' });
        if (err.code === 'QR_DISABLED' || err.code === 'LIBRARY_UNAVAILABLE') {
          return setStep({ kind: 'result', result: { outcome: err.code, library: intro?.library ?? { name: '' } } });
        }
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
        // §12.4: when the admin hasn't enabled QR, never touch the OTP APIs
        if (!data.qrEnabled) {
          setStep({ kind: 'result', result: { outcome: 'QR_DISABLED', library: data.library } });
        } else if (!data.otpEnabled && !data.session) {
          setStep({ kind: 'result', result: { outcome: 'OTP_DISABLED', library: data.library } });
        } else if (!data.available) {
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
        ) : step.kind === 'register' ? (
          <DemoForm
            base={base}
            k={k}
            geofence={Boolean(intro?.geofence)}
            onDone={(result, demoDays, already) =>
              setStep(already ? { kind: 'result', result } : { kind: 'demoStarted', result, demoDays })
            }
          />
        ) : step.kind === 'demoStarted' ? (
          <DemoStarted result={step.result} demoDays={step.demoDays} tz={step.result.timezone ?? tz} />
        ) : (
          <ResultView result={step.result} tz={step.result.timezone ?? tz} onRescan={() => doScan(Boolean(intro?.geofence))} />
        )}

        {intro?.session && (step.kind === 'result' || step.kind === 'register' || step.kind === 'demoStarted') && (
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
            {late ? `Late by ${formatLate(r.attendance?.lateMinutes ?? 0)}` : 'On time — Present'}
          </div>
          <Rows
            rows={[
              ['Library', r.library.name],
              ['Name', r.student?.name],
              ['Seat', r.student?.seatNumber ?? 'Not assigned'],
              ['Shift', shiftLabel],
              ['Checked in', t(r.attendance?.checkInAt)],
              [
                r.membership?.isDemo ? 'Demo' : 'Membership',
                daysLeft == null ? 'Active' : daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
              ],
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
          title={r.membership?.isDemo ? 'Your demo has ended' : 'Membership expired'}
          body={
            r.membership?.isDemo ? (
              <>
                Your free demo {r.membership.endDate ? <>ended on <strong className="text-foreground">{date(r.membership.endDate)}</strong></> : 'has ended'}.
                Take a membership at the desk to keep studying here.
              </>
            ) : r.membership?.endDate ? (
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
    case 'QR_DISABLED':
      return (
        <Panel tone="gray" icon={ShieldCheck} title="QR check-in unavailable" body="QR check-in is currently unavailable. Please contact library staff.">
          <CallLibrary phone={r.library.phone} />
        </Panel>
      );
    case 'OTP_DISABLED':
      return (
        <Panel tone="gray" icon={ShieldCheck} title="Verification unavailable" body="Phone verification is currently unavailable. Please contact library staff.">
          <CallLibrary phone={r.library.phone} />
        </Panel>
      );
    case 'DEMO_NOT_STARTED':
      return (
        <Panel
          tone="blue"
          icon={Clock}
          title="Your demo hasn't started yet"
          body={r.message ? `It starts on ${date(r.message)}. See you then!` : 'See you on your start date.'}
        />
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

/* ───────────── demo form (unregistered number) ───────────── */

interface DemoOptions {
  shifts: { _id: string; name: string; startTime: string; endTime: string }[];
  freeSeats: number[];
  demoDays: number;
  uploadsEnabled: boolean;
}

function DemoForm({
  base,
  k,
  geofence,
  onDone,
}: {
  base: string;
  k: string;
  geofence: boolean;
  onDone: (result: ScanResult, demoDays: number, alreadyRegistered: boolean) => void;
}) {
  const [opts, setOpts] = useState<DemoOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', shiftId: '', seatNumber: '', email: '', examTarget: '', collegeName: '', parentContact: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`${base}/options?k=${encodeURIComponent(k)}`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Could not load the form.');
      setOpts(json.data);
      setForm((f) => ({ ...f, shiftId: f.shiftId || json.data.shifts[0]?._id || '' }));
    } catch (err: any) {
      setLoadError(err.message);
    }
  }, [base, k]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opts) return;
    if (form.name.trim().length < 2) return setError({ field: 'name', message: 'Please enter your full name.' });
    if (!form.shiftId) return setError({ field: 'shiftId', message: 'Choose your shift.' });
    if (opts.freeSeats.length && !form.seatNumber) return setError({ field: 'seatNumber', message: 'Choose a seat.' });
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('k', k);
      for (const [key, v] of Object.entries(form)) if (v.trim()) fd.append(key, v.trim());
      if (photo) fd.append('photo', photo);
      if (geofence) {
        const loc = await getLocation();
        if (loc) {
          fd.append('lat', String(loc.lat));
          fd.append('lng', String(loc.lng));
        }
      }
      const res = await fetch(`${base}/register`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const code: string = json?.code || '';
        const field = code.startsWith('FIELD_') ? code.slice(6) : code === 'SEAT_TAKEN' ? 'seatNumber' : undefined;
        setError({ field, message: json?.error || 'Could not start your demo. Please try again.' });
        if (code === 'SEAT_TAKEN') load();
        return;
      }
      onDone(json.data.scan, opts.demoDays, Boolean(json.data.alreadyRegistered));
    } catch {
      setError({ message: 'No internet connection. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Panel tone="red" icon={AlertTriangle} title="Something went wrong" body={loadError}>
        <Button className="h-12 w-full" onClick={load}>
          Try again
        </Button>
      </Panel>
    );
  }
  if (!opts) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fieldErr = (f: string) =>
    error?.field === f ? (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <strong>Your number is not registered.</strong> Please fill the demo form — your free {opts.demoDays + 1}-day demo starts
        right away.
      </div>

      <div className="flex items-center gap-4">
        <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed bg-muted/50 text-muted-foreground">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(photo)} alt="Your photo" className="h-full w-full object-cover" />
          ) : (
            <Smartphone className="h-6 w-6" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="sr-only"
            disabled={!opts.uploadsEnabled}
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            aria-label="Your photo"
          />
        </label>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="d-name">Full name *</Label>
          <Input id="d-name" className="h-12 text-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          {fieldErr('name')}
        </div>
      </div>
      {opts.uploadsEnabled && <p className="-mt-2 text-xs text-muted-foreground">Tap the circle to take a photo (optional).</p>}

      <div className="space-y-1.5">
        <Label htmlFor="d-shift">Shift *</Label>
        <select
          id="d-shift"
          className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-base"
          value={form.shiftId}
          onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
        >
          {opts.shifts.map((sh) => (
            <option key={sh._id} value={sh._id}>
              {sh.name} ({formatTime(sh.startTime)}–{formatTime(sh.endTime)})
            </option>
          ))}
        </select>
        {fieldErr('shiftId')}
      </div>

      <div className="space-y-1.5">
        <Label>Seat {opts.freeSeats.length ? '*' : ''}</Label>
        {opts.freeSeats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No seat is free right now — the librarian will give you one.</p>
        ) : (
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Seat">
            {opts.freeSeats.map((n) => {
              const on = form.seatNumber === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm({ ...form, seatNumber: String(n) })}
                  className={cn(
                    'flex h-12 items-center justify-center rounded-lg border-2 text-base font-semibold tabular-nums',
                    on ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
        {fieldErr('seatNumber')}
      </div>

      <button type="button" className="text-sm font-medium text-primary" onClick={() => setMore((m) => !m)} aria-expanded={more}>
        {more ? 'Hide' : 'Add'} more details (optional)
      </button>
      {more && (
        <div className="space-y-3">
          {(
            [
              ['email', 'Email', 'email'],
              ['examTarget', 'Exam you’re preparing for', 'text'],
              ['collegeName', 'College', 'text'],
              ['parentContact', 'Parent’s mobile', 'tel'],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`d-${key}`}>{label}</Label>
              <Input id={`d-${key}`} type={type} className="h-11" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              {fieldErr(key)}
            </div>
          ))}
        </div>
      )}

      {error && !error.field && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}

      <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
        Start my free demo
      </Button>
    </form>
  );
}

function DemoStarted({ result: r, demoDays, tz }: { result: ScanResult; demoDays: number; tz: string }) {
  const checkedIn = r.outcome === 'CHECKED_IN';
  const end = r.membership?.endDate
    ? new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(r.membership.endDate))
    : null;
  return (
    <Panel
      tone="green"
      icon={CheckCircle2}
      title="Your demo has started!"
      body={checkedIn ? 'You are checked in. Enjoy your study session.' : 'Scan the QR during your shift to check in.'}
    >
      <Rows
        rows={[
          ['Library', r.library.name],
          ['Name', r.student?.name],
          ['Seat', r.student?.seatNumber ?? 'Librarian will assign'],
          ['Shift', r.shift ? `${r.shift.name} · ${formatTime(r.shift.startTime)}–${formatTime(r.shift.endTime)}` : '—'],
          ['Demo', end ? `${demoDays + 1} days, until ${end}` : `${demoDays + 1} days`],
          ...(checkedIn ? ([['Checked in', r.attendance?.checkInAt ? formatInstant(r.attendance.checkInAt, tz) : '—']] as [string, React.ReactNode][]) : []),
        ]}
      />
      <p className="text-center text-xs text-muted-foreground">Scan the QR again when you leave.</p>
    </Panel>
  );
}
