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
  // ⚠️ Day 14: тимчасово зняли isEmptyResponse — підозра що auto-retry
  // у combination з SWR mutate створює нестабільний стан коли 1С
  // повертає не-empty respondse але hook трактує його як empty (можливо
  // через timing setRetryAttempt / mutate). Відкочуємо до простого hook
  // поки не діагностовано.
  return useOneCData(
    'getRegistryPlans',
    shouldFetch ? { dateFrom: dateFrom!, dateTo: dateTo! } : null,
  );
}
