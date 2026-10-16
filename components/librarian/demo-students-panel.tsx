'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileLock2, Loader2, MoreHorizontal, Plus, RefreshCw, UserCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/time';
import { ActivationDialog, type ActivatableStudent } from './activation-dialog';

interface DemoStudent extends ActivatableStudent {
  email?: string;
  photoUrl?: string;
  registrationSource?: 'MANUAL' | 'QR';
  shiftId?: string | null;
  demoStartDate?: string | null;
  demoEndDate?: string | null;
  demoEndedAt?: string | null;
  createdAt: string;
  attendanceCount?: number;
  lastVisit?: string | null;
  idProof?: { publicId: string } | null;
}

const dayMs = 24 * 60 * 60 * 1000;
/** Days left on the calendar (0 = last day). Browser local ≈ library local for librarians on site. */
function daysLeft(end?: string | null): number | null {
  if (!end) return null;
  const e = new Date(end);
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.round((b - a) / dayMs);
}

/** Spec colours: green 2+ days left, yellow 1, red last day or over. */
function DaysLeftBadge({ left }: { left: number | null }) {
  if (left === null) return <span className="text-muted-foreground">—</span>;
  const tone = left >= 2 ? 'green' : left === 1 ? 'yellow' : 'red';
  const cls = {
    green: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    yellow: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    red: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  }[tone];
  const label = left > 1 ? `${left} days left` : left === 1 ? '1 day left' : left === 0 ? 'Last day' : 'Ended';
  return <Badge variant="outline" className={cn('whitespace-nowrap font-semibold', cls)}>{label}</Badge>;
}

function Avatar({ s }: { s: DemoStudent }) {
  return s.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
      {s.name.charAt(0).toUpperCase()}
    </span>
  );
}

const fmt = (d?: string | null) => (d ? format(new Date(d), 'd MMM') : '—');
const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();

/** Demo Students (status DEMO) or Demo Ended / Follow-up (DEMO_ENDED). */
export function DemoStudentsPanel({ mode, onChanged }: { mode: 'DEMO' | 'DEMO_ENDED'; onChanged?: () => void }) {
  const [rows, setRows] = useState<DemoStudent[] | null>(null);
  const [shifts, setShifts] = useState<Map<string, { name: string; startTime: string; endTime: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<DemoStudent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [res, sh] = await Promise.all([
        api.getStudentsByStatus(mode, true),
        api.getShifts().catch(() => ({ data: [] })),
      ]);
      setRows(res.data ?? []);
      setShifts(new Map((sh.data ?? []).map((x: any) => [String(x._id), x])));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load demo students.');
    } finally {
      setRefreshing(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (s: DemoStudent, fn: () => Promise<any>, ok: string) => {
    setBusyId(s._id);
    try {
      const res = await fn();
      toast.success(res?.message || ok);
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openIdProof = async (s: DemoStudent) => {
    try {
      const res: any = await api.getIdProofLink(s._id);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort((a, b) =>
        mode === 'DEMO'
          ? (daysLeft(a.demoEndDate) ?? 99) - (daysLeft(b.demoEndDate) ?? 99)
          : new Date(b.demoEndedAt ?? b.demoEndDate ?? 0).getTime() - new Date(a.demoEndedAt ?? a.demoEndDate ?? 0).getTime()
      ),
    [rows, mode]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {mode === 'DEMO'
            ? 'Students on a free demo. Collect the fee to make them members.'
            : 'Demos that finished without a membership — follow up with them.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
          {mode === 'DEMO' && (
            <Button asChild>
              <Link href="/librarian/students/add-demo">
                <Plus className="mr-1.5 h-4 w-4" />
                Add demo student
              </Link>
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !rows ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {mode === 'DEMO' ? 'No students on a demo right now.' : 'No finished demos to follow up.'}
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
                    <th className="px-4 py-2.5 font-medium">Demo</th>
                    <th className="px-4 py-2.5 font-medium">{mode === 'DEMO' ? 'Days left' : 'Last visit'}</th>
                    <th className="px-4 py-2.5 font-medium">Visits</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((s) => {
                    const sh = s.shiftId ? shifts.get(String(s.shiftId)) : null;
                    return (
                      <tr key={s._id} className="align-middle">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar s={s} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 font-medium">
                                {s.name}
                                <Badge variant="secondary" className="text-[10px]">
                                  {s.registrationSource === 'QR' ? 'QR' : 'Manual'}
                                </Badge>
                                {mode === 'DEMO' && isToday(s.createdAt) && (
                                  <Badge className="bg-sky-600 text-[10px] hover:bg-sky-600">New today</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{s.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {sh ? (
                            <>
                              <div>{sh.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatTime(sh.startTime)}–{formatTime(sh.endTime)}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {s.seatNumber ? `Seat ${s.seatNumber}` : <span className="text-muted-foreground">{mode === 'DEMO' ? 'None' : 'Released'}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {fmt(s.demoStartDate)} – {fmt(s.demoEndDate)}
                        </td>
                        <td className="px-4 py-3">
                          {mode === 'DEMO' ? <DaysLeftBadge left={daysLeft(s.demoEndDate)} /> : s.lastVisit ? fmt(s.lastVisit) : 'Never came'}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{s.attendanceCount ?? 0}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" onClick={() => setActivating(s)} disabled={busyId === s._id}>
                              <UserCheck className="mr-1.5 h-4 w-4" />
                              {mode === 'DEMO' ? 'Collect fee' : 'Activate'}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`More actions for ${s.name}`} disabled={busyId === s._id}>
                                  {busyId === s._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {mode === 'DEMO' && (
                                  <>
                                    <DropdownMenuLabel className="text-xs">Extend demo</DropdownMenuLabel>
                                    {[1, 2, 3].map((d) => (
                                      <DropdownMenuItem key={d} onClick={() => act(s, () => api.extendDemo(s._id, d), 'Demo extended')}>
                                        +{d} day{d > 1 ? 's' : ''}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        if (confirm(`End ${s.name}'s demo now? Their seat will be freed.`)) {
                                          act(s, () => api.endDemo(s._id), 'Demo ended');
                                        }
                                      }}
                                    >
                                      End demo now
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {s.idProof?.publicId && (
                                  <>
                                    {mode === 'DEMO' && <DropdownMenuSeparator />}
                                    <DropdownMenuItem onClick={() => openIdProof(s)}>
                                      <FileLock2 className="mr-2 h-4 w-4" />
                                      View ID proof
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {mode === 'DEMO_ENDED' && !s.idProof?.publicId && (
                                  <DropdownMenuItem disabled>No other actions</DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <ActivationDialog
        student={activating}
        onClose={() => setActivating(null)}
        onDone={() => {
          load();
          onChanged?.();
        }}
      />
    </div>
  );
}
