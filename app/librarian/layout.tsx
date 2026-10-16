// app/librarian/layout.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  api,
  getUserRole,
  isAuthenticated,
  getStoredUser,
  clearAuthData,
  ACCESS_LOCKED_EVENT,
} from '@/lib/api';
import {
  LockedScreen,
  TrialBanner,
  type AccessState,
} from '@/components/librarian/access-gate';
import { Sidebar } from '@/components/librarian/sidebar';
import { TopNav } from '@/components/librarian/top-nav';
import { BottomNav } from '@/components/librarian/bottom-nav';
import { NotificationBell, NotificationsProvider, useNotifications } from '@/components/notifications';
import { ThemeToggle } from '@/components/theme-toggle';
import { Loader2, Menu } from 'lucide-react';

export default function LibrarianLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <LibrarianShell>{children}</LibrarianShell>
    </NotificationsProvider>
  );
}

function LibrarianShell({ children }: { children: React.ReactNode }) {
  const { feed } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ name?: string | null; email?: string | null } | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAuth = () => {
      if (!isAuthenticated()) {
        router.replace('/login');
        return;
      }

      const role = getUserRole();
      if (role !== 'librarian' && role !== 'admin') {
        router.replace('/login');
        return;
      }

      // localStorage me se user object nikaalo
      const stored = getStoredUser();
      if (stored) {
        setUser({
          name: stored.name ?? null,
          email: stored.email ?? null,
        });
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  // Trial / approval state decides between the dashboard and the lock screen
  const loadAccess = useCallback(async () => {
    try {
      const res = await api.getAccessStatus();
      setAccessState(res.data);
      setAccessError(null);
    } catch (err: any) {
      setAccessError(err?.message || 'Could not load your account status.');
      // Session gone (expired token, account deactivated) → back to login
      if (/token|not found|inactive/i.test(err?.message || '')) {
        await clearAuthData();
        router.replace('/login');
      }
    }
  }, [router]);

  // Re-checked on every navigation so a trial ending mid-session locks promptly
  useEffect(() => {
    if (!isLoading) loadAccess();
  }, [isLoading, pathname, loadAccess]);

  useEffect(() => {
    const onLocked = () => loadAccess();
    window.addEventListener(ACCESS_LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(ACCESS_LOCKED_EVENT, onLocked);
  }, [loadAccess]);

  const handleLogout = async () => {
    await clearAuthData();
    router.push('/login');
  };

  if (!accessState && accessError && !isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">{accessError}</p>
        <button
          onClick={loadAccess}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isLoading || !accessState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!accessState.access.hasAccess) {
    return (
      <LockedScreen
        state={accessState}
        onRefresh={loadAccess}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile overlay — sidebar (z-50) ke neeche rehna chahiye */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content area — min-w-0 zaroori hai warna chaudi tables
          flex item ko stretch kar deti hain aur page horizontally scroll hota hai */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Single header bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
          <button
            className="md:hidden -ml-1 p-2 rounded hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="truncate text-base md:text-lg font-semibold">
            Librarian Dashboard
          </span>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <TopNav user={user} />
          </div>
        </header>

        <TrialBanner state={accessState} onChanged={loadAccess} />

        {/* Scrollable main */}
        <main className="flex-1 overflow-y-auto bg-muted/40">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>

        {/* Mobile tab bar — sits below main in the flex column, so content never hides behind it */}
        <BottomNav
          onMore={() => setSidebarOpen(true)}
          badges={{ '/librarian/students': feed?.sections?.students ?? 0 }}
          moreBadge={feed?.counts?.expiringSoon ?? 0}
        />
      </div>
    </div>
  );
}