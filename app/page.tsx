import Link from 'next/link';
import {
  BookOpen,
  Users,
  Armchair,
  BarChart3,
  Megaphone,
  ShieldCheck,
  ArrowRight,
  Check,
  UserPlus,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { AdSpace } from '@/components/marketing/ad-space';
import { PricingSection } from '@/components/marketing/pricing-section';
import { getHomeData } from '@/lib/marketing-data';

// Plans, ads and trial length are edited by the admin — render per request
export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: Users,
    title: 'Student Management',
    description:
      'Add members, track membership dates, and manage payment status from one place.',
  },
  {
    icon: Armchair,
    title: 'Seat Allocation',
    description:
      'Assign and release seats. A seat can never be given to two students at once.',
  },
  {
    icon: BookOpen,
    title: 'Issue & Return',
    description:
      'Issue books, set due dates, and renew them — copy counts update automatically.',
  },
  {
    icon: BarChart3,
    title: 'Live Dashboard',
    description:
      'A real-time view of students, paid members, available seats and issued books.',
  },
  {
    icon: Megaphone,
    title: 'Bulk Offers',
    description:
      'Email your students an offer or announcement — with a banner, in one click.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant & Secure',
    description:
      'Every librarian\u2019s data is fully separate. JWT auth, OTP verification, admin-approved accounts.',
  },
];

const getSteps = (trialDays: number) => [
  {
    icon: UserPlus,
    title: 'Create an account',
    description:
      trialDays > 0
        ? `Sign up, verify your email with an OTP, and explore everything free for ${trialDays} days.`
        : 'Sign up and verify your email with an OTP.',
  },
  {
    icon: Settings2,
    title: 'Set up your library',
    description:
      'Add your students, books and seats. Everything lives in one dashboard.',
  },
  {
    icon: Sparkles,
    title: 'Pick a plan',
    description:
      'Like it? Send an approval request with your plan from the dashboard — your data stays as it is.',
  },
];

const STATS = [
  { value: '100%', label: 'Tenant isolation' },
  { value: '<1s', label: 'Dashboard load' },
  { value: '24/7', label: 'Cloud hosted' },
  { value: '0', label: 'Setup cost' },
];

export default async function LandingPage() {
  const { plans, ads, trialDays } = await getHomeData();
  const STEPS = getSteps(trialDays);
  const trialLabel = trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Get started';

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ─────────────── Hero ─────────────── */}
      <section className="relative overflow-hidden">
        {/* Subtle grid — modern SaaS ka signature, gradient blobs se kam loud */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]"
        />

        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
          <div className="mb-8 flex justify-center">
            <Logo size={76} priority />
          </div>

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Multi-tenant library platform
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Run your library
            <br className="hidden sm:block" />{' '}
            <span className="text-muted-foreground">without the paperwork.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Students, seats, books and memberships — all from one dashboard.
            Every librarian gets their own isolated space, with no setup.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-11 px-7">
              <Link href="/register">
                {trialLabel}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-7">
              <Link href="#features">See features</Link>
            </Button>
          </div>

          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              trialDays > 0 ? `${trialDays} days free` : 'Quick setup',
              'No credit card required',
              'Your data stays yours',
            ].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  {item}
                </span>
              )
            )}
          </p>
        </div>
      </section>

      {/* ─────────────── Stats ─────────────── */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold tracking-tight tabular-nums">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── Ad space (admin-managed) ─────────────── */}
      <AdSpace ads={ads} />

      {/* ─────────────── Features ─────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need, built in
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Built for everyday library operations — nothing more, nothing less.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group relative rounded-xl border border-border/70 bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-muted/50 transition-colors group-hover:bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── How it works ─────────────── */}
      <section id="how-it-works" className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in three steps
            </h2>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, description }, i) => (
              <div key={title} className="relative">
                {/* Connector — sirf desktop par */}
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute left-[calc(50%+2.5rem)] right-[calc(-50%+2.5rem)] top-6 hidden h-px bg-border md:block"
                  />
                )}

                <div className="relative flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold">{title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── Pricing (admin-managed) ─────────────── */}
      <PricingSection plans={plans} trialDays={trialDays} />

      {/* ─────────────── CTA ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-6 py-16 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_40%,transparent_100%)]"
          />

          <div className="relative">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Take your library digital today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
              {trialDays > 0
                ? `Create an account and use every feature free for ${trialDays} days — no approval needed to start.`
                : 'Create an account and start managing your library.'}
            </p>
            <Button asChild size="lg" className="group mt-8 h-11 px-8">
              <Link href="/register">
                {trialLabel}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
