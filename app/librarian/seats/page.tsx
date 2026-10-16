'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Armchair,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SeatState = 'available' | 'assigned' | 'occupied' | 'expired';

interface SeatView {
  _id: string;
  seatNumber: number;
  state: SeatState;
  notes?: string;
  insideSince: string | null;
  student: {
    _id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    membershipEndDate: string | null;
  } | null;
}

interface StudentLite {
  _id: string;
  name: string;
  phone: string;
  status?: string;
  seatNumber?: number | null;
}

/** Colours from PLAN.md: green free, purple assigned, red inside now, grey expired. */
const STATE: Record<SeatState, { label: string; tile: string; dot: string }> = {
  available: {
    label: 'Available',
    tile: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    dot: 'bg-emerald-500',
  },
  assigned: {
    label: 'Assigned',
    tile: 'border-violet-300 bg-violet-50 text-violet-900 hover:border-violet-500 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100',
    dot: 'bg-violet-500',
  },
  occupied: {
    label: 'Inside now',
    tile: 'border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-500 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100',
    dot: 'bg-rose-500',
  },
  expired: {
    label: 'Expired — free it',
    tile: 'border-dashed border-zinc-400 bg-zinc-100 text-zinc-600 hover:border-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
    dot: 'bg-zinc-400',
  },
};

type Filter = 'all' | SeatState;

export default function SeatsPage() {
  const [seats, setSeats] = useState<SeatView[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<SeatView | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, st] = await Promise.all([api.getSeats(), api.getStudents()]);
      setSeats(s.data ?? []);
      setStudents(st.data ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load seats.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // "Inside now" follows QR check-ins, so keep it fresh
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Keep the open dialog in sync with refreshed data
  useEffect(() => {
    if (selected && seats) setSelected(seats.find((s) => s._id === selected._id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  const counts = useMemo(() => {
    const c = { all: 0, available: 0, assigned: 0, occupied: 0, expired: 0 };
    for (const s of seats ?? []) {
      c.all++;
      c[s.state]++;
    }
    return c;
  }, [seats]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (seats ?? []).filter(
      (s) =>
        (filter === 'all' || s.state === filter) &&
        (!q ||
          String(s.seatNumber) === q ||
          s.student?.name.toLowerCase().includes(q) ||
          s.student?.phone.includes(q))
    );
  }, [seats, filter, query]);

  // Students who can take a seat: active/demo members without one
  const eligible = useMemo(
    () =>
      students
        .filter((s) => ['ACTIVE_MEMBER', 'DEMO', undefined].includes(s.status) && !s.seatNumber)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [students]
  );

  const open = (seat: SeatView) => {
    setSelected(seat);
    setAssignTo('');
    setNotes(seat.notes ?? '');
  };

  const run = async (fn: () => Promise<any>, ok: string, close = false) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      if (close) setSelected(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addSeats = async (e: React.FormEvent) => {
    e.preventDefault();
    const from = Number(range.from);
    const to = Number(range.to || range.from);
    if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < 1) {
      toast.error('Enter seat numbers from 1 upwards.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createSeatRange({ from, to });
      toast.success(res.message || 'Seats added');
      setAdding(false);
      setRange({ from: '', to: '' });
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const nextFree = seats && seats.length ? Math.max(...seats.map((s) => s.seatNumber)) + 1 : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Seats</h1>
          <p className="text-muted-foreground">Tap a seat to assign, change or free it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.expired > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (confirm(`Free ${counts.expired} seat(s) held by expired or blocked students?`)) {
                  run(api.releaseExpiredSeats, 'Expired seats freed');
                }
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Free expired seats ({counts.expired})
            </Button>
          )}
          <Button
            onClick={() => {
              setRange({ from: String(nextFree), to: '' });
              setAdding(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add seats
          </Button>
        </div>
      </div>

      {/* Counts double as filters */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {(
          [
            ['all', 'All seats'],
            ['available', 'Available'],
            ['assigned', 'Assigned'],
            ['occupied', 'Inside now'],
            ['expired', 'Expired'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-colors',
              filter === key ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/30'
            )}
          >
            <div className="flex items-center gap-1.5 text-xl font-bold tabular-nums sm:text-2xl">
              {key !== 'all' && <span className={cn('h-2.5 w-2.5 rounded-full', STATE[key as SeatState].dot)} />}
              {counts[key]}
            </div>
            <div className="truncate text-xs text-muted-foreground">{label}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Seat number, student name or phone"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search seats"
          />
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh">
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
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
      ) : !seats ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : seats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Armchair className="h-10 w-10 text-muted-foreground/60" />
            <p className="font-medium">No seats yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Add all your seats in one go, e.g. 1 to 50.</p>
            <Button onClick={() => (setRange({ from: '1', to: '' }), setAdding(true))}>
              <Plus className="mr-2 h-4 w-4" />
              Add seats
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No seats match.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10">
          {visible.map((seat) => (
            <button
              key={seat._id}
              onClick={() => open(seat)}
              className={cn(
                'flex aspect-square min-w-0 flex-col items-center justify-center rounded-xl border-2 p-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                STATE[seat.state].tile
              )}
              aria-label={`Seat ${seat.seatNumber}, ${STATE[seat.state].label}${seat.student ? `, ${seat.student.name}` : ''}`}
            >
              <span className="text-lg font-bold tabular-nums leading-none sm:text-xl">{seat.seatNumber}</span>
              <span className="mt-1 w-full truncate px-0.5 text-[10px] leading-tight sm:text-xs">
                {seat.student ? seat.student.name.split(' ')[0] : 'Free'}
              </span>
            </button>
          ))}
        </div>
      )}

      {seats && seats.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(Object.keys(STATE) as SeatState[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', STATE[k].dot)} />
              {STATE[k].label}
            </span>
          ))}
        </div>
      )}

      {/* Seat details / actions */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Seat {selected.seatNumber}
                  <Badge variant="outline" className="gap-1.5 font-normal">
                    <span className={cn('h-2 w-2 rounded-full', STATE[selected.state].dot)} />
                    {STATE[selected.state].label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {selected.student ? 'Assigned seat' : 'This seat is free.'}
                </DialogDescription>
              </DialogHeader>

              {selected.student && (
                <dl className="divide-y rounded-lg border text-sm">
                  {[
                    ['Student', selected.student.name],
                    ['Phone', selected.student.phone],
                    [
                      'Membership',
                      selected.student.membershipEndDate
                        ? `${selected.state === 'expired' ? 'Ended' : 'Until'} ${format(new Date(selected.student.membershipEndDate), 'd MMM yyyy')}`
                        : selected.student.status === 'BLOCKED'
                        ? 'Blocked'
                        : 'No end date',
                    ],
                    ...(selected.insideSince
                      ? [['Checked in', format(new Date(selected.insideSince), 'h:mm a')]]
                      : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 px-3 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="space-y-2">
                <Label>{selected.student ? 'Move a different student here' : 'Assign a student'}</Label>
                <div className="flex gap-2">
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={eligible.length ? 'Choose a student without a seat' : 'Everyone already has a seat'} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name} · {s.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!assignTo || busy}
                    onClick={() => {
                      if (selected.student && !confirm(`Replace ${selected.student.name} on seat ${selected.seatNumber}? Their seat will be freed.`)) return;
                      run(async () => {
                        if (selected.student) await api.releaseSeat(selected._id);
                        await api.assignSeat(selected._id, assignTo);
                      }, `Seat ${selected.seatNumber} assigned`, true);
                    }}
                  >
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Assign
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="seat-notes">Notes</Label>
                <div className="flex gap-2">
                  <Input
                    id="seat-notes"
                    placeholder="e.g. Near window, has charging point"
                    maxLength={200}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={busy || notes === (selected.notes ?? '')}
                    onClick={() => run(() => api.updateSeat(selected._id, { notes }), 'Notes saved')}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
                {selected.student ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Free seat ${selected.seatNumber} from ${selected.student!.name}?`)) {
                        run(() => api.releaseSeat(selected._id), `Seat ${selected.seatNumber} is free`, true);
                      }
                    }}
                  >
                    <UserMinus className="mr-1.5 h-4 w-4" />
                    Free this seat
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete seat ${selected.seatNumber}?`)) {
                        run(() => api.deleteSeat(selected._id), `Seat ${selected.seatNumber} deleted`, true);
                      }
                    }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete seat
                  </Button>
                )}
                {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add one seat or a range */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add seats</DialogTitle>
            <DialogDescription>Add one seat, or a whole range at once. Existing numbers are skipped.</DialogDescription>
          </DialogHeader>
          <form onSubmit={addSeats} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="seat-from">From seat</Label>
                <Input
                  id="seat-from"
                  type="number"
                  min={1}
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seat-to">To seat (optional)</Label>
                <Input
                  id="seat-to"
                  type="number"
                  min={1}
                  placeholder={range.from || '—'}
                  value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                />
              </div>
            </div>
            {range.from && range.to && Number(range.to) >= Number(range.from) && (
              <p className="text-xs text-muted-foreground">
                Adds up to {Number(range.to) - Number(range.from) + 1} seats ({range.from}–{range.to}).
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
