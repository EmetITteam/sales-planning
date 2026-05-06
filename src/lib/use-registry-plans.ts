'use client';

import { useEffect } from 'react';
import { useAppStore } from './store';
import { useOneCData } from './use-onec-data';

/**
 * Кешований хук для `getRegistryPlans` (Action 4).
 *
 * Метод повертає плани по ВСІХ менеджерах за період — спільний для всіх
 * ролей у тому самому місяці. Кеш ключем по `{dateFrom}-{dateTo}` живе
 * у пам'яті до закриття вкладки (як `useClientsForPlanning`).
 *
 * Без кешу: кожен дашборд (manager/RM/director) робив новий fetch у 1С
 * при кожному mount — марно. Тут — один виклик, потім миттєво.
 */
export function useRegistryPlans(dateFrom: string | null, dateTo: string | null) {
  const cacheKey = dateFrom && dateTo ? `${dateFrom}|${dateTo}` : null;
  const cached = useAppStore(s => cacheKey ? s.plansByPeriod[cacheKey] : undefined);
  const setCache = useAppStore(s => s.setPlansForPeriod);

  const shouldFetch = !!cacheKey && !cached;
  const { data, loading, error, refetch: refetchInner } = useOneCData(
    'getRegistryPlans',
    shouldFetch && dateFrom && dateTo ? { dateFrom, dateTo } : null,
  );

  useEffect(() => {
    if (data && cacheKey) setCache(cacheKey, data);
  }, [data, cacheKey, setCache]);

  return {
    data: cached ?? data,
    loading: shouldFetch ? loading : false,
    error,
    refetch: () => {
      if (cacheKey) setCache(cacheKey, undefined);
      refetchInner();
    },
  };
}
