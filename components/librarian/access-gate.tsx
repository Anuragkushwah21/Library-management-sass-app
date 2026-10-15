'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  Clock,
  Loader2,
  LogOut,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Logo } from '@/components/logo';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { daysLeft, formatDuration, formatPrice } from '@/lib/plan-format';

export type AccessStatus =
  | 'trial'
  | 'pending'
  | 'active'
  | 'trial_expired'
  | 'rejected'
  | 'plan_expired';

export interface PlanOption {
  _id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  isPopular?: boolean;
}

export interface AccessState {
  access: {
    status: AccessStatus;
    hasAccess: boolean;
    trialEndsAt: string;
    planExpiresAt: string | null;
    approvalRequestedAt: string | null;
    rejectionReason: string | null;
  };
  user: { name?: string; email?: string };
  requestedPlan: { _id: string; name: string } | null;
  plans: PlanOption[];
}

/* ───────────── Request form (used by the lock screen and the trial dialog) ───────────── */

function RequestApprovalForm({
  plans,
  onSent,
}: {
  plans: PlanOption[];
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [planId, setPlanId] = useState<string | null>(
    plans.find((p) => p.isPopular)?._id ?? plans[0]?._id ?? null
  );
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await api.requestApproval({
        planId,
        note: note.trim() || undefined,
      });
      toast({
        title: 'Request sent',
        description: res?.message || 'The admin will review your request shortly.',
      });
      onSent();
    } catch (err: any) {
      toast({
        title: 'Could not send request',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {plans.length > 0 && (
        <div className="space-y-2">
          <Label>Choose a plan</Label>
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => {
              const selected = plan._id === planId;
              return (
                <button
                  key={plan._id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPlanId(plan._id)}
                  className={cn(
                    'relative rounded-lg border p-4 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  {plan.isPopular && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      Popular
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{plan.name}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {formatPrice(plan.price, plan.currency)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}/ {formatDuration(plan.durationDays)}
                    </span>
                  </div>
                  {plan.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="approval-note">Message to the admin (optional)</Label>
        <Textarea
          id="approval-note"
          rows={3}
          maxLength={500}
          placeholder="e.g. library name, city, how many students you have…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button onClick={send} disabled={sending} className="w-full" size="lg">
        {sending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Send request to Super Admin
      </Button>
    </div>
  );
}

/* ───────────── Full-page lock screen ───────────── */

const LOCK_COPY: Record<
  Exclude<AccessStatus, 'trial' | 'active'>,
  { title: string; body: string }
> = {
  trial_expired: {
    title: 'Your free trial has ended',
    body: 'Hope you enjoyed exploring the product! Pick a plan and send a request — once the Super Admin approves your profile, your dashboard unlocks with all your data intact.',
  },
  plan_expired: {
    title: 'Your plan has expired',
    body: 'Send a renewal request to the Super Admin to keep using your dashboard. All your data is safe.',
  },
  rejected: {
    title: 'Your request was not approved',
    body: 'You can update your details and send a new request.',
  },
  pending: {
    title: 'Request sent — waiting for approval',
    body: 'The Super Admin has your request. You will get an email as soon as it is reviewed.',
  },
};

export function LockedScreen({
  state,
  onRefresh,
  onLogout,
}: {
  state: AccessState;
  onRefresh: () => Promise<void> | void;
  onLogout: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const status = state.access.status as keyof typeof LOCK_COPY;
  const copy = LOCK_COPY[status] ?? LOCK_COPY.trial_expired;
  const isPending = status === 'pending';

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const Icon = isPending ? Clock : status === 'rejected' ? XCircle : ShieldAlert;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <Logo size={36} priority />
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>

        <div className="mt-8 flex items-start gap-4">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              isPending
                ? 'bg-amber-500/10 text-amber-600'
                : status === 'rejected'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-primary/10 text-primary'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {copy.title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {copy.body}
            </p>
          </div>
        </div>

        {status === 'rejected' && state.access.rejectionReason && (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium">Reason: </span>
            {state.access.rejectionReason}
          </div>
        )}

        <div className="mt-6 border-t pt-6">
          {isPending ? (
            <div className="space-y-4 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                {state.access.approvalRequestedAt && (
                  <div>
                    <dt className="text-muted-foreground">Requested on</dt>
                    <dd className="font-medium">
                      {format(new Date(state.access.approvalRequestedAt), 'd MMM yyyy, h:mm a')}
                    </dd>
                  </div>
                )}
                {state.requestedPlan && (
                  <div>
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="font-medium">{state.requestedPlan.name}</dd>
                  </div>
                )}
              </dl>
              <Button variant="outline" onClick={refresh} disabled={refreshing}>
                <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
                Check status
              </Button>
            </div>
          ) : (
            <RequestApprovalForm plans={state.plans} onSent={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Banner shown on top of the dashboard during the trial ───────────── */

export function TrialBanner({
  state,
  onChanged,
}: {
  state: AccessState;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { status, trialEndsAt, approvalRequestedAt } = state.access;

  if (status !== 'trial' && status !== 'pending') return null;

  const left = daysLeft(trialEndsAt);
  const leftLabel =
    left <= 1 ? 'Your free trial ends today' : `${left} days left in your free trial`;

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-sm md:px-6',
          status === 'pending'
            ? 'bg-amber-500/10 text-amber-900 dark:text-amber-200'
            : 'bg-primary/10'
        )}
      >
        <Clock className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {status === 'pending' ? (
            <>
              Approval request sent
              {approvalRequestedAt &&
                ` on ${format(new Date(approvalRequestedAt), 'd MMM')}`}
              . You can keep using the trial until{' '}
              <strong>{format(new Date(trialEndsAt), 'd MMM, h:mm a')}</strong>.
            </>
          ) : (
            <>
              <strong>{leftLabel}.</strong> Request approval any time to keep
              access after the trial.
            </>
          )}
        </span>
        {status === 'trial' && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Request approval
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Request approval</DialogTitle>
            <DialogDescription>
              Your request goes to the Super Admin. Your trial keeps running
              while it is reviewed.
            </DialogDescription>
          </DialogHeader>
          <RequestApprovalForm
            plans={state.plans}
            onSent={() => {
              setOpen(false);
              onChanged();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
