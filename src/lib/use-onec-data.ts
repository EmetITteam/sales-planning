'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { callOneC, OneCError, OneCNetworkError, SessionExpiredError } from './onec-client';
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

  // Auto-retry для cold-start 1С (Day 14 #4). Дві фази:
  //  Phase 1 (fast): 5 швидких спроб з backoff 1→2→4→6→8с. Покриває типовий
  //    cold-start window (warm worker встигає за ~20с).
  //  Phase 2 (background poll): якщо все ще empty після Phase 1 — silent
  //    polling кожні 60с до 20 спроб (20 хв). Раніше тут зупинялись — і
  //    користувач залишався з $0 назавжди до перезавантаження сторінки.
  //    Тепер фоном перевіряємо ще 20 разів — варто 1С нарешті прокинутись,
  //    дані з'являться без F5.
  // Reset counter коли змінюється key (новий запит = нова логіка retry).
  const [retryAttempt, setRetryAttempt] = useState(0);
  useEffect(() => { setRetryAttempt(0); }, [key]);
  const isEmptyData = !!options?.isEmptyResponse && !!data && options.isEmptyResponse(data);
  const FAST_RETRIES = 5;
  const MAX_RETRIES = 25; // 5 fast + 20 background polls
  const isAutoRetrying = isEmptyData && !error && retryAttempt < FAST_RETRIES;
  const isBackgroundPolling = isEmptyData && !error && retryAttempt >= FAST_RETRIES && retryAttempt < MAX_RETRIES;
  useEffect(() => {
    if (isLoading) return;
    if (!isAutoRetrying && !isBackgroundPolling) return;
    // Phase 1: швидкий backoff. Phase 2: фіксований 60с інтервал.
    const fastDelays = [1000, 2000, 4000, 6000, 8000];
    const delay = isAutoRetrying ? (fastDelays[retryAttempt] ?? 8000) : 60_000;
    const t = setTimeout(() => {
      setRetryAttempt(n => n + 1);
      mutate();
    }, delay);
    return () => clearTimeout(t);
  }, [isAutoRetrying, isBackgroundPolling, isLoading, retryAttempt, mutate]);

  return {
    data: data ?? null,
    // loading=true тільки під час Phase 1 (fast retry) — щоб UI не блимав.
    // Phase 2 (background poll) — loading=false, користувач бачить $0 і може
    // натиснути «Оновити» вручну, або просто чекати на наступний 60с tick.
    loading: isLoading || isAutoRetrying,
    error: error ? formatError(error) : null,
    refetch: () => { setRetryAttempt(0); mutate(); },
  };
}

function formatError(err: unknown): string {
  // SessionExpiredError — гарне повідомлення без JSON dump
  if (err instanceof SessionExpiredError) return err.message;
  if (err instanceof OneCError) {
    // Якщо OneCError містить JSON dump — спробуємо витягти {message}
    const m = err.message.match(/"message":"([^"]+)"/);
    if (m) return `1С: ${m[1]}`;
    return `1С: ${err.message}`;
  }
  if (err instanceof OneCNetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Невідома помилка';
}
