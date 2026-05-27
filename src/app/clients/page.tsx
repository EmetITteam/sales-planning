'use client';

/**
 * Сторінка `/clients` — «Мої клієнти» (CRM-режим менеджера).
 *
 * Доступ: будь-який залогінений користувач (manager / rm / director / admin).
 * Менеджер бачить своїх клієнтів; РМ/Director/Admin — теж своїх (override з сесії)
 * або кожен через свій profileLogin. Бекенд гарантує scope у /api/onec.
 *
 * Дані:
 *  - 1С `getManagerClients` — bulk список (категорія + телефон)
 *  - 1С `getClientReport` (lazy при кліку) — 3-міс історія + події + clientInfo
 *
 * Stage 1 (MVP): список + пошук + фільтри + accordion з 3-міс історією.
 * Stage 2 (наступний коміт): план/факт інтеграція з Supabase + getRegionData.
 */

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ClientsPage } from '@/components/clients/clients-page';

export default function ClientsRoute() {
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
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <ClientsPage />
      </main>
    </div>
  );
}
