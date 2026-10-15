import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublicPlan } from '@/lib/marketing-data';
import { formatDuration, formatPrice } from '@/lib/plan-format';
import { cn } from '@/lib/utils';

export function PricingSection({
  plans,
  trialDays,
}: {
  plans: PublicPlan[];
  trialDays: number;
}) {
  if (plans.length === 0) return null;

  return (
    <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Pricing
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Simple plans for every library
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          {trialDays > 0
            ? `Start with a free ${trialDays}-day trial. Pick a plan when you're ready.`
            : 'Pick a plan and get started.'}
        </p>
      </div>

      <div
        className={cn(
          'mx-auto mt-14 grid gap-6',
          plans.length === 1 && 'max-w-sm',
          plans.length === 2 && 'max-w-3xl sm:grid-cols-2',
          plans.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3'
        )}
      >
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card p-7',
              plan.isPopular
                ? 'border-primary shadow-lg ring-1 ring-primary'
                : 'border-border/70'
            )}
          >
            {plan.isPopular && (
              <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Most popular
              </span>
            )}

            <h3 className="text-lg font-semibold">{plan.name}</h3>
            {plan.description && (
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            )}

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight tabular-nums">
                {formatPrice(plan.price, plan.currency)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {formatDuration(plan.durationDays)}
              </span>
            </div>

            {plan.features.length > 0 && (
              <ul className="mt-6 space-y-2.5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* mt-auto keeps buttons level across cards with different feature counts */}
            <div className="mt-auto pt-8">
              <Button
                asChild
                className="w-full"
                variant={plan.isPopular ? 'default' : 'outline'}
              >
                <Link href="/register">
                  {trialDays > 0 ? 'Start free trial' : 'Get started'}
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
