'use client';

/**
 * Сторінка `/claims/new` — тимчасова обгортка для тестування модалки.
 *
 * У продакшені модалка викликається з:
 *  - картки клієнта (`/clients`) — Sprint C
 *  - картки зустрічі (`/meetings`) — Sprint C
 *  - тулбара списку претензій (`/claims`) — Sprint B
 *
 * Зараз: одразу відкривається модалка при відкритті сторінки. При закритті —
 * повертаємось назад.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ClaimFormDialog } from '@/components/claims/claim-form-dialog';

export default function NewClaimRoute() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  // open початково true якщо user уже є (поширений сценарій після bootstrap).
  // Render-phase reaction на пізнішу появу user — без effect.
  const [open, setOpen] = useState(!!user);
  const [prevUser, setPrevUser] = useState(user);
  if (prevUser !== user) {
    setPrevUser(user);
    if (user) setOpen(true);
  }

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
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <p className="text-[14px] text-muted-foreground">
              Форма створення рекламації
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white font-semibold text-[14px] shadow-md hover:shadow-lg transition-shadow"
            >
              Відкрити форму
            </button>
          </div>
        </div>
      </main>

      <ClaimFormDialog
        open={open}
        onClose={() => {
          setOpen(false);
          router.back();
        }}
        onCreated={(id, link) => {
          // На Sprint A — просто алерт. У Sprint B → редірект на /claims/[id].
          console.log('[claim created]', id, link);
        }}
      />
    </div>
  );
}
