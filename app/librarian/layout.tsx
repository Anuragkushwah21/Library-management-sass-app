// app/librarian/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserRole, isAuthenticated, getStoredUser } from '@/lib/api';
import { Sidebar } from '@/components/librarian/sidebar';
import { TopNav } from '@/components/librarian/top-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Loader2, Menu } from 'lucide-react';

export default function LibrarianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
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
            <ThemeToggle />
            <TopNav user={user} />
          </div>
        </header>

        {/* Scrollable main */}
        <main className="flex-1 overflow-y-auto bg-muted/40">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}