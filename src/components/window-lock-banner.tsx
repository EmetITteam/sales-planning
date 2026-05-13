'use client';

import { Lock } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useWindowStatus } from '@/lib/use-window-status';

/**
 * Спільний банер «Планування зараз закрите» (Пакет А Етап 3, 2026-05-13).
 *
 * Показується менеджеру / РМ / Director-у коли window-lock блокує
 * поточний місяць (window_days вичерпано, global-block або user-block).
 * Admin завжди отримує allowed=true з backend → банер не з'являється.
 *
 * Має бути у кожному корінному дашборді + у формі планування — менеджер
 * має бачити стан з будь-якого екрану.
 */
export function WindowLockBanner() {
  const { user, currentPeriod } = useAppStore();
  const { status } = useWindowStatus(
    currentPeriod?.month ?? null,
    user?.login ?? null,
  );

  if (!status || status.allowed) return null;

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
        <Lock className="h-4 w-4 text-rose-700" />
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-bold text-rose-900">Планування зараз закрите</p>
        <p className="text-[13px] text-rose-800 mt-0.5">
          {status.message} Зверніться до адміністратора якщо потрібен доступ.
        </p>
      </div>
    </div>
  );
}
