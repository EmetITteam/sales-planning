'use client';

import useSWR from 'swr';
import { callOneC, OneCError, OneCNetworkError } from './onec-client';
import type { OneCAction, OneCActionMap } from './onec-types';

interface UseOneCDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
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
 */
export function useOneCData<A extends OneCAction>(
  action: A,
  payload: OneCActionMap[A]['request'] | null,
): UseOneCDataResult<OneCActionMap[A]['response']> {
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
      // 5 хвилин dedup — дані 1С міняються рідше ніж раз на хвилину,
      // тому небезпечно agresivно revalidate коли користувач навігує.
      dedupingInterval: 300_000,
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? formatError(error) : null,
    refetch: () => { mutate(); },
  };
}

function formatError(err: unknown): string {
  if (err instanceof OneCError) return `1С: ${err.message}`;
  if (err instanceof OneCNetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Невідома помилка';
}
