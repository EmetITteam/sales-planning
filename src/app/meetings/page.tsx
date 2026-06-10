'use client';

/**
 * Сторінка `/meetings` — «Мої зустрічі» (Sprint 1.2, CRM-розширення).
 *
 * Доступ: будь-який залогінений (manager / rm / director / admin).
 * Менеджер бачить свої зустрічі через RLS-політики (Sprint 1.1, shadow-mode).
 *
 * Для admin/director/rm — tabs у шапці перемикають між двома view:
 *   - «Мої зустрічі» (default) — повноцінний дашборд з мутаціями
 *   - «Зустрічі команди» — read-only перегляд зустрічей підлеглих
 *
 * Дані: 1С → Supabase кеш через buffer-worker (Sprint 1.5).
 */

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { MeetingsDashboard } from '@/components/meetings/meetings-dashboard';
import { TeamMeetingsView } from '@/components/meetings/team-meetings-view';
import { CalendarDays, UsersRound } from 'lucide-react';

type View = 'mine' | 'team';

export default function MeetingsRoute() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const [view, setView] = useState<View>('mine');

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emet-50 via-white to-emet-50">
        <div className="text-[13px] text-muted-foreground animate-pulse">Перевіряю сесію…</div>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  const isPrivileged = user.role === 'admin' || user.role === 'director' || user.role === 'rm';

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
        {isPrivileged && (
          <div className="mb-4 flex gap-1.5 bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-1.5 shadow-[0_4px_14px_rgba(6,42,61,0.04)] w-fit">
            <TabButton
              active={view === 'mine'}
              onClick={() => setView('mine')}
              icon={<CalendarDays className="w-4 h-4" />}
              label="Мої зустрічі"
            />
            <TabButton
              active={view === 'team'}
              onClick={() => setView('team')}
              icon={<UsersRound className="w-4 h-4" />}
              label="Зустрічі команди"
            />
          </div>
        )}

        {view === 'team' && isPrivileged ? <TeamMeetingsView /> : <MeetingsDashboard />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-semibold transition-all ${
        active
          ? 'bg-emet-blue text-white shadow-sm'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
