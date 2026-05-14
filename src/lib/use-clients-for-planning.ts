'use client';

import { useOneCData } from './use-onec-data';

/**
 * Кешований хук для `getClientsForPlanning`.
 *
 * Раніше мав власний Zustand-кеш — тепер делегує useOneCData (на SWR).
 * SWR обробляє dedup, кеш, revalidate-on-focus і refetch автоматично.
 */
export function useClientsForPlanning(login: string | null) {
  const shouldFetch = !!login && login !== 'anonymous';
  // ⚠️ Day 14: тимчасово зняли isEmptyResponse — див. use-registry-plans.ts.
  return useOneCData(
    'getClientsForPlanning',
    shouldFetch ? { login: login! } : null,
  );
}
