'use client';

/**
 * Сторінка `/meetings` — «Мої зустрічі» (Sprint 1.2, CRM-розширення).
 *
 * Доступ: будь-який залогінений (manager / rm / director / admin).
 * Менеджер бачить свої зустрічі через RLS-політики (Sprint 1.1, shadow-mode).
 *
 * Дані: поки mock (`src/lib/meetings/mock-data.ts`). Реальний sync через
 * Supabase + 1С buffer-worker — Sprint 1.5.
 */

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { MeetingsDashboard } from '@/components/meetings/meetings-dashboard';

export default function MeetingsRoute() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emet-50 via-white to-emet-50">
        <div className="text-[13px] text-muted-foreground animate-pulse">Перевіряю сесію…</div>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
        <MeetingsDashboard />
      </main>
    </div>
  );
}
