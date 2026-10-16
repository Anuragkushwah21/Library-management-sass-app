'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatInstant, formatLate, formatMinutes, formatTime } from '@/lib/time';

interface ShiftLite {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
interface StudentLite {
  _id: string;
  name: string;
  phone: string;
  seatNumber: number | null;
  status?: string;
}
interface Rec {
  _id: string;
  studentId: StudentLite | null;
  shiftId: string;
  seatNumber: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  totalMinutes: number;
  arrivalStatus: 'PRESENT' | 'LATE' | 'ABSENT';
  lateMinutes: number;
  leftEarly: boolean;
  isInside: boolean;
  entryType: 'DEMO' | 'MEMBER';
  source: 'QR' | 'MANUAL' | 'SYSTEM';
  autoCheckedOut: boolean;
  manuallyEdited: boolean;
  timesRecorded?: boolean;
  note?: string;
}
interface Missing {
  student: StudentLite;
  shiftId: string;
  state: 'NOT_YET' | 'ABSENT';
}
interface Data {
  date: string;
  today: string;
  timezone: string;
  graceMinutes: number;
  shifts: ShiftLite[];
  records: Rec[];
  notCheckedIn: Missing[];
  counts: { present: number; late: number; inside: number; leftEarly: number; absent: number; notYet: number };
}

type Tab = 'all' | 'inside' | 'present' | 'late' | 'missing';

/** Current library-local time as HH:mm, for the manual dialogs' default. */
function nowHHmm(tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export default function AttendancePage() {
  const [date, setDate] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [manual, setManual] = useState<{
    action: 'checkin' | 'checkout';
    student: StudentLite;
    shiftId: string;
    time: string;
    note: string;
  } | null>(null);
  const [noteFor, setNoteFor] = useState<{ rec: Rec; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rec | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.getAttendance({ date, shiftId });
      setData(data);
      setError(null);
      if (!date) setDate(data.date);
    } catch (err: any) {
      setError(err.message || 'Could not load attendance.');
    } finally {
      setRefreshing(false);
    }
  }, [date, shiftId]);

  useEffect(() => {
    load();
  }, [load]);

  // Today's list stays live while the page is open
  useEffect(() => {
    if (!data || data.date !== data.today) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [data, load]);

  const shiftName = useMemo(() => {
    const m = new Map((data?.shifts ?? []).map((s) => [String(s._id), s]));
    return (id: string) => m.get(String(id));
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return { recs: [] as Rec[], missing: [] as Missing[] };
    const recs = data.records.filter((r) =>
      tab === 'inside' ? r.isInside : tab === 'present' ? r.arrivalStatus === 'PRESENT' : tab === 'late' ? r.arrivalStatus === 'LATE' : tab === 'missing' ? false : true
    );
    const missing = tab === 'all' || tab === 'missing' ? data.notCheckedIn : [];
    return { recs, missing };
  }, [data, tab]);

  const fmt = (iso: string | null) => (iso && data ? formatInstant(iso, data.timezone) : '—');

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual || !data) return;
    setBusy(true);
    try {
      await api.manualAttendance({
        studentId: manual.student._id,
        shiftId: manual.shiftId,
        date: data.date,
        action: manual.action,
        time: manual.time || undefined,
        note: manual.note.trim() || undefined,
      });
      toast.success(`${manual.student.name} ${manual.action === 'checkin' ? 'checked in' : 'checked out'}`);
      setManual(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Present today = checked in right now (time recorded); past days = roll call without times */
  const quickMark = async (m: Missing, action: 'present' | 'absent') => {
    if (!data) return;
    try {
      const res: any = await api.manualAttendance({ studentId: m.student._id, shiftId: m.shiftId, date: data.date, action });
      toast.success(
        action === 'present' && res.data?.isInside
          ? `${m.student.name} checked in at ${formatInstant(res.data.checkInAt, data.timezone)}`
          : `${m.student.name} marked ${action}`
      );
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /** One tap when the student leaves: check out at this moment */
  const checkOutNow = async (r: Rec) => {
    if (!data || !r.studentId) return;
    setBusyRow(r._id);
    try {
      await api.manualAttendance({ studentId: r.studentId._id, shiftId: r.shiftId, date: data.date, action: 'checkout' });
      toast.success(`${r.studentId.name} checked out`);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyRow(null);
    }
  };

  const removeEntry = async () => {
    if (!deleting) return;
    setBusyRow(deleting._id);
    try {
      await api.deleteAttendance(deleting._id);
      toast.success('Attendance entry deleted');
      setDeleting(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyRow(null);
    }
  };

  const override = async (rec: Rec, body: { arrivalStatus?: 'PRESENT' | 'LATE'; note?: string }, msg: string) => {
    try {
      await api.overrideAttendance(rec._id, body);
      toast.success(msg);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const statusBadge = (r: Rec) => (
    <div className="flex flex-wrap gap-1">
      {r.isInside && <Badge className="bg-emerald-600 hover:bg-emerald-600">Inside</Badge>}
      {r.arrivalStatus === 'LATE' ? (
        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
          Late by {formatLate(r.lateMinutes)}
        </Badge>
      ) : r.arrivalStatus === 'PRESENT' ? (
        <Badge variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-400">
          Present
        </Badge>
      ) : (
        <Badge variant="destructive">Absent</Badge>
      )}
      {r.leftEarly && <Badge variant="secondary">Left early</Badge>}
      {r.entryType === 'DEMO' && <Badge variant="secondary">Demo</Badge>}
      {r.source === 'MANUAL' && <Badge variant="secondary">Manual</Badge>}
      {r.autoCheckedOut && <Badge variant="secondary">Auto out</Badge>}
    </div>
  );

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'inside', label: 'Inside', count: data?.counts.inside },
    { key: 'present', label: 'Present', count: data?.counts.present },
    { key: 'late', label: 'Late', count: data?.counts.late },
    { key: 'missing', label: 'Not checked in', count: data ? data.counts.absent + data.counts.notYet : undefined },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Attendance</h1>
          <p className="text-muted-foreground">
            {data ? `Late after ${data.graceMinutes} min grace · ${data.timezone}` : 'QR check-ins and manual entries'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="att-date" className="text-xs">
              Date
            </Label>
            <Input
              id="att-date"
              type="date"
              className="h-9 w-40"
              value={date}
              max={data?.today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-shift" className="text-xs">
              Shift
            </Label>
            <select
              id="att-shift"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            >
              <option value="">All active shifts</option>
              {data?.shifts.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({formatTime(s.startTime)}–{formatTime(s.endTime)})
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
          {[
            { label: 'Inside now', value: data.counts.inside, cls: 'text-emerald-600' },
            { label: 'Present', value: data.counts.present },
            { label: 'Late', value: data.counts.late, cls: 'text-amber-600' },
            { label: 'Left early', value: data.counts.leftEarly },
            { label: 'Not yet in', value: data.counts.notYet },
            { label: 'Absent', value: data.counts.absent, cls: 'text-destructive' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
              <div className={cn('text-xl font-bold tabular-nums sm:text-2xl', c.cls)}>{c.value}</div>
              <div className="truncate text-xs text-muted-foreground">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 tabular-nums text-muted-foreground">{t.count}</span>}
          </button>
        ))}
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
      ) : !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.recs.length === 0 && rows.missing.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <CalendarDays className="h-8 w-8 opacity-50" />
            {tab === 'all' ? 'No attendance for this day yet.' : 'Nobody in this list.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Shift</th>
                    <th className="px-4 py-2.5 font-medium">Seat</th>
                    <th className="px-4 py-2.5 font-medium">In</th>
                    <th className="px-4 py-2.5 font-medium">Out</th>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.recs.map((r) => {
                    const sh = shiftName(r.shiftId);
                    return (
                      <tr key={r._id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.studentId?.name ?? 'Deleted student'}</div>
                          <div className="text-xs text-muted-foreground">{r.studentId?.phone}</div>
                          {r.note && (
                            <div className="mt-1 flex max-w-[16rem] gap-1 text-xs text-muted-foreground">
                              <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="line-clamp-2">{r.note}</span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{sh?.name ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums">{r.seatNumber ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{r.timesRecorded === false ? '—' : fmt(r.checkInAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{r.isInside || r.timesRecorded === false ? '—' : fmt(r.checkOutAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {r.isInside ? 'Inside' : r.timesRecorded === false ? <span className="text-xs text-muted-foreground">Marked</span> : formatMinutes(r.totalMinutes)}
                        </td>
                        <td className="px-4 py-3">{statusBadge(r)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {r.isInside && r.studentId && data.date === data.today && (
                            <Button size="sm" variant="outline" className="mr-1 border-sky-600/40 text-sky-700 dark:text-sky-400" disabled={busyRow === r._id} onClick={() => checkOutNow(r)}>
                              {busyRow === r._id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogOut className="mr-1.5 h-3.5 w-3.5" />}
                              Check out
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.isInside && r.studentId && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setManual({
                                      action: 'checkout',
                                      student: r.studentId!,
                                      shiftId: r.shiftId,
                                      time: data.date === data.today ? nowHHmm(data.timezone) : '',
                                      note: '',
                                    })
                                  }
                                >
                                  <LogOut className="mr-2 h-4 w-4" />
                                  {data.date === data.today ? 'Check out at another time' : 'Check out'}
                                </DropdownMenuItem>
                              )}
                              {r.arrivalStatus !== 'PRESENT' && (
                                <DropdownMenuItem onClick={() => override(r, { arrivalStatus: 'PRESENT' }, 'Marked present')}>
                                  Mark present
                                </DropdownMenuItem>
                              )}
                              {r.arrivalStatus !== 'LATE' && r.checkInAt && (
                                <DropdownMenuItem onClick={() => override(r, { arrivalStatus: 'LATE' }, 'Marked late')}>
                                  Mark late
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setNoteFor({ rec: r, note: r.note ?? '' })}>
                                <StickyNote className="mr-2 h-4 w-4" />
                                {r.note ? 'Edit note' : 'Add note'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(r)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete entry
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.missing.map((m) => {
                    const sh = shiftName(m.shiftId);
                    return (
                      <tr key={`${m.student._id}:${m.shiftId}`} className="bg-muted/20 align-top">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-medium">
                            {m.student.name}
                            {m.student.status === 'DEMO' && <Badge variant="secondary" className="text-[10px]">Demo</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.student.phone}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{sh?.name ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums">{m.student.seatNumber ?? '—'}</td>
                        <td className="px-4 py-3">—</td>
                        <td className="px-4 py-3">—</td>
                        <td className="px-4 py-3">—</td>
                        <td className="px-4 py-3">
                          {m.state === 'ABSENT' ? (
                            <Badge variant="destructive">Absent</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Not yet in
                            </Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400" onClick={() => quickMark(m, 'present')}>
                            Present
                          </Button>
                          <Button variant="outline" size="sm" className="border-rose-600/40 text-rose-700 dark:text-rose-400" onClick={() => quickMark(m, 'absent')}>
                            Absent
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setManual({
                                action: 'checkin',
                                student: m.student,
                                shiftId: m.shiftId,
                                time: data.date === data.today && m.state === 'NOT_YET' ? nowHHmm(data.timezone) : sh?.startTime ?? '',
                                note: '',
                              })
                            }
                          >
                            <LogIn className="mr-1.5 h-3.5 w-3.5" />
                            Check in
                          </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {manual?.action === 'checkin' ? 'Manual check-in' : 'Manual check-out'}: {manual?.student.name}
            </DialogTitle>
            <DialogDescription>Recorded as a manual entry with your name in the audit log.</DialogDescription>
          </DialogHeader>
          {manual && (
            <form onSubmit={submitManual} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-time">Time</Label>
                <Input
                  id="manual-time"
                  type="time"
                  value={manual.time}
                  onChange={(e) => setManual({ ...manual, time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-note">Note (optional)</Label>
                <Textarea
                  id="manual-note"
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. Phone battery dead"
                  value={manual.note}
                  onChange={(e) => setManual({ ...manual, note: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setManual(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {manual.action === 'checkin' ? 'Check in' : 'Check out'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Attendance note</DialogTitle>
            <DialogDescription>{noteFor?.rec.studentId?.name}</DialogDescription>
          </DialogHeader>
          {noteFor && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await override(noteFor.rec, { note: noteFor.note.trim() }, 'Note saved');
                setNoteFor(null);
              }}
              className="space-y-4"
            >
              <Textarea
                rows={3}
                maxLength={300}
                value={noteFor.note}
                onChange={(e) => setNoteFor({ ...noteFor, note: e.target.value })}
                aria-label="Note"
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNoteFor(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save note</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this attendance entry?</DialogTitle>
            <DialogDescription>
              {deleting?.studentId?.name ?? 'This student'} · {data?.date}
              {deleting?.checkInAt && deleting.timesRecorded !== false && data ? ` · in at ${formatInstant(deleting.checkInAt, data.timezone)}` : ''}.
              Use this for a wrong entry — the student goes back to “Not checked in”. A copy stays in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!busyRow} onClick={removeEntry}>
              {busyRow && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
