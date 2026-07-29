'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Megaphone, Send, Users, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Audience = 'all' | 'paid' | 'unpaid' | 'pending';

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'All students',
  paid: 'Paid members only',
  unpaid: 'Unpaid members only',
  pending: 'Pending payment only',
};

export default function OffersPage() {
  const { toast } = useToast();

  const [form, setForm] = useState({
    headline: '',
    badge: '',
    subject: '',
    message: '',
    validTill: '',
    ctaLabel: '',
    ctaUrl: '',
  });

  const [audience, setAudience] = useState<Audience>('all');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    failedCount: number;
    failed: Array<{ email: string; error: string }>;
  } | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Refresh the recipient count when the audience changes (dryRun sends nothing)
  useEffect(() => {
    let cancelled = false;

    const countRecipients = async () => {
      setIsCounting(true);
      try {
        const res = await fetch('/api/students/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            dryRun: true,
            // The schema still has to be satisfied on a dry run
            headline: 'preview',
            subject: 'preview',
            message: 'preview message body',
            ...(audience !== 'all' ? { paymentStatus: audience } : {}),
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        setRecipientCount(res.ok ? json?.data?.recipientCount ?? 0 : 0);
      } catch {
        if (!cancelled) setRecipientCount(null);
      } finally {
        if (!cancelled) setIsCounting(false);
      }
    };

    countRecipients();
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const handleSend = async () => {
    if (!form.headline.trim() || !form.subject.trim() || !form.message.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Headline, subject and message are required.',
        variant: 'destructive',
      });
      return;
    }

    if (form.message.trim().length < 10) {
      toast({
        title: 'Message too short',
        description: 'Message must be at least 10 characters long.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = window.confirm(
      `Send this offer to ${recipientCount ?? 'all matching'} student${
        recipientCount === 1 ? '' : 's'
      }? Emails cannot be recalled.`
    );
    if (!confirmed) return;

    setIsSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/students/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          headline: form.headline.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
          badge: form.badge.trim() || undefined,
          validTill: form.validTill.trim() || undefined,
          ctaLabel: form.ctaLabel.trim() || undefined,
          ctaUrl: form.ctaUrl.trim() || undefined,
          ...(audience !== 'all' ? { paymentStatus: audience } : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || 'Broadcast failed');
      }

      setResult(json.data);
      toast({
        title: 'Offer sent',
        description: json.message,
      });
    } catch (error: any) {
      toast({
        title: 'Send failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Send Offer</h1>
          <p className="text-muted-foreground">
            Email your students an offer or announcement
          </p>
        </div>

        <Badge variant="secondary" className="gap-1.5 py-1.5">
          <Users className="h-3.5 w-3.5" />
          {isCounting
            ? 'Counting…'
            : recipientCount === null
            ? '—'
            : `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Compose ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              Compose
            </CardTitle>
            <CardDescription>
              Write the banner content and message here
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="audience">Send to</Label>
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as Audience)}
                disabled={isSending}
              >
                <SelectTrigger id="audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {AUDIENCE_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">
                Email Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                placeholder="Diwali Special — 30% off on membership"
                value={form.subject}
                onChange={(e) => set('subject')(e.target.value)}
                disabled={isSending}
                maxLength={150}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="headline">
                  Banner Headline <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="headline"
                  placeholder="Diwali Special"
                  value={form.headline}
                  onChange={(e) => set('headline')(e.target.value)}
                  disabled={isSending}
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="badge">Badge</Label>
                <Input
                  id="badge"
                  placeholder="30% OFF"
                  value={form.badge}
                  onChange={(e) => set('badge')(e.target.value)}
                  disabled={isSending}
                  maxLength={24}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="message"
                rows={6}
                placeholder="Get 30% off when you renew your membership this festive season…"
                value={form.message}
                onChange={(e) => set('message')(e.target.value)}
                disabled={isSending}
                maxLength={3000}
              />
              <p className="text-xs text-muted-foreground">
                {form.message.length}/3000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="validTill">Valid Till</Label>
              <Input
                id="validTill"
                placeholder="31 Aug 2026"
                value={form.validTill}
                onChange={(e) => set('validTill')(e.target.value)}
                disabled={isSending}
                maxLength={40}
              />
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ctaLabel">Button Text</Label>
                <Input
                  id="ctaLabel"
                  placeholder="Renew Now"
                  value={form.ctaLabel}
                  onChange={(e) => set('ctaLabel')(e.target.value)}
                  disabled={isSending}
                  maxLength={40}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaUrl">Button Link</Label>
                <Input
                  id="ctaUrl"
                  type="url"
                  placeholder="https://…"
                  value={form.ctaUrl}
                  onChange={(e) => set('ctaUrl')(e.target.value)}
                  disabled={isSending}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The button only appears when both the text and link are filled in.
            </p>
          </CardContent>
        </Card>

        {/* ---------- Preview ---------- */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription>
                This is how the email will look
              </CardDescription>
            </CardHeader>

            <CardContent className="px-3 sm:px-6">
              {/* Colours here are hardcoded on purpose (no dark: variants).
                  This previews an email — in the recipient's mail client it
                  opens on white regardless of the app's theme. */}
              <div className="overflow-hidden rounded-xl border bg-white">
                {/* Banner */}
                <div className="bg-gradient-to-br from-purple-500 to-blue-600 px-5 py-9 text-center">
                  {form.badge.trim() && (
                    <span className="mb-3 inline-block rounded-full bg-white/25 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                      {form.badge}
                    </span>
                  )}
                  <h2 className="text-2xl font-extrabold leading-tight text-white break-words">
                    {form.headline.trim() || 'Your headline here'}
                  </h2>
                  {form.validTill.trim() && (
                    <p className="mt-3 text-sm text-white/90">
                      Valid till {form.validTill}
                    </p>
                  )}
                </div>

                {/* Body */}
                <div className="px-5 py-6">
                  <p className="mb-3 text-[15px] text-gray-900">
                    Hi <span className="font-medium">Student</span>,
                  </p>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700 break-words">
                    {form.message.trim() ||
                      'Your message will appear here. Add the offer details, terms and anything else.'}
                  </p>

                  {form.ctaLabel.trim() && form.ctaUrl.trim() && (
                    <div className="mt-6 text-center">
                      <span className="inline-block rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 px-7 py-3 text-[15px] font-semibold text-white">
                        {form.ctaLabel}
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t bg-gray-50 px-5 py-3 text-center">
                  <p className="text-[11px] text-gray-500">
                    You are receiving this because you are a member of this library.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Send */}
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Button
                onClick={handleSend}
                disabled={isSending || recipientCount === 0}
                className="w-full"
                size="lg"
              >
                {isSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSending
                  ? 'Sending…'
                  : `Send to ${recipientCount ?? 0} student${
                      recipientCount === 1 ? '' : 's'
                    }`}
              </Button>

              {recipientCount === 0 && !isCounting && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  No students match this filter.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Emails cannot be recalled once sent. It’s worth sending yourself
                a test first.
              </p>
            </CardContent>
          </Card>

          {/* Result */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-600 hover:bg-green-600">
                    {result.sentCount} sent
                  </Badge>
                  {result.failedCount > 0 && (
                    <Badge variant="destructive">
                      {result.failedCount} failed
                    </Badge>
                  )}
                </div>

                {result.failed?.length > 0 && (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-3">
                    {result.failed.map((f) => (
                      <div key={f.email} className="text-xs">
                        <span className="font-medium break-all">{f.email}</span>
                        <span className="text-muted-foreground"> — {f.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
