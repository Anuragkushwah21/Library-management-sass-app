'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/logo';
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Mail,
  Phone,
  CalendarDays,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Librarian {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

function ReviewContent() {
  const params = useSearchParams();
  const token = params.get('token');

  const [librarian, setLibrarian] = useState<Librarian | null>(null);
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No review token in the link.');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/librarians/review?token=${encodeURIComponent(token)}`
        );
        const json = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(json?.error || 'Could not load application');

        setLibrarian(json.data.librarian);
        setDecided(json.data.decided);
      } catch (err: any) {
        setLoadError(err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  const submit = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !showReject) {
      setShowReject(true);
      return;
    }

    setSubmitting(action);
    setActionError(null);

    try {
      const res = await fetch('/api/admin/librarians/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action,
          ...(action === 'reject' && reason.trim()
            ? { reason: reason.trim() }
            : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Action failed');

      setDecided(json.data.decided);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSubmitting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500" />
          <p className="font-medium">{loadError}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Review links expire after 7 days. You can still approve or reject
            from the dashboard.
          </p>
          <Button asChild className="mt-2">
            <Link href="/admin/librarians/pending">Go to Pending Approvals</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!librarian) return null;

  const detail = (icon: React.ReactNode, label: string, value?: string) =>
    value ? (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="break-words font-medium">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Librarian Application</CardTitle>
        <CardDescription>
          Review the application and approve or reject it
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold break-words">{librarian.name}</h2>
          <Badge variant="secondary" className="mt-1.5">
            Email verified
          </Badge>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          {detail(<Mail className="h-4 w-4" />, 'Email', librarian.email)}
          {detail(<Phone className="h-4 w-4" />, 'Phone', librarian.phone)}
          {detail(
            <CalendarDays className="h-4 w-4" />,
            'Registered',
            formatDateTime(librarian.createdAt)
          )}
        </div>

        <Separator />

        {decided ? (
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              decided === 'approved'
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
            }`}
          >
            {decided === 'approved' ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                {decided === 'approved'
                  ? 'Approved — the librarian can now sign in'
                  : 'Rejected'}
              </p>
              <p className="text-sm text-muted-foreground">
                An email has been sent to the librarian.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {showReject && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  rows={3}
                  placeholder="The librarian will see this reason in their email…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>
            )}

            {actionError && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {actionError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 sm:flex-1"
                onClick={() => submit('reject')}
                disabled={submitting !== null}
              >
                {submitting === 'reject' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                {showReject ? 'Confirm Reject' : 'Reject'}
              </Button>

              <Button
                className="sm:flex-1"
                onClick={() => submit('approve')}
                disabled={submitting !== null}
              >
                {submitting === 'approve' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/admin/librarians/pending"
            className="text-primary hover:underline"
          >
            View all pending applications
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ReviewPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-6 flex justify-center">
        <Logo size={56} priority />
      </div>

      {/* useSearchParams requires a Suspense boundary */}
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ReviewContent />
      </Suspense>
    </div>
  );
}
