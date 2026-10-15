'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Star, Trash2, Clock, Save } from 'lucide-react';
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
import { formatDuration, formatPrice } from '@/lib/plan-format';

interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

interface PlanForm {
  name: string;
  description: string;
  price: string;
  currency: string;
  durationDays: string;
  features: string;
  sortOrder: string;
  isActive: boolean;
  isPopular: boolean;
}

const EMPTY_FORM: PlanForm = {
  name: '',
  description: '',
  price: '',
  currency: 'INR',
  durationDays: '30',
  features: '',
  sortOrder: '0',
  isActive: true,
  isPopular: false,
};

const DURATION_PRESETS = [
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

function toForm(plan: Plan): PlanForm {
  return {
    name: plan.name,
    description: plan.description ?? '',
    price: String(plan.price),
    currency: plan.currency,
    durationDays: String(plan.durationDays),
    features: plan.features.join('\n'),
    sortOrder: String(plan.sortOrder ?? 0),
    isActive: plan.isActive,
    isPopular: plan.isPopular,
  };
}

function fromForm(form: PlanForm) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: Number(form.price),
    currency: form.currency.trim().toUpperCase() || 'INR',
    durationDays: Number(form.durationDays),
    features: form.features
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean),
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
    isPopular: form.isPopular,
  };
}

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [trialDays, setTrialDays] = useState('');
  const [savingTrial, setSavingTrial] = useState(false);

  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const load = async () => {
    try {
      const [plansRes, settingsRes] = await Promise.all([
        api.getAdminPlans(),
        api.getSystemSettings(),
      ]);
      setPlans(plansRes.data || []);
      setTrialDays(String(settingsRes.data?.trialDays ?? 3));
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

  const saveTrial = async () => {
    const days = Number(trialDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast({
        title: 'Invalid value',
        description: 'Trial length must be a whole number from 0 to 365.',
        variant: 'destructive',
      });
      return;
    }
    setSavingTrial(true);
    try {
      await api.updateSystemSettings({ trialDays: days });
      toast({ title: 'Saved', description: `New librarians get a ${days}-day trial.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingTrial(false);
    }
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const openEdit = (plan: Plan) => {
    setForm(toForm(plan));
    setEditing(plan);
  };

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = fromForm(form);
    if (!data.name || Number.isNaN(data.price) || !(data.durationDays >= 1)) {
      toast({
        title: 'Missing details',
        description: 'Name, price and duration are required.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createPlan(data);
        toast({ title: 'Plan created' });
      } else if (editing) {
        await api.updatePlan(editing._id, data);
        toast({ title: 'Plan updated' });
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: Plan, isActive: boolean) => {
    setPlans((prev) => prev.map((p) => (p._id === plan._id ? { ...p, isActive } : p)));
    try {
      await api.updatePlan(plan._id, { isActive });
    } catch (err: any) {
      setPlans((prev) =>
        prev.map((p) => (p._id === plan._id ? { ...p, isActive: !isActive } : p))
      );
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deletePlan(deleting._id);
      setPlans((prev) => prev.filter((p) => p._id !== deleting._id));
      toast({ title: 'Plan deleted' });
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
      {/* Free trial length */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Free trial
          </CardTitle>
          <CardDescription>
            How long a new librarian can use the product before they must send an
            approval request. Existing trials keep their end date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="trial-days">Trial length (days)</Label>
              <Input
                id="trial-days"
                type="number"
                min={0}
                max={365}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={saveTrial} disabled={savingTrial}>
              {savingTrial ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Plans</CardTitle>
            <CardDescription className="mt-1.5">
              Active plans appear on the home page and on the librarian&apos;s request
              screen.
            </CardDescription>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add plan
          </Button>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              No plans yet. Librarians can still send a request without choosing one.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan._id}
                  className={`flex flex-col rounded-xl border p-5 ${
                    plan.isActive ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{plan.name}</h3>
                        {plan.isPopular && (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3" />
                            Popular
                          </Badge>
                        )}
                        {!plan.isActive && <Badge variant="secondary">Hidden</Badge>}
                      </div>
                      <div className="mt-2 text-2xl font-bold tabular-nums">
                        {formatPrice(plan.price, plan.currency)}
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}/ {formatDuration(plan.durationDays)}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={plan.isActive}
                      onCheckedChange={(v) => toggleActive(plan, v)}
                      aria-label={`Show ${plan.name}`}
                    />
                  </div>

                  {plan.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                  )}

                  {plan.features.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span className="text-emerald-600">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto flex gap-2 pt-4">
                    <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(plan)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add plan' : 'Edit plan'}</DialogTitle>
            <DialogDescription>
              Changes apply to new approvals. Librarians already approved keep their
              current end date.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={savePlan} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                placeholder="e.g. Monthly"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-desc">Short description</Label>
              <Input
                id="plan-desc"
                placeholder="e.g. Best for small reading rooms"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor="plan-price">Price</Label>
                <Input
                  id="plan-price"
                  type="number"
                  min={0}
                  step="any"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-currency">Currency</Label>
                <Input
                  id="plan-currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-days">Duration (days)</Label>
              <Input
                id="plan-days"
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((p) => (
                  <Button
                    key={p.days}
                    type="button"
                    size="sm"
                    variant={form.durationDays === String(p.days) ? 'default' : 'outline'}
                    onClick={() => setForm({ ...form, durationDays: String(p.days) })}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-features">Features (one per line)</Label>
              <Textarea
                id="plan-features"
                rows={4}
                placeholder={'Unlimited students\nSeat management\nEmail offers'}
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-order">Display order</Label>
              <Input
                id="plan-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                className="w-28"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Show to librarians and on home page</span>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Mark as popular</span>
                <Switch
                  checked={form.isPopular}
                  onCheckedChange={(isPopular) => setForm({ ...form, isPopular })}
                />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing === 'new' ? 'Create plan' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the home page and request screen. Librarians already
              on this plan keep access until their current end date. To hide it
              temporarily, switch it off instead.
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
