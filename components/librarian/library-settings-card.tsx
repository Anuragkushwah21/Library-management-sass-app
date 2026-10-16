'use client';

import { useEffect, useState } from 'react';
import { Building2, Crosshair, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

interface LibraryForm {
  name: string;
  phone: string;
  address: string;
  timezone: string;
  graceMinutes: string;
  earlyCheckinMinutes: string;
  geofenceEnabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: string;
  otpEnabled: boolean;
  demoDays: string;
}

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Kathmandu', 'Asia/Dhaka', 'Europe/London', 'America/New_York', 'UTC'];

/** Library profile + check-in rules (PLAN R1/R2, D3). */
export function LibrarySettingsCard() {
  const [form, setForm] = useState<LibraryForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const { data } = await api.getLibrary();
      const s = data.settings ?? {};
      setForm({
        name: data.name,
        phone: data.phone ?? '',
        address: data.address ?? '',
        timezone: s.timezone ?? 'Asia/Kolkata',
        graceMinutes: String(s.graceMinutes ?? 15),
        earlyCheckinMinutes: String(s.earlyCheckinMinutes ?? 60),
        geofenceEnabled: Boolean(s.geofence?.enabled),
        lat: s.geofence?.lat ?? null,
        lng: s.geofence?.lng ?? null,
        radiusMeters: String(s.geofence?.radiusMeters ?? 200),
        otpEnabled: Boolean(data.qrAccess?.qrAttendanceEnabled && data.qrAccess?.accessStatus === 'ACTIVE'),
        demoDays: String(s.demoDays ?? 3),
      });
    } catch (err: any) {
      setError(err.message || 'Could not load library settings.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => f && { ...f, lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success('Library location set. Remember to save.');
      },
      () => {
        setLocating(false);
        toast.error('Location permission denied.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await api.updateLibrary({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        settings: {
          timezone: form.timezone,
          graceMinutes: Number(form.graceMinutes),
          earlyCheckinMinutes: Number(form.earlyCheckinMinutes),
          demoDays: Number(form.demoDays) || 3,
          geofence: {
            enabled: form.geofenceEnabled,
            lat: form.lat,
            lng: form.lng,
            radiusMeters: Number(form.radiusMeters) || 200,
          },
        },
      });
      toast.success('Library settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <CardTitle>Library &amp; check-in</CardTitle>
        </div>
        <CardDescription>
          Shown to students when they scan your QR, and the rules for marking attendance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            {error}
            <Button size="sm" variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        ) : !form ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lib-name">Library name</Label>
                <Input id="lib-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lib-phone">Contact phone</Label>
                <Input
                  id="lib-phone"
                  type="tel"
                  placeholder="Shown on the renewal screen"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lib-address">Address</Label>
              <Textarea id="lib-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="lib-grace">Late after (minutes)</Label>
                <Input
                  id="lib-grace"
                  type="number"
                  min={0}
                  max={180}
                  value={form.graceMinutes}
                  onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Grace period after shift start. Default 15.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lib-early">Early check-in (minutes)</Label>
                <Input
                  id="lib-early"
                  type="number"
                  min={0}
                  max={240}
                  value={form.earlyCheckinMinutes}
                  onChange={(e) => setForm({ ...form, earlyCheckinMinutes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">How early before a shift students can scan in.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lib-tz">Timezone</Label>
                <select
                  id="lib-tz"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">QR attendance</p>
                  <p className="text-xs text-muted-foreground">
                    Managed by the platform admin.{' '}
                    <a href="/librarian/qr-attendance" className="text-primary hover:underline">
                      Open QR Attendance
                    </a>
                  </p>
                </div>
                <span
                  className={
                    'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                    (form.otpEnabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')
                  }
                >
                  {form.otpEnabled ? 'Enabled' : 'Off'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Label htmlFor="lib-demo" className="text-sm">
                  Demo length (days after start)
                </Label>
                <Input
                  id="lib-demo"
                  type="number"
                  min={1}
                  max={30}
                  className="h-8 w-20"
                  value={form.demoDays}
                  onChange={(e) => setForm({ ...form, demoDays: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="lib-geo" className="text-sm font-medium">
                    Location check on scan
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Students must be near the library to check in, so a photo of the QR can&apos;t be used from home.
                  </p>
                </div>
                <Switch
                  id="lib-geo"
                  checked={form.geofenceEnabled}
                  onCheckedChange={(v) => setForm({ ...form, geofenceEnabled: v })}
                />
              </div>
              {form.geofenceEnabled && (
                <div className="flex flex-wrap items-end gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
                    {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
                    Use my current location
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {form.lat != null && form.lng != null
                      ? `Set: ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`
                      : 'Stand inside the library and tap the button.'}
                  </span>
                  <div className="space-y-1">
                    <Label htmlFor="lib-radius" className="text-xs">
                      Radius (m)
                    </Label>
                    <Input
                      id="lib-radius"
                      type="number"
                      min={20}
                      max={5000}
                      className="h-8 w-24"
                      value={form.radiusMeters}
                      onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save library settings
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
