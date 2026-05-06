'use client';

import { useOneCData } from './use-onec-data';

/**
 * Кешований хук для `getRegistryPlans` (Action 4).
 *
 * Раніше мав власний Zustand-кеш per-period — тепер делегує useOneCData
 * (на SWR). SWR ключем по `{action}|{payload}` дедуплікує і кешує сам.
 */
export function useRegistryPlans(dateFrom: string | null, dateTo: string | null) {
  const shouldFetch = !!dateFrom && !!dateTo;
  return useOneCData(
    'getRegistryPlans',
    shouldFetch ? { dateFrom: dateFrom!, dateTo: dateTo! } : null,
  );
}
