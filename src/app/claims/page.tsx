'use client';

/**
 * Сторінка `/claims` — список претензій менеджера (Sprint B).
 *
 * Доступ: будь-який залогінений. Pull з Bitrix24 SPA 1038 фільтр по
 * `manager_email = session.login`.
 */

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ClaimsList } from '@/components/claims/claims-list';

export default function ClaimsRoute() {
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
      <main className="flex-1 p-4 md:p-6 max-w-[960px] mx-auto w-full">
        <ClaimsList />
      </main>
    </div>
  );
}
