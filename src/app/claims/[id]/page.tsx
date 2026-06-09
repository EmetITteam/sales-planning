'use client';

/**
 * Сторінка `/claims/[id]` — деталі однієї претензії + чат з мед-відділом (Sprint B).
 */

import { useParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ClaimDetailView } from '@/components/claims/claim-detail-view';

export default function ClaimDetailRoute() {
  const params = useParams();
  const id = Number(params?.id);
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

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1 p-6 max-w-[800px] mx-auto w-full">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
            Невірний ID претензії
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[800px] mx-auto w-full">
        <ClaimDetailView claimId={id} />
      </main>
    </div>
  );
}
