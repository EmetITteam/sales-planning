'use client';

import { useOneCData } from './use-onec-data';

/**
 * Кешований хук для `getRegistryPlans` (Action 4).
 *
 * Раніше мав власний Zustand-кеш per-period — тепер делегує useOneCData
 * (на SWR). SWR ключем по `{action}|{payload}` дедуплікує і кешує сам.
 */
export function useRegistryPlans(dateFrom: string | null, dateTo: string | null, login?: string | null) {
  const shouldFetch = !!dateFrom && !!dateTo;
  const loginLower = (login ?? '').toLowerCase().trim();
  // Auto-retry для cold-start 1С (повернуто 2026-05-18 після скарг user
  // «не з першого разу прогружається»). 1С іноді повертає plans=[] на
  // першому запиті після login → 3 спроби з backoff 1.2/2.5/5 сек.
  //
  // ⚠️ Якщо передано `login` — «порожньо» означає «немає плану САМЕ для цього
  // менеджера». При cold-start 1С інколи віддає плани ІНШИХ менеджерів раніше
  // за цього (глобально не порожньо, але для нас порожньо) → без цього retry
  // не спрацьовував і план показувався $0 (manager-dashboard + /clients).
  return useOneCData(
    'getRegistryPlans',
    shouldFetch ? { dateFrom: dateFrom!, dateTo: dateTo! } : null,
    {
      isEmptyResponse: (r) => {
        if (!r?.plans || r.plans.length === 0) return true;
        if (loginLower) return !r.plans.some(p => (p.managerLogin || '').toLowerCase().trim() === loginLower);
        return false;
      },
    },
  );
}
