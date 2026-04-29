'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { callOneC, OneCError, OneCNetworkError } from './onec-client';
import type { OneCAction, OneCActionMap } from './onec-types';

interface UseOneCDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Хук для виклику 1С action з автоматичним loading/error/refetch.
 *
 * Виклик буде зроблений на mount + при зміні payload (через JSON.stringify deep-compare).
 *
 * Приклад:
 *   const { data, loading, error, refetch } = useOneCData(
 *     'getRegionData',
 *     { login: user.login, period: '2026-04', asOfDate: '2026-04-26' },
 *   );
 *   if (loading) return <DashboardSkeleton role="rm" />;
 *   if (error) return <DashboardError message={error} onRetry={refetch} />;
 *   if (!data) return null;
 *   const ui = adaptRegionData(data);
 *   ...
 *
 * Якщо payload null → fetch не робиться (можна gate-нути доти поки нема user.login).
 */
export function useOneCData<A extends OneCAction>(
  action: A,
  payload: OneCActionMap[A]['request'] | null,
): UseOneCDataResult<OneCActionMap[A]['response']> {
  const [data, setData] = useState<OneCActionMap[A]['response'] | null>(null);
  const [loading, setLoading] = useState<boolean>(payload !== null);
  const [error, setError] = useState<string | null>(null);

  // Зберігаємо payload як stringified key для useEffect dep
  const payloadKey = payload ? JSON.stringify(payload) : null;

  // Counter для refetch (інкрементуємо щоб тригернути useEffect)
  const refetchTriggerRef = useRef(0);
  const [, setRefetchTick] = useState(0);

  const refetch = useCallback(() => {
    refetchTriggerRef.current += 1;
    setRefetchTick(refetchTriggerRef.current);
  }, []);

  useEffect(() => {
    if (!payload) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    callOneC(action, payload)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OneCError) {
          setError(`1С: ${err.message}`);
        } else if (err instanceof OneCNetworkError) {
          setError(err.message);
        } else {
          setError('Невідома помилка');
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, payloadKey, refetchTriggerRef.current]);

  return { data, loading, error, refetch };
}
