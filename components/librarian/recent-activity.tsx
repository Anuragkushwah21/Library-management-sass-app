'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus,
  BookOpen,
  CreditCard,
  AlertTriangle,
  Armchair,
  Activity as ActivityIcon,
} from 'lucide-react';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { ReactNode } from 'react';

interface Activity {
  id: string;
  type: string;
  description: string;
  /** ISO string from the API */
  timestamp: string;
}

interface RecentActivityProps {
  activities: Activity[];
}

interface TypeMeta {
  label: string;
  icon: ReactNode;
  badge: string;
  iconWrap: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  student_join: {
    label: 'Student Join',
    icon: <UserPlus className="h-4 w-4" />,
    badge:
      'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    iconWrap:
      'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  book_issued: {
    label: 'Book Issued',
    icon: <BookOpen className="h-4 w-4" />,
    badge:
      'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    iconWrap:
      'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  payment_received: {
    label: 'Payment',
    icon: <CreditCard className="h-4 w-4" />,
    badge:
      'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300',
    iconWrap:
      'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  },
  overdue_book: {
    label: 'Overdue Book',
    icon: <AlertTriangle className="h-4 w-4" />,
    badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    iconWrap: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  seat_reserved: {
    label: 'Seat Reserved',
    icon: <Armchair className="h-4 w-4" />,
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    iconWrap:
      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
};

const FALLBACK_META: TypeMeta = {
  label: 'Activity',
  icon: <ActivityIcon className="h-4 w-4" />,
  badge: 'bg-muted text-muted-foreground',
  iconWrap: 'bg-muted text-muted-foreground',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>

      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <ActivityIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No activity yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {activities.map((activity) => {
              const meta = TYPE_META[activity.type] || FALLBACK_META;

              return (
                <li
                  key={activity.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      meta.iconWrap
                    )}
                  >
                    {meta.icon}
                  </div>

                  {/* min-w-0 is required, otherwise long descriptions won't truncate */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug break-words">
                      {activity.description}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        variant="secondary"
                        className={cn('text-[11px] font-medium', meta.badge)}
                      >
                        {meta.label}
                      </Badge>

                      {/* Relative time is easier to read; exact time on hover */}
                      <time
                        dateTime={activity.timestamp}
                        title={formatDateTime(activity.timestamp)}
                        className="text-xs text-muted-foreground"
                      >
                        {formatRelativeTime(activity.timestamp)}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
