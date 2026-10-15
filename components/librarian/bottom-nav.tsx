'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Armchair,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BottomNavTab {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match only this exact path (for a section root that prefixes every route) */
  exact?: boolean;
}

const LIBRARIAN_TABS: BottomNavTab[] = [
  { label: 'Home', href: '/librarian', icon: LayoutDashboard, exact: true },
  { label: 'Students', href: '/librarian/students', icon: Users },
  { label: 'Seats', href: '/librarian/seats', icon: Armchair },
  { label: 'Attendance', href: '/librarian/attendance', icon: ClipboardCheck },
];

/**
 * Mobile-only tab bar for the main sections; "More" opens the full sidebar.
 * Defaults to the librarian tabs; `className` sets the breakpoint it hides at
 * and any positioning the host layout needs.
 */
export function BottomNav({
  onMore,
  tabs = LIBRARIAN_TABS,
  className = 'md:hidden',
}: {
  onMore: () => void;
  tabs?: BottomNavTab[];
  className?: string;
}) {
  const pathname = usePathname();

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <nav
      aria-label="Main"
      className={cn(
        'shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      <div className="flex h-16 items-stretch">
        {tabs.map(({ label, href, icon: Icon, exact }) => {
          // A longer tab that also matches wins, e.g. /admin/librarians/pending
          const active = exact
            ? pathname === href
            : (pathname === href || pathname.startsWith(href + '/')) &&
              !tabs.some(
                (t) =>
                  t.href.length > href.length &&
                  (pathname === t.href || pathname.startsWith(t.href + '/'))
              );
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={itemClass(active)}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              {label}
            </Link>
          );
        })}
        <button type="button" onClick={onMore} className={itemClass(false)}>
          <Menu className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
