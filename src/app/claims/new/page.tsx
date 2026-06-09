'use client';

/**
 * Сторінка `/claims/new` — створити нову претензію (Sprint 2B, Reclamations).
 *
 * Доступ: будь-який залогінений (manager / rm / director / admin).
 * Submit веде у Bitrix24 SPA 1038 — наш `/api/claims` route.
 *
 * Sprint A — базова форма без файлів (file upload додаємо у Sprint A.4).
 */

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ClaimForm } from '@/components/claims/claim-form';

export default function NewClaimRoute() {
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
      <main className="flex-1 p-4 md:p-6 max-w-[760px] mx-auto w-full">
        <ClaimForm />
      </main>
    </div>
  );
}
