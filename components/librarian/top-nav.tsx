'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { clearAuthData } from '@/lib/api';

interface TopNavProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

/**
 * Sirf user menu — apna header bar render nahi karta. Layout ise apne header
 * ke andar place karta hai (pehle yeh khud `h-16` bar tha aur layout ise do
 * baar render karta tha, jisse nested/duplicate headers ban rahe the).
 */
export function TopNav({ user }: TopNavProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await clearAuthData();
    router.push('/login');
  };

  const label = user?.name || user?.email || 'Account';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[60vw]">
          <User className="w-4 h-4 shrink-0" />
          {/* Lamba email chhoti screen par layout na toade */}
          <span className="truncate hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 sm:hidden">
          <p className="text-sm font-medium truncate">{label}</p>
        </div>
        <DropdownMenuSeparator className="sm:hidden" />

        <DropdownMenuItem onClick={() => router.push('/librarian/account')}>
          Account
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => router.push('/librarian/settings')}>
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
