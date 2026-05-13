'use client';

import { Lock } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { FEATURES, isPlanningWritesAllowed } from '@/lib/feature-flags';

/**
 * Спільний банер «Триває оновлення системи».
 *
 * Показується усім крім адміна (`ADMIN_LOGINS`) поки активний
 * `FEATURES.PLANNING_DISABLED`. Має бути у кожному корінному дашборді
 * (manager / rm / director) + у формі планування — менеджер має бачити
 * стан з будь-якого екрану, не тільки з форми.
 *
 * ⚠️ ТИМЧАСОВИЙ компонент Пакету А Етапу 0 (2026-05-13). Видалити
 * разом з `PLANNING_DISABLED` коли window-lock перебере контроль (Етап 3).
 */
export function MaintenanceBanner() {
  const { user } = useAppStore();
  const isLocked = FEATURES.PLANNING_DISABLED && !isPlanningWritesAllowed(user?.login);
  if (!isLocked) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <Lock className="h-4 w-4 text-amber-700" />
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-bold text-amber-900">Триває оновлення системи</p>
        <p className="text-[13px] text-amber-800 mt-0.5">
          Планування тимчасово недоступне. Ви можете переглядати дані, але збереження змін заблоковано. Доступ буде відновлено після оновлення.
        </p>
      </div>
    </div>
  );
}
