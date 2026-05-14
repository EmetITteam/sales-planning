'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { callOneC, OneCError, OneCNetworkError } from './onec-client';
import { useAppStore } from './store';
import type { OneCAction, OneCActionMap } from './onec-types';

interface UseOneCDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseOneCDataOptions<T> {
  /**
   * Auto-retry callback (Day 14 backlog #4, 2026-05-14).
   * Якщо повертає `true` для отриманих даних — hook автоматично робить
   * до 3 retries з backoff 1.2s / 2.5s / 5s. Поки йде retry — `loading`
   * залишається true (щоб UI не блимав «нема даних» / «є дані» поки 1С
   * cold-starts).
   *
   * Типовий приклад: 1С Action 5 повертає `{regions: []}` на першому
   * запиті після login → isEmpty: r => r.regions.length === 0.
   */
  isEmptyResponse?: (data: T) => boolean;
}

/**
 * Хук для виклику 1С action — обгортка над SWR.
 *
 * Виграш від SWR:
 *  - Dedup: один paralelle виклик навіть якщо хук монтується у 5 місцях.
 *  - Cache: повторний mount з тим самим key = миттєва віддача з кешу.
 *  - Revalidate-on-focus: повертаючись на вкладку, дані оновлюються.
 *  - Revalidate-on-reconnect: після втрати мережі — оновлення.
 *  - Власне race-handling (попередні запити автоматично abort'яться).
 *
 * Якщо payload === null → fetch не робиться (для умовних викликів).
 *
 * Cache key — JSON.stringify payload, тож зміна payload (наприклад іншій
 * період) тригерить новий запит автоматично.
 *
 * Auto-retry (options.isEmptyResponse): якщо 1С повернула «порожньо» на
 * cold start, hook сам повторно дзвонить з експоненціальним backoff.
 */
export function useOneCData<A extends OneCAction>(
  action: A,
  payload: OneCActionMap[A]['request'] | null,
  options?: UseOneCDataOptions<OneCActionMap[A]['response']>,
): UseOneCDataResult<OneCActionMap[A]['response']> {
  const liveMode = useAppStore(s => s.liveMode);
  const key = payload ? `onec|${action}|${JSON.stringify(payload)}` : null;

  const { data, error, isLoading, mutate } = useSWR(
    key,
    async () => {
      // payload не null коли key не null — це гарантує SWR (не викликає fetcher якщо key null)
      return callOneC(action, payload!);
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      // У live-режимі користувач очікує «зараз» — короткий dedup (30с).
      // У звітному — 5хв (дані за минулий тиждень/місяць не змінюються).
      dedupingInterval: liveMode ? 30_000 : 300_000,
    },
  );

  // Auto-retry для cold-start 1С (Day 14 #4). До 3 спроб з backoff.
  // Reset counter коли змінюється key (новий запит = нова логіка retry).
  const [retryAttempt, setRetryAttempt] = useState(0);
  useEffect(() => { setRetryAttempt(0); }, [key]);
  const isEmptyData = !!options?.isEmptyResponse && !!data && options.isEmptyResponse(data);
  const isAutoRetrying = isEmptyData && !error && retryAttempt < 3;
  useEffect(() => {
    if (!isAutoRetrying || isLoading) return;
    const delay = retryAttempt === 0 ? 1200 : retryAttempt === 1 ? 2500 : 5000;
    const t = setTimeout(() => {
      setRetryAttempt(n => n + 1);
      mutate();
    }, delay);
    return () => clearTimeout(t);
  }, [isAutoRetrying, isLoading, retryAttempt, mutate]);

  return {
    data: data ?? null,
    // loading=true поки йде SWR fetch АБО поки auto-retry чекає — UI не
    // блимає «нема даних» між невдалою першою спробою та successful retry.
    loading: isLoading || isAutoRetrying,
    error: error ? formatError(error) : null,
    refetch: () => { setRetryAttempt(0); mutate(); },
  };
}

function formatError(err: unknown): string {
  if (err instanceof OneCError) return `1С: ${err.message}`;
  if (err instanceof OneCNetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Невідома помилка';
}
