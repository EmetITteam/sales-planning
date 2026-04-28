'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PeriodFilter } from './period-filter';
import { BarChart3, LogOut, ChevronDown, Eye, EyeOff } from 'lucide-react';

const HIDE_AMOUNTS_KEY = 'emet:hideAmounts';

const ROLE_LABELS: Record<string, string> = {
  manager: 'Менеджер',
  rm: 'Регіональний керівник',
  director: 'Директор з продажів',
};

const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-[#c5e3f6] text-[#055a91]',
  rm: 'bg-[#e8d5f5] text-[#6b21a8]',
  director: 'bg-[#fde68a] text-[#92400e]',
};

export function AppHeader() {
  const { user, setUser } = useAppStore();
  const [hideAmounts, setHideAmounts] = useState(false);

  // Init з localStorage + синхронізація з <body data-hide-amounts>
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem(HIDE_AMOUNTS_KEY) === '1';
    setHideAmounts(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.hideAmounts = hideAmounts ? 'true' : 'false';
    }
  }, [hideAmounts]);

  const toggleHideAmounts = () => {
    const next = !hideAmounts;
    setHideAmounts(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(HIDE_AMOUNTS_KEY, next ? '1' : '0');
    }
  };

  if (!user) return null;

  const initials = user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border/50">
      <div className="flex h-[56px] items-center gap-4 px-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-sm">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight hidden sm:inline bg-gradient-to-r from-[#066aab] to-[#0880cc] bg-clip-text text-transparent">
            Sales Planning
          </span>
        </div>

        <div className="w-px h-6 bg-border/60 hidden sm:block" />

        {/* Period filter */}
        <PeriodFilter />

        <div className="flex-1" />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 h-9 px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer">
            <Avatar className="h-8 w-8 shadow-sm">
              <AvatarFallback className={`text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-[13px] font-medium leading-tight">{user.fullName}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                {ROLE_LABELS[user.role]}{user.region ? ` · ${user.region}` : ''}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{user.login}</p>
              <Badge variant="secondary" className="mt-1.5 text-[10px]">{ROLE_LABELS[user.role]}</Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleHideAmounts} className="cursor-pointer">
              {hideAmounts ? (
                <>
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  Показати суми
                </>
              ) : (
                <>
                  <EyeOff className="mr-2 h-3.5 w-3.5" />
                  Сховати суми (для оперативки)
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setUser(null)} className="text-rose-600 cursor-pointer">
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Вийти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
