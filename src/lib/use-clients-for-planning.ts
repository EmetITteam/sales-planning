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
  // Auto-retry для cold-start (повернуто 2026-05-18).
  return useOneCData(
    'getClientsForPlanning',
    shouldFetch ? { login: login! } : null,
    { isEmptyResponse: (r) => !r?.clients || r.clients.length === 0 },
  );
}
