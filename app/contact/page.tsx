// app/contact/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Mail,
  User,
  MessageCircle,
  Loader2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

const HIGHLIGHTS = [
  {
    icon: Clock,
    title: 'Quick replies',
    description: 'Usually within 24 hours on working days.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data is safe',
    description: 'Messages go only to the admin and are never shared.',
  },
  {
    icon: MessageCircle,
    title: 'Ask anything',
    description: 'Features, pricing, bugs — all welcome here.',
  },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.message) {
      toast.error('Please fill all required fields.');
      return;
    }

    // Backend min 10 chars maangta hai — yahin bata do, 400 khaane se pehle
    if (form.message.trim().length < 10) {
      toast.error('Message must be at least 10 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await fetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify(form),
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message.');
      }

      toast.success('Message sent. We will get back to you soon.');
      setForm({ name: '', email: '', subject: '', message: '' });
      setSent(true);
    } catch (error: any) {
      toast.error(error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ─────────────── Hero ─────────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Contact
          </p>
          <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Let’s talk
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            A question, a suggestion or a problem — fill in the form and we’ll
            get back to you soon.
          </p>
        </div>
      </section>

      {/* ─────────────── Form + info ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Form */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border/70 bg-card p-6 sm:p-8">
              {sent ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Message sent</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      We’ll reply to your email shortly.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSent(false)}
                    className="mt-2"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold">Send us a message</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Fields marked with * are required.
                  </p>

                  <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          Name <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="name"
                            name="name"
                            placeholder="Your full name"
                            value={form.name}
                            onChange={handleChange}
                            className="pl-9"
                            autoComplete="name"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={handleChange}
                            className="pl-9"
                            autoComplete="email"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        name="subject"
                        placeholder="How can we help?"
                        value={form.subject}
                        onChange={handleChange}
                        maxLength={200}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">
                        Message <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Write your question or problem here…"
                        rows={6}
                        value={form.message}
                        onChange={handleChange}
                        maxLength={5000}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {form.message.length}/5000
                      </p>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      disabled={isSubmitting}
                      className="group w-full sm:w-auto"
                    >
                      {isSubmitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {isSubmitting ? 'Sending…' : 'Send message'}
                      {!isSubmitting && (
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* Side info */}
          <div className="space-y-5 lg:col-span-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-border/70 bg-card p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/50">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border/70 bg-muted/30 p-5">
              <h3 className="text-sm font-semibold">Already have an account?</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                If you’re a librarian, you can also message the admin directly
                from your dashboard.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
