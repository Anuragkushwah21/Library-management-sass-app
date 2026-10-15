'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatInstant } from '@/lib/time';

/** Dashboard summary of today's QR attendance, with who came in late (PLAN R2). */
export function TodayAttendanceCard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getAttendance()
        .then((res: any) => alive && (setData(res.data), setError(false)))
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const late = (data?.records ?? [])
    .filter((r: any) => r.arrivalStatus === 'LATE')
    .sort((a: any, b: any) => b.lateMinutes - a.lateMinutes)
    .slice(0, 5);

  const stats = data
    ? [
        { label: 'Inside now', value: data.counts.inside, cls: 'text-emerald-600' },
        { label: 'Present', value: data.counts.present },
        { label: 'Late', value: data.counts.late, cls: 'text-amber-600' },
        { label: 'Not checked in', value: data.counts.notYet + data.counts.absent },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Today&apos;s attendance
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/librarian/attendance">
            Open
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load today&apos;s attendance.</p>
        ) : !data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <div className={`text-2xl font-bold tabular-nums ${s.cls ?? ''}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            {late.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Late today</p>
                <ul className="divide-y rounded-lg border text-sm">
                  {late.map((r: any) => (
                    <li key={r._id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate font-medium">{r.studentId?.name ?? 'Student'}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        in at {formatInstant(r.checkInAt, data.timezone)} ·{' '}
                        <span className="font-medium text-amber-600">Late by {r.lateMinutes} min</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
