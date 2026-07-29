// components/admin/sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Armchair,
  CreditCard,
  Megaphone,
  X,
  UserCircle,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';

const navItems = [
  { label: 'Dashboard', href: '/librarian', icon: LayoutDashboard },
  { label: 'All Students', href: '/librarian/students', icon: Users },
  { label: 'Memberships', href: '/librarian/membership', icon: CreditCard },
  { label: 'Add Student', href: '/librarian/students/add', icon: Users },
  { label: 'Seats', href: '/librarian/seats', icon: Armchair },
  { label: 'Books Issue', href: '/librarian/books', icon: BookOpen },
  { label: 'Send Offer', href: '/librarian/offers', icon: Megaphone },

  // New items
  { label: 'Account', href: '/librarian/account', icon: UserCircle },
  { label: 'Settings', href: '/librarian/settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;      // mobile ke liye
  onClose?: () => void; // mobile: overlay / link / X pe call
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'bg-slate-900 text-white flex flex-col border-r border-slate-700 w-64',
        // Mobile: off-canvas drawer jo slide hoke aata hai
        'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // md+: normal flow me, hamesha visible, shrink nahi hota
        'md:static md:translate-x-0 md:z-auto md:h-screen md:shrink-0'
      )}
    >
      {/* Header + close button */}
      <div className="flex items-center justify-between gap-2 p-5 border-b border-slate-700">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={36} priority />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight">
              Library Mgmt
            </h1>
            <p className="text-xs text-slate-400">Librarian Dashboard</p>
          </div>
        </div>
        <button
          className="md:hidden p-1 rounded hover:bg-slate-800"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              )}
              onClick={onClose}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-400">Admin Dashboard v1.0</p>
      </div>
    </aside>
  );
}