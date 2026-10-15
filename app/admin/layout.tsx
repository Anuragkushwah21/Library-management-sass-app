'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  User,
  BookOpen,
  Mail,
  CreditCard,
  Megaphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, getStoredUser, clearAuthData, isAdmin } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { BottomNav, type BottomNavTab } from '@/components/librarian/bottom-nav';

// Main sections for the mobile tab bar; the rest stay under "More"
const bottomTabs: BottomNavTab[] = [
  { label: 'Home', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Approvals', href: '/admin/librarians/pending', icon: UserCheck },
  { label: 'Librarians', href: '/admin/librarians', icon: Users },
  { label: 'Plans', href: '/admin/plans', icon: CreditCard },
];

const sidebarLinks = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/librarians/pending',
    label: 'Pending Approvals',
    icon: UserCheck,
  },
  {
    href: '/admin/librarians',
    label: 'All Librarians',
    icon: Users,
  },
  {
    href: '/admin/plans',
    label: 'Plans & Trial',
    icon: CreditCard,
  },
  {
    href: '/admin/ads',
    label: 'Advertisements',
    icon: Megaphone,
  },
  {
    href: '/admin/messages',
    label: 'Librarians Messages',
    icon: Mail,
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: Settings,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check authentication
    const currentUser = getStoredUser();

    if (!currentUser) {
      router.push('/login');
      return;
    }

    // Check if admin
    if (currentUser.role !== 'admin') {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access this page',
        variant: 'destructive',
      });
      router.push('/login');
      return;
    }

    setUser(currentUser);
    setIsLoading(false);
  }, [router, toast]);

  const handleLogout = async () => {
    await clearAuthData();
    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out',
    });
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-border">
          <Logo size={34} priority />
          <span className="truncate font-bold text-lg">Admin Panel</span>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {sidebarLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
              >
                <link.icon className="w-5 h-5" />
                <span className="font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 bg-card border-b border-border px-4 lg:px-6 flex items-center justify-between">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>

          {/* Page Title (Desktop) */}
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold">
              {sidebarLinks.find((link) => link.href === pathname)?.label ||
                'Dashboard'}
            </h1>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1 sm:gap-3 ml-auto">
            <ThemeToggle />

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user?.profileImage} />
                    <AvatarFallback>
                      {user?.name?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:block font-medium">
                    {user?.name || 'Admin'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-semibold">{user?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/profile">
                    <User className="w-4 h-4 mr-2" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/admin/settings">
                    <Settings className="w-4 h-4 mr-2" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        {/* Bottom padding keeps content clear of the fixed mobile tab bar */}
        <main className="p-4 pb-24 lg:p-6">{children}</main>
      </div>

      <BottomNav
        tabs={bottomTabs}
        onMore={() => setIsSidebarOpen(true)}
        className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      />
    </div>
  );
}