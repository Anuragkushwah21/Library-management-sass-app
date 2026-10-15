'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, Moon, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { api } from '@/lib/api';
import { crossesMidnight, formatTime, shiftDurationMinutes } from '@/lib/time';

interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  sortOrder: number;
  studentCount: number;
}

const PRESETS = [
  { name: 'Morning', startTime: '06:00', endTime: '14:00' },
  { name: 'Evening', startTime: '14:00', endTime: '22:00' },
  { name: 'Night', startTime: '22:00', endTime: '06:00' },
  { name: 'Full Day', startTime: '06:00', endTime: '22:00' },
];

const EMPTY = { name: '', startTime: '09:00', endTime: '17:00', sortOrder: '0' };

function durationLabel(s: { startTime: string; endTime: string }) {
  const mins = shiftDurationMinutes(s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const { data } = await api.getShifts();
      setShifts(data);
    } catch (err: any) {
      setError(err.message || 'Could not load shifts.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm({ ...EMPTY, sortOrder: String(shifts?.length ?? 0) });
    setEditing('new');
  };
  const openEdit = (s: Shift) => {
    setForm({ name: s.name, startTime: s.startTime, endTime: s.endTime, sortOrder: String(s.sortOrder) });
    setEditing(s);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Give the shift a name.');
    if (form.startTime === form.endTime) return toast.error('Start and end time cannot be the same.');
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), sortOrder: Number(form.sortOrder) || 0 };
    try {
      if (editing === 'new') {
        await api.createShift(payload);
        toast.success('Shift created');
      } else if (editing) {
        await api.updateShift(editing._id, payload);
        toast.success('Shift updated');
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s: Shift, isActive: boolean) => {
    try {
      await api.updateShift(s._id, { isActive });
      setShifts((prev) => prev && prev.map((x) => (x._id === s._id ? { ...x, isActive } : x)));
      toast.success(isActive ? `${s.name} activated` : `${s.name} deactivated`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const remove = async (s: Shift) => {
    if (!confirm(`Delete the "${s.name}" shift?`)) return;
    try {
      await api.deleteShift(s._id);
      setShifts((prev) => prev && prev.filter((x) => x._id !== s._id));
      toast.success('Shift deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Shifts</h1>
          <p className="text-muted-foreground">Attendance is marked per shift. Each student belongs to one shift.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add shift
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !shifts ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : shifts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No shifts yet. Add one to start taking attendance.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shifts.map((s) => (
            <Card key={s._id} className={s.isActive ? '' : 'opacity-60'}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {s.name}
                    {!s.isActive && <Badge variant="secondary">Inactive</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(s.startTime)} – {formatTime(s.endTime)}
                    <span className="text-muted-foreground/70">· {durationLabel(s)}</span>
                  </CardDescription>
                </div>
                <Switch checked={s.isActive} onCheckedChange={(v) => toggle(s, v)} aria-label={`${s.name} active`} />
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" />
                  {s.studentCount} student{s.studentCount === 1 ? '' : 's'}
                </Badge>
                {crossesMidnight(s) && (
                  <Badge variant="outline" className="gap-1">
                    <Moon className="h-3 w-3" />
                    Ends next day
                  </Badge>
                )}
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(s)}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add shift' : 'Edit shift'}</DialogTitle>
            <DialogDescription>A shift ending before it starts runs past midnight (e.g. Night 22:00–06:00).</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {editing === 'new' && (
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setForm((f) => ({ ...f, ...p }))}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="shift-name">Name</Label>
              <Input id="shift-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="shift-start">Starts</Label>
                <Input id="shift-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shift-end">Ends</Label>
                <Input id="shift-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
              </div>
            </div>
            {form.startTime && form.endTime && form.startTime !== form.endTime && (
              <p className="text-xs text-muted-foreground">
                {durationLabel(form)} long{crossesMidnight(form) ? ', ends the next day' : ''}.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing === 'new' ? 'Create shift' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
