'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSWRConfig } from 'swr';
import { useAppStore } from '@/lib/store';
import { useGlassHover } from '@/hooks/use-glass-hover';
import { apiLogout } from '@/lib/auth-client';
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
import { monthlyPeriodMeta } from '@/lib/periods';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, ChevronDown, Eye, EyeOff, Zap, Shield, Users, Calendar } from 'lucide-react';

const HIDE_AMOUNTS_KEY = 'emet:hideAmounts';

const ROLE_LABELS: Record<string, string> = {
  manager: 'Менеджер',
  rm: 'Регіональний керівник',
  director: 'Директор з продажів',
  admin: 'Адміністратор системи',
};

// Login-based override для конкретних осіб з рівнем доступу директора, але
// іншим формальним підписом (асистент, аудитор, власник тощо).
const LOGIN_LABEL_OVERRIDES: Record<string, string> = {
  'assistant.sdu@emet.in.ua': 'Асистент директора з продажу',
  'owner@emet.in.ua': 'Власник компанії',
  'headofproduct@emet.in.ua': 'Керівник відділу продукта',
};

function getRoleLabel(login: string, role: string): string {
  return LOGIN_LABEL_OVERRIDES[login.toLowerCase().trim()] ?? ROLE_LABELS[role] ?? role;
}

const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-emet-100 text-emet-blue-dark',
  rm: 'bg-[#e8d5f5] text-[#6b21a8]',
  director: 'bg-[#fde68a] text-[#92400e]',
  admin: 'bg-[#fecaca] text-[#991b1b]',
};

export function AppHeader() {
  const { user, setUser, liveMode, setLiveMode, activeView, setActiveView, setCurrentPeriod } = useAppStore();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const pathname = usePathname();
  const isOnClientsPage = pathname?.startsWith('/clients') ?? false;
  // Cursor-following gradient на всіх glass-card. Один document listener.
  useGlassHover();
  const handleLogout = async () => {
    // Спершу серверна частина — clear HttpOnly cookie. Потім локальний state.
    await apiLogout();
    // Очистити SWR-кеш — інакше наступний логін бачить дані попереднього
    // користувача (per-login key переключиться, але старий ключ лишився).
    mutate(() => true, undefined, { revalidate: false });
    setUser(null);
  };

  // Глобальний listener для 'emet:session-expired' (диспатчиться з callOneC
  // при 401/403). Показуємо чистий модал + auto-logout — щоб користувач НЕ
  // бачив JSON dump «HTTP 401: {status:error,message:Unauthorized}».
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener('emet:session-expired', handler);
    return () => window.removeEventListener('emet:session-expired', handler);
  }, []);
  const handleSessionExpiredOk = async () => {
    setSessionExpired(false);
    await handleLogout();
  };
  // Lazy init з localStorage — без useEffect+setState (cascading render).
  // SSR-safe: на сервері window нема → завжди false; перший render у браузері
  // одразу читає правильне значення.
  const [hideAmounts, setHideAmounts] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(HIDE_AMOUNTS_KEY) === '1';
  });

  // Синхронізація з <body data-hide-amounts> — сюди setState не входить.
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
    <>
    <header className="sticky top-0 z-50 bg-white/55 backdrop-blur-xl backdrop-saturate-150 border-b border-white/50 shadow-[0_4px_24px_rgba(6,42,61,0.04)]">
      <div className="flex h-[56px] items-center gap-2 sm:gap-3 px-3 sm:px-5 min-w-0">
        {/* Logo: EMET-знак + назва продукту */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* -translate-y: акцент над «e» зверху тягне геом-центр глифа вгору,
              тож «e»-тіло візуально сидить нижче тексту — компенсуємо нуджем. */}
          <img src="/emet-mark.svg" alt="EMET" className="h-8 w-auto object-contain -translate-y-[3px]" />
          {/* Logo wordmark — solid ink + accent dot замість gradient text.
              Gradient на 15px Windows/Chrome губить anti-aliasing (audit). */}
          <span className="text-[15px] font-semibold tracking-tight hidden xl:flex items-center gap-1.5 text-[#081E2D] translate-y-[2px] whitespace-nowrap">
            Планування продажів
            <span className="w-1 h-1 rounded-full bg-emet-blue" />
          </span>
        </div>

        <div className="w-px h-6 bg-border/60 hidden xl:block" />

        {/* Period filter — приглушений у live-режимі */}
        <div className={`shrink-0 ${liveMode ? 'opacity-50 pointer-events-none' : ''}`}>
          <PeriodFilter />
        </div>

        {/* Live toggle — миттєвий перегляд "на сьогодні".
            При активації окрім liveMode перемикаємо період на поточний місяць,
            інакше пілюля «LIVE · <сьогодні>» сперечається з даними попереднього
            місяця (бо період stays там де користувач його лишив). */}
        <button
          onClick={() => {
            const next = !liveMode;
            setLiveMode(next);
            if (next) {
              const now = new Date();
              const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              const meta = monthlyPeriodMeta(`${monthStr}-01`);
              setCurrentPeriod({ ...meta, isActive: true });
            }
          }}
          className={`inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3.5 rounded-full border text-[12px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            liveMode
              ? 'bg-amber-50/70 backdrop-blur-md border-amber-300/70 text-amber-700 shadow-sm'
              : 'bg-white/60 backdrop-blur-md border-white/50 text-muted-foreground hover:border-amber-200 hover:text-amber-700'
          }`}
          title={liveMode ? 'Перейти на звітний фільтр' : 'Перегляд "на сьогодні" (read-only)'}
          aria-label="На сьогодні"
        >
          <Zap className={`h-3.5 w-3.5 ${liveMode ? 'fill-amber-400' : ''}`} />
          {/* На мобільному — лише іконка; підпис ховаємо щоб помістився avatar */}
          <span className="hidden sm:inline">На сьогодні</span>
        </button>

        {liveMode && (
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-amber-500/12 border border-amber-300/40 text-amber-800 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
            <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b]" />
            LIVE · {new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'long' })}
          </span>
        )}

        {/* Route toggle «Планування ↔ Мої клієнти» — для manager + RM.
            Admin/Director мають свій view-toggle Планування/Огляд нижче,
            до /clients вони ходять через user-dropdown. */}
        {(user.role === 'manager' || user.role === 'rm') && (
          <div className="hidden md:inline-flex items-center gap-1 h-9 bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/50 ml-2 shrink-0">
            <button
              onClick={() => router.push('/')}
              className={`inline-flex items-center h-7 px-4 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                !isOnClientsPage
                  ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Планування
            </button>
            <button
              onClick={() => router.push('/clients')}
              className={`inline-flex items-center h-7 px-4 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isOnClientsPage
                  ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Мої клієнти
            </button>
          </div>
        )}

        {/* View toggle — для admin завжди, для решти — за canViewCompanyOverview */}
        {(user.role === 'admin' || user.canViewCompanyOverview === true) && (
          <div className="hidden md:inline-flex items-center gap-1 h-9 bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/50 ml-2 shrink-0">
            <button
              onClick={() => setActiveView('planning')}
              className={`inline-flex items-center h-7 px-4 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeView === 'planning'
                  ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Планування
            </button>
            <button
              onClick={() => setActiveView('company-overview')}
              className={`inline-flex items-center h-7 px-4 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeView === 'company-overview'
                  ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Огляд компанії
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 sm:gap-2.5 h-9 px-1.5 sm:px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer shrink-0 ml-auto">
            <Avatar className="h-8 w-8 shadow-sm shrink-0">
              <AvatarFallback className={`text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden xl:flex flex-col items-start">
              <span className="text-[13px] font-medium leading-tight whitespace-nowrap">{user.fullName}</span>
              <span className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                {getRoleLabel(user.login, user.role)}{user.region ? ` · ${user.region}` : ''}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{user.login}</p>
              <Badge variant="secondary" className="mt-1.5 text-[10px]">{getRoleLabel(user.login, user.role)}</Badge>
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
            <DropdownMenuItem onClick={() => router.push('/clients')} className="cursor-pointer">
              <Users className="mr-2 h-3.5 w-3.5" />
              Мої клієнти
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/meetings')} className="cursor-pointer">
              <Calendar className="mr-2 h-3.5 w-3.5" />
              Зустрічі
            </DropdownMenuItem>
            {user.role === 'admin' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/admin')} className="cursor-pointer">
                  <Shield className="mr-2 h-3.5 w-3.5" />
                  Адмін-панель
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-rose-600 cursor-pointer">
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Вийти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile sub-bar — перемикач розділів. На десктопі ці toggle живуть у
          верхньому рядку (hidden md:flex); на мобільному їх там немає (тісно),
          тому виносимо у власний повноширинний рядок під шапкою (md:hidden). */}
      {(user.role === 'manager' || user.role === 'rm') && (
        <div className="md:hidden flex gap-1 mx-4 mb-2 p-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50">
          <button
            onClick={() => router.push('/')}
            className={`flex-1 inline-flex items-center justify-center h-9 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
              !isOnClientsPage
                ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                : 'text-muted-foreground'
            }`}
          >
            Планування
          </button>
          <button
            onClick={() => router.push('/clients')}
            className={`flex-1 inline-flex items-center justify-center h-9 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
              isOnClientsPage
                ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                : 'text-muted-foreground'
            }`}
          >
            Мої клієнти
          </button>
        </div>
      )}

      {(user.role === 'admin' || user.canViewCompanyOverview === true) && (
        <div className="md:hidden flex gap-1 mx-4 mb-2 p-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50">
          <button
            onClick={() => setActiveView('planning')}
            className={`flex-1 inline-flex items-center justify-center h-9 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
              activeView === 'planning'
                ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                : 'text-muted-foreground'
            }`}
          >
            Планування
          </button>
          <button
            onClick={() => setActiveView('company-overview')}
            className={`flex-1 inline-flex items-center justify-center h-9 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
              activeView === 'company-overview'
                ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
                : 'text-muted-foreground'
            }`}
          >
            Огляд компанії
          </button>
        </div>
      )}
    </header>
    {/* Session-expired modal — портал у document.body, бо <header> має
        backdrop-blur і створює новий containing-block для fixed-нащадків.
        Без порталу модал прив'язувався б до бара хедера як стрічка. */}
    {sessionExpired && typeof document !== 'undefined' && createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      >
        <div className="glass-card max-w-md w-[90%] p-6 mx-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <LogOut className="h-5 w-5" />
            </div>
            <h2 id="session-expired-title" className="text-[15px] font-bold">Сесія завершилась</h2>
          </div>
          <p className="text-[13px] text-muted-foreground mb-5">
            Час вашого сеансу закінчився або ви вийшли з системи в іншій вкладці. Увійдіть знову, щоб продовжити роботу.
          </p>
          <button
            type="button"
            onClick={handleSessionExpiredOk}
            autoFocus
            className="w-full h-10 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] font-semibold shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
          >
            Увійти знову
          </button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
