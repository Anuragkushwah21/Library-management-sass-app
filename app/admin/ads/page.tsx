'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { minForExisting, todayInput } from '@/lib/date-rules';
import { AdCard } from '@/components/marketing/ad-space';
import { adHasAction } from '@/lib/validation-admin';

interface Ad {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  advertiserName?: string;
  badgeText?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isActive: boolean;
  sortOrder: number;
  startsAt?: string | null;
  endsAt?: string | null;
}

interface AdForm {
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  ctaLabel: string;
  advertiserName: string;
  badgeText: string;
  phone: string;
  whatsapp: string;
  email: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

const EMPTY_FORM: AdForm = {
  title: '',
  description: '',
  imageUrl: '',
  linkUrl: '',
  ctaLabel: '',
  advertiserName: '',
  badgeText: '',
  phone: '',
  whatsapp: '',
  email: '',
  sortOrder: '0',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

const CTA_PRESETS = ['Buy now', 'Shop now', 'Book now', 'Get offer', 'Enroll now', 'Learn more'];

// Copy the ad's text fields into the shape AdCard renders
type CardFields = Partial<
  Pick<
    AdForm,
    | 'title'
    | 'description'
    | 'imageUrl'
    | 'linkUrl'
    | 'ctaLabel'
    | 'advertiserName'
    | 'badgeText'
    | 'phone'
    | 'whatsapp'
    | 'email'
  >
>;
const toCardData = (a: CardFields) => ({
  title: a.title ?? '',
  description: a.description ?? '',
  imageUrl: a.imageUrl ?? '',
  linkUrl: a.linkUrl ?? '',
  ctaLabel: a.ctaLabel ?? '',
  advertiserName: a.advertiserName ?? '',
  badgeText: a.badgeText ?? '',
  phone: a.phone ?? '',
  whatsapp: a.whatsapp ?? '',
  email: a.email ?? '',
});

// <input type="date"> wants yyyy-MM-dd
const toDateInput = (d?: string | null) => (d ? format(new Date(d), 'yyyy-MM-dd') : '');

function scheduleState(ad: Ad): 'live' | 'scheduled' | 'ended' | 'off' {
  if (!ad.isActive) return 'off';
  const now = new Date();
  if (ad.startsAt && new Date(ad.startsAt) > now) return 'scheduled';
  if (ad.endsAt && new Date(ad.endsAt) < now) return 'ended';
  return 'live';
}

const STATE_BADGE = {
  live: <Badge className="bg-emerald-600">Live</Badge>,
  scheduled: <Badge variant="secondary">Scheduled</Badge>,
  ended: <Badge variant="outline">Ended</Badge>,
  off: <Badge variant="outline">Off</Badge>,
};

export default function AdminAdsPage() {
  const { toast } = useToast();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Ad | 'new' | null>(null);
  const [form, setForm] = useState<AdForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<Ad | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await api.getAdminAds();
      setAds(res.data || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const openEdit = (ad: Ad) => {
    setForm({
      title: ad.title,
      description: ad.description ?? '',
      imageUrl: ad.imageUrl ?? '',
      linkUrl: ad.linkUrl ?? '',
      ctaLabel: ad.ctaLabel ?? '',
      advertiserName: ad.advertiserName ?? '',
      badgeText: ad.badgeText ?? '',
      phone: ad.phone ?? '',
      whatsapp: ad.whatsapp ?? '',
      email: ad.email ?? '',
      sortOrder: String(ad.sortOrder ?? 0),
      startsAt: toDateInput(ad.startsAt),
      endsAt: toDateInput(ad.endsAt),
      isActive: ad.isActive,
    });
    setEditing(ad);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.uploadAdImage(file);
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!form.linkUrl.trim() && !form.phone.trim() && !form.whatsapp.trim() && !form.email.trim()) {
      toast({
        title: 'Add at least one way to respond',
        description: 'Fill in a website link, phone, WhatsApp or email so visitors get a button.',
        variant: 'destructive',
      });
      return;
    }
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) {
      toast({ title: 'End date is before start date', variant: 'destructive' });
      return;
    }

    // New dates can't be in the past; a saved date left untouched is fine
    const saved = editing && editing !== 'new' ? editing : null;
    const today = todayInput();
    if (form.startsAt && form.startsAt < today && form.startsAt !== toDateInput(saved?.startsAt)) {
      toast({ title: 'Start date cannot be in the past', variant: 'destructive' });
      return;
    }
    if (form.endsAt && form.endsAt < today && form.endsAt !== toDateInput(saved?.endsAt)) {
      toast({ title: 'End date cannot be in the past', variant: 'destructive' });
      return;
    }

    const data = {
      title: form.title.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl.trim(),
      linkUrl: form.linkUrl.trim(),
      ctaLabel: form.ctaLabel.trim(),
      advertiserName: form.advertiserName.trim(),
      badgeText: form.badgeText.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
      startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
      // End date is inclusive — keep the ad up until the end of that day
      endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
    };

    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createAd(data);
        toast({ title: 'Ad created' });
      } else if (editing) {
        await api.updateAd(editing._id, data);
        toast({ title: 'Ad updated' });
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Ad, isActive: boolean) => {
    setAds((prev) => prev.map((a) => (a._id === ad._id ? { ...a, isActive } : a)));
    try {
      await api.updateAd(ad._id, { isActive });
    } catch (err: any) {
      setAds((prev) => prev.map((a) => (a._id === ad._id ? { ...a, isActive: !isActive } : a)));
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteAd(deleting._id);
      setAds((prev) => prev.filter((a) => a._id !== deleting._id));
      toast({ title: 'Ad deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Advertisements</CardTitle>
            <CardDescription className="mt-1.5">
              Live ads show in the ad space on the home page, in display order.
            </CardDescription>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            New ad
          </Button>
        </CardHeader>
        <CardContent>
          {ads.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              No ads yet. The home page ad space stays hidden until one is live.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ads.map((ad) => (
                <div key={ad._id} className="flex flex-col gap-3">
                  <div className={ad.isActive ? '' : 'opacity-60'}>
                    <AdCard ad={toCardData(ad)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
                    {STATE_BADGE[scheduleState(ad)]}
                    {!adHasAction(ad) && (
                      <button
                        type="button"
                        onClick={() => openEdit(ad)}
                        className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-400"
                      >
                        No buttons — add link or contact
                      </button>
                    )}
                    {(ad.startsAt || ad.endsAt) && (
                      <span className="text-xs text-muted-foreground">
                        {ad.startsAt ? format(new Date(ad.startsAt), 'd MMM') : 'Now'}
                        {' → '}
                        {ad.endsAt ? format(new Date(ad.endsAt), 'd MMM yyyy') : 'No end'}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Switch
                        checked={ad.isActive}
                        onCheckedChange={(v) => toggleActive(ad, v)}
                        aria-label={`Show ${ad.title}`}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(ad)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(ad)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'New ad' : 'Edit ad'}</DialogTitle>
            <DialogDescription>Shown in the ad space on the home page.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <form id="ad-form" onSubmit={saveAd} className="order-2 space-y-4 lg:order-1">
            <div className="space-y-2">
              <Label>Image</Label>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload image
                </Button>
                {form.imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, imageUrl: '' })}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <Input
                placeholder="…or paste an image URL (https://…)"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Best at 16:9, e.g. 1600×900.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad-title">Title</Label>
              <Input
                id="ad-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad-desc">Description</Label>
              <Textarea
                id="ad-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ad-brand">Advertiser / brand name</Label>
                <Input
                  id="ad-brand"
                  placeholder="e.g. Sharma Book Store"
                  value={form.advertiserName}
                  onChange={(e) => setForm({ ...form, advertiserName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-badge">Highlight tag</Label>
                <Input
                  id="ad-badge"
                  placeholder="e.g. 50% OFF, NEW, Limited offer"
                  maxLength={24}
                  value={form.badgeText}
                  onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
                />
              </div>
            </div>

            <fieldset className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">Main button</legend>
              <div className="space-y-2">
                <Label htmlFor="ad-link">Website / buy link</Label>
                <Input
                  id="ad-link"
                  placeholder="https://…"
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-cta">Button text</Label>
                <Input
                  id="ad-cta"
                  placeholder="Learn more"
                  maxLength={30}
                  value={form.ctaLabel}
                  onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                />
                <div className="flex flex-wrap gap-1.5">
                  {CTA_PRESETS.map((label) => (
                    <Button
                      key={label}
                      type="button"
                      size="sm"
                      variant={form.ctaLabel === label ? 'default' : 'outline'}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setForm({ ...form, ctaLabel: label })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">Contact buttons</legend>
              <p className="-mt-1 text-xs text-muted-foreground">
                Each button appears only when filled in. Visitors tap to call, chat or email directly.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ad-phone">Phone (Call button)</Label>
                  <Input
                    id="ad-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad-wa">WhatsApp number</Label>
                  <Input
                    id="ad-wa"
                    type="tel"
                    inputMode="tel"
                    placeholder="98765 43210"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-email">Email</Label>
                <Input
                  id="ad-email"
                  type="email"
                  placeholder="sales@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                10-digit numbers are treated as Indian (+91). Add the country code for others.
              </p>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ad-start">Start date</Label>
                <Input
                  id="ad-start"
                  type="date"
                  min={minForExisting(
                    editing && editing !== 'new' ? toDateInput(editing.startsAt) : null
                  )}
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-end">End date</Label>
                <Input
                  id="ad-end"
                  type="date"
                  min={
                    form.startsAt && form.startsAt > todayInput()
                      ? form.startsAt
                      : minForExisting(
                          editing && editing !== 'new' ? toDateInput(editing.endsAt) : null
                        )
                  }
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <Label htmlFor="ad-order">Display order</Label>
                <Input
                  id="ad-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  className="w-28"
                />
              </div>
              <label className="flex items-center gap-3 pb-2 text-sm">
                Active
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                />
              </label>
            </div>

          </form>

          <aside className="order-1 lg:order-2">
            <div className="space-y-2 lg:sticky lg:top-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live preview
              </p>
              <div className="pointer-events-none">
                <AdCard ad={toCardData(form)} />
              </div>
            </div>
          </aside>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" form="ad-form" disabled={saving || uploading}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing === 'new' ? 'Create ad' : 'Save changes'}
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this ad?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” will be removed from the home page. To pause it
              instead, switch it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
