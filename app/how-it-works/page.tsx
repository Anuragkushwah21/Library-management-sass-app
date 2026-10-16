import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowRight,
  Armchair,
  BellRing,
  BookOpen,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock,
  CreditCard,
  LogIn,
  LogOut,
  MapPin,
  NotebookPen,
  Printer,
  QrCode,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { getHomeData } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'How it works — Library Management System',
  description:
    'What problems the app solves and how librarians and students use it: setup, QR check-in, attendance, seats and memberships.',
};

// Trial length is set by the admin
export const dynamic = 'force-dynamic';

const PROBLEMS = [
  {
    before: 'Attendance in a register — students sign for friends, and nobody checks the time.',
    after: 'Students scan the library QR with their own verified phone. Time and late arrivals are recorded automatically.',
    icon: ClipboardCheck,
  },
  {
    before: 'Two students fight over the same seat because it was promised twice.',
    after: 'A seat map shows who has which seat. The app refuses to give a taken seat to anyone else.',
    icon: Armchair,
  },
  {
    before: 'Memberships expire and nobody notices until weeks later.',
    after: 'Days left are shown everywhere, expired students can’t check in, and reminders go out with one click.',
    icon: CalendarClock,
  },
  {
    before: '“Who is inside right now?” means walking around the hall.',
    after: 'The Attendance page lists everyone inside right now, who came late, and who hasn’t come yet.',
    icon: Users,
  },
  {
    before: 'Student details scattered across notebooks and WhatsApp chats.',
    after: 'One list of students with phone, seat, shift, membership and payment status — searchable in seconds.',
    icon: NotebookPen,
  },
];

const SETUP = [
  {
    icon: UserPlus,
    title: 'Create your account',
    body: 'Register as a librarian and verify your email with the OTP we send. You land straight on your dashboard.',
    where: 'Register',
  },
  {
    icon: Settings2,
    title: 'Fill in your library details',
    body: 'Library name, contact phone (shown to students), and when a student counts as late — 15 minutes after shift start by default.',
    where: 'Settings → Library & check-in',
  },
  {
    icon: Clock,
    title: 'Add your shifts',
    body: 'Morning, Evening, Night or your own timings. A “Full Day” shift is created for you. Night shifts that end after midnight work too.',
    where: 'Shifts',
  },
  {
    icon: Armchair,
    title: 'Add your seats',
    body: 'Add all seats at once — for example seat 1 to 50. You can name notes like “near window” later.',
    where: 'Seats → Add seats',
  },
  {
    icon: Users,
    title: 'Add your students',
    body: 'Name, email, mobile number, shift, membership dates and seat. Each mobile number and email can be registered only once.',
    where: 'Add Student',
  },
  {
    icon: Printer,
    title: 'Optional: QR self check-in',
    body: 'QR attendance is a paid add-on enabled by the platform admin. Once it’s on, print the ready-made poster and stick it where students enter. Without it, mark attendance by hand.',
    where: 'QR Attendance → Request QR service',
  },
];

const DAILY = [
  {
    icon: ClipboardCheck,
    title: 'Watch attendance live',
    body: 'Inside now, Present, Late (“Late by 1 hour 30 min”), Left early and Not checked in — for today or any past date.',
    where: 'Attendance',
  },
  {
    icon: LogIn,
    title: 'Fix things by hand',
    body: 'Phone battery dead? Check a student in or out manually, mark late as present, or add a note. Every change is recorded.',
    where: 'Attendance → ⋯',
  },
  {
    icon: Armchair,
    title: 'Manage seats',
    body: 'Tap a seat to assign, move or free it. Red seats mean the student is inside right now; grey means their membership ended.',
    where: 'Seats',
  },
  {
    icon: BellRing,
    title: 'Stay on top of renewals',
    body: 'See every member’s expiry, seat and shift. Send reminder emails to members whose membership ends soon.',
    where: 'Memberships',
  },
  {
    icon: BookOpen,
    title: 'Issue and return books',
    body: 'Issue a book with a due date, renew it, or mark it returned. Copies update by themselves.',
    where: 'Books Issue',
  },
];

const STUDENT_STEPS = [
  {
    icon: QrCode,
    title: 'Scan the QR at the entrance',
    body: 'Use the normal phone camera. No app to install.',
  },
  {
    icon: Smartphone,
    title: 'Verify your mobile number',
    body: 'Enter the number the library has for you and type the 6-digit code. Only the first time on that phone.',
  },
  {
    icon: LogIn,
    title: 'You’re checked in',
    body: 'The screen shows your seat, shift, check-in time, Present or Late, and how many membership days are left.',
  },
  {
    icon: LogOut,
    title: 'Scan again when you leave',
    body: 'You’re checked out and see your study time for the day.',
  },
];

const RULES = [
  { label: 'Present', text: 'Checked in before shift start + grace time (15 min by default).', tone: 'emerald' },
  { label: 'Late', text: 'Checked in after the grace time. Shown as “Late by 25 min” or “Late by 1 hour 30 min”.', tone: 'amber' },
  { label: 'Left early', text: 'Checked out before the shift ended.', tone: 'zinc' },
  { label: 'Auto check-out', text: 'Forgot to scan out? You’re checked out automatically 30 minutes after the shift ends; study time counts up to the shift end.', tone: 'sky' },
  { label: 'Not checked in', text: 'An active student who hasn’t scanned yet — “Absent” once the shift is over.', tone: 'rose' },
] as const;

const TONE: Record<(typeof RULES)[number]['tone'], string> = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  zinc: 'border-border bg-muted text-foreground',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const SEATS = [
  { label: 'Available', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100', who: 'Free' },
  { label: 'Assigned', cls: 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100', who: 'Asha' },
  { label: 'Inside now', cls: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100', who: 'Ravi' },
  { label: 'Expired — free it', cls: 'border-dashed border-zinc-400 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400', who: 'Neha' },
];

const FAQ = [
  {
    q: 'Do students need to install an app?',
    a: 'No. They scan the QR with the phone camera and everything opens in the browser.',
  },
  {
    q: 'Can a student check in for a friend?',
    a: 'Each phone has to verify the student’s own mobile number with an OTP. Turn on “Location check on scan” in Settings and students also have to be inside the library to check in.',
  },
  {
    q: 'Someone shared a photo of our QR. What now?',
    a: 'Open QR Attendance and press “Regenerate QR code”. The old QR stops working immediately; print the new poster.',
  },
  {
    q: 'A student’s phone is dead or they forgot it.',
    a: 'Check them in or out yourself from the Attendance page. It’s marked as a manual entry.',
  },
  {
    q: 'What happens when a membership ends?',
    a: 'The student sees “Membership expired on <date>” when they scan, and no attendance is recorded. Their old attendance stays. Renew them by updating the end date, and free their seat with “Free expired seats”.',
  },
  {
    q: 'A student got a new mobile number.',
    a: 'Edit the student and change the number. They verify the new number the next time they scan.',
  },
  {
    q: 'We have a night shift that ends after midnight.',
    a: 'Create it with an end time earlier than the start (for example 22:00 to 06:00). Attendance counts it for the night it started.',
  },
  {
    q: 'Can other libraries see my students?',
    a: 'No. Every library’s data is completely separate. Even the same mobile number in two libraries is two separate students.',
  },
];

function SectionTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{kicker}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-pretty text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Where({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-3 inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <MapPin className="h-3 w-3" />
      {children}
    </span>
  );
}

export default async function HowItWorksPage() {
  const { trialDays } = await getHomeData();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ─────────────── Hero ─────────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
          <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Your library, run from one screen
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            What the app solves, how to set it up in about 15 minutes, and what librarians and students do every day.
          </p>
          <nav aria-label="On this page" className="mt-8 flex flex-wrap justify-center gap-2 text-sm">
            {[
              ['#problems', 'Problems it solves'],
              ['#setup', 'Set up your library'],
              ['#daily', 'Daily use'],
              ['#students', 'For students'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full border border-border/70 bg-card px-3.5 py-1.5 font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* ─────────────── Problems → solutions ─────────────── */}
      <section id="problems" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle kicker="Why" title="The problems it solves" sub="Everyday headaches of running a study library — and what changes." />
        <div className="mt-12 space-y-4">
          {PROBLEMS.map(({ before, after, icon: Icon }) => (
            <div key={before} className="grid gap-3 rounded-2xl border border-border/70 bg-card p-5 sm:grid-cols-[auto_1fr_1fr] sm:items-start sm:gap-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-muted/50">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span>
                  <span className="font-semibold text-foreground">Before: </span>
                  {before}
                </span>
              </p>
              <p className="flex gap-2 text-sm leading-relaxed">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <span className="font-semibold">With the app: </span>
                  {after}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── Setup ─────────────── */}
      <section id="setup" className="scroll-mt-20 border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle
            kicker="For librarians"
            title="Set up your library in 6 steps"
            sub={
              trialDays > 0
                ? `Everything works free for ${trialDays} days — no approval needed to start.`
                : 'Takes about 15 minutes.'
            }
          />
          <ol className="mt-12 space-y-4">
            {SETUP.map(({ icon: Icon, title, body, where }, i) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-border/70 bg-card p-5">
                <div className="flex shrink-0 flex-col items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Icon className="h-4 w-4 text-primary" />
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  <Where>{where}</Where>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="leading-relaxed">
              <span className="font-semibold">After the free trial:</span> a banner on your dashboard lets you pick a
              plan and send a request to the platform admin. Once approved, everything continues — your students,
              seats and history stay exactly as they were.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────── Daily ─────────────── */}
      <section id="daily" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle kicker="Every day" title="What you do day to day" sub="Each item shows where to find it in the dashboard menu." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DAILY.map(({ icon: Icon, title, body, where }) => (
            <div key={title} className="flex flex-col rounded-2xl border border-border/70 bg-card p-6">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-muted/50">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <div>
                <Where>{where}</Where>
              </div>
            </div>
          ))}
        </div>

        {/* Seat colours */}
        <div className="mt-10 rounded-2xl border border-border/70 bg-card p-6">
          <h3 className="font-semibold">Reading the seat map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Each square is a seat. The colour tells you its state at a glance.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SEATS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border-2', s.cls)}>
                  <span className="text-lg font-bold leading-none">{i + 7}</span>
                  <span className="mt-0.5 text-[10px]">{s.who}</span>
                </div>
                <span className="text-sm font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── Students ─────────────── */}
      <section id="students" className="scroll-mt-20 border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionTitle kicker="For students" title="Check in with one scan" sub="Share this part with your students." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STUDENT_STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="relative rounded-2xl border border-border/70 bg-card p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</span>
                <Icon className="mt-3 h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-14 text-center text-lg font-semibold">How attendance is marked</h3>
          <div className="mx-auto mt-5 grid max-w-3xl gap-3">
            {RULES.map((r) => (
              <div key={r.label} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
                <span className={cn('w-fit shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold sm:w-32 sm:text-center', TONE[r.tone])}>
                  {r.label}
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">{r.text}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-5 flex max-w-3xl gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            Scanning twice within 2 minutes doesn’t check you out — it’s treated as a double tap. Students can scan in up
            to an hour before their shift starts.
          </p>
        </div>
      </section>

      {/* ─────────────── FAQ ─────────────── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle kicker="FAQ" title="Common questions" />
        <div className="mt-10 divide-y divide-border/70 rounded-2xl border border-border/70 bg-card">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="shrink-0 text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Still stuck?{' '}
          <Link href="/contact" className="font-medium text-primary hover:underline">
            Contact us
          </Link>
        </p>
      </section>

      {/* ─────────────── CTA ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border/70 bg-card px-6 py-14 text-center sm:px-12">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight">Ready to try it?</h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            {trialDays > 0
              ? `Create an account and use every feature free for ${trialDays} days.`
              : 'Create an account and set up your library today.'}
          </p>
          <Button asChild size="lg" className="group mt-7 h-11 px-8">
            <Link href="/register">
              {trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Get started'}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
