import Link from 'next/link';
import {
  Target,
  Layers,
  Lock,
  Zap,
  Users,
  BookOpen,
  Armchair,
  Mail,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

export const metadata = {
  title: 'About — Library Management System',
  description:
    'A multi-tenant library management platform — students, seats, books and memberships in one place.',
};

const VALUES = [
  {
    icon: Target,
    title: 'Useful things first',
    description:
      'Every feature came from a real problem — seat clashes, membership renewals, overdue tracking. Nothing is here for show.',
  },
  {
    icon: Lock,
    title: 'Data stays separate',
    description:
      'Each librarian\u2019s data is fully isolated. One library can never see another library\u2019s records.',
  },
  {
    icon: Zap,
    title: 'Works without setup',
    description:
      'No servers, no installation. Sign up, and start working as soon as you are approved.',
  },
  {
    icon: Layers,
    title: 'Kept simple',
    description:
      'Daily tasks take two or three clicks. No training manual required.',
  },
];

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Students & Memberships',
    items: [
      'Membership start/end dates',
      'Payment status tracking',
      'Reminders before expiry',
      'Search and pagination',
    ],
  },
  {
    icon: Armchair,
    title: 'Seats',
    items: [
      'Per-library seat numbering',
      'Assign, change and release',
      'Double-booking impossible',
      'Seat stays with the student',
    ],
  },
  {
    icon: BookOpen,
    title: 'Books',
    items: [
      'Issue, return and renew',
      'Automatic copy counts',
      'Due date and overdue status',
      'Per-library ISBN',
    ],
  },
];

const STACK = [
  'Next.js 16',
  'React 19',
  'TypeScript',
  'MongoDB',
  'Tailwind CSS v4',
  'JWT Auth',
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ─────────────── Hero ─────────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <div className="mb-7 flex justify-center">
            <Logo size={68} priority />
          </div>

          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            About
          </p>
          <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Running a library should be simple
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Most libraries still run on registers and spreadsheets — who has
            which seat, when a membership expired, which book is with whom.
            This platform brings all of that into one place.
          </p>
        </div>
      </section>

      {/* ─────────────── Values ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What we optimise for
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {VALUES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex gap-4 rounded-xl border border-border/70 bg-card p-6 transition-colors hover:border-border"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/50">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── Capabilities ─────────────── */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              What it handles
            </h2>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, items }) => (
              <div
                key={title}
                className="rounded-xl border border-border/70 bg-card p-6"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-muted/50">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── Stack ─────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          What it is built on
        </h2>
        <p className="mt-3 text-muted-foreground">
          Modern, well-supported tools — so it stays easy to maintain.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-border/70 bg-card px-4 py-1.5 text-sm font-medium"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* ─────────────── CTA ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border/70 bg-card px-6 py-14 text-center sm:px-12">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Have a question?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-muted-foreground">
            Features, pricing or something technical — just ask.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-11 px-7">
              <Link href="/register">
                Get started
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-7">
              <Link href="/contact">
                <Mail className="mr-2 h-4 w-4" />
                Contact us
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
