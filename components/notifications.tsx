'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export interface NotificationItem {
  _id: string;
  section: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

interface Feed {
  unread: number;
  sections: Record<string, number>;
  counts: Record<string, number>;
  items: NotificationItem[];
}

interface Ctx {
  feed: Feed | null;
  refresh: () => Promise<void>;
  markRead: (data: { ids?: string[]; section?: string; all?: boolean }) => Promise<void>;
}

const NotificationsContext = createContext<Ctx>({
  feed: null,
  refresh: async () => {},
  markRead: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

/** Visiting these pages counts as having seen that section's notifications. */
const SEEN_ON: Record<string, string> = {
  '/librarian/students': 'students',
  '/admin/librarians/pending': 'approvals',
  '/admin/messages': 'messages',
  '/admin/librarians': 'librarians',
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res: any = await api.getNotificationFeed();
      setFeed(res.data);
    } catch {
      // Badges are a convenience — never break the page over them
    }
  }, []);

  const markRead = useCallback(
    async (data: { ids?: string[]; section?: string; all?: boolean }) => {
      // Optimistic: clear the badge now, reconcile on refresh
      setFeed((f) => {
        if (!f) return f;
        const hit = (n: NotificationItem) => !n.read && (data.all || data.ids?.includes(n._id) || n.section === data.section);
        const cleared = f.items.filter(hit).length;
        return {
          ...f,
          unread: data.all ? 0 : Math.max(0, f.unread - cleared),
          sections: data.all ? {} : data.section ? { ...f.sections, [data.section]: 0 } : f.sections,
          items: f.items.map((n) => (hit(n) ? { ...n, read: true } : n)),
        };
      });
      try {
        await api.markNotificationsRead(data);
      } finally {
        refresh();
      }
    },
    [refresh]
  );

  // Poll every 30 s while the tab is visible
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const section = SEEN_ON[pathname];
    if (section && feed?.sections?.[section]) markRead({ section });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, feed?.sections?.[SEEN_ON[pathname] ?? '']]);

  const value = useMemo(() => ({ feed, refresh, markRead }), [feed, refresh, markRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** Small count pill: red for "needs attention", amber for "coming up". */
export function CountBadge({
  count,
  tone = 'red',
  className,
}: {
  count?: number;
  tone?: 'red' | 'amber' | 'muted';
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums',
        tone === 'red' && 'bg-rose-600 text-white',
        tone === 'amber' && 'bg-amber-500 text-white',
        tone === 'muted' && 'bg-white/15 text-white',
        className
      )}
      aria-label={`${count} new`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function NotificationBell() {
  const { feed, markRead } = useNotifications();
  const router = useRouter();
  const unread = feed?.unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-background">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm">
            Notifications {unread > 0 && <span className="text-muted-foreground">· {unread} new</span>}
          </DropdownMenuLabel>
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                markRead({ all: true });
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[22rem] overflow-y-auto">
          {!feed ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : feed.items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            feed.items.map((n) => (
              <DropdownMenuItem
                key={n._id}
                className={cn('flex cursor-pointer items-start gap-2.5 rounded-none px-3 py-2.5', !n.read && 'bg-primary/5')}
                onSelect={() => {
                  if (!n.read) markRead({ ids: [n._id] });
                  if (n.link) router.push(n.link);
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-rose-600')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm leading-snug', !n.read && 'font-semibold')}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
