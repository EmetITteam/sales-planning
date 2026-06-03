/**
 * useMeetingPurposes — довідник цілей візиту з 1С.
 *
 * Тягне через `getInitialData({login, startDateString, endDateString})` —
 * той самий action що використовує meeting-app. У response polе `purposes`
 * приходить як `[{Purpose: string}]`.
 *
 * Fallback на hardcoded `MEETING_PURPOSES` якщо 1С не відповів / повернув
 * порожній масив — щоб форма ніколи не була без цілей.
 */

'use client';

import { useMemo } from 'react';
import { useOneCData } from '../use-onec-data';
import { MEETING_PURPOSES } from './purposes';
import { useAppStore } from '../store';

interface UseMeetingPurposesResult {
  purposes: readonly string[];
  loading: boolean;
  source: 'onec' | 'fallback';
}

/**
 * Період не критичний для довідника — беремо широкий діапазон поточного
 * місяця, щоб запит точно повернув покажчик.
 */
function getDefaultRange(): { startDateString: string; endDateString: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDateString: fmt(startDate), endDateString: fmt(endDate) };
}

export function useMeetingPurposes(): UseMeetingPurposesResult {
  const sessionUser = useAppStore(s => s.user);
  const payload = sessionUser
    ? { login: sessionUser.login, ...getDefaultRange() }
    : null;

  const { data, loading } = useOneCData('getInitialData', payload);

  const purposes = useMemo<readonly string[]>(() => {
    const raw = (data?.purposes ?? []) as Array<{ Purpose?: string }>;
    const fromOneC = raw.map(p => p.Purpose).filter((p): p is string => !!p);
    return fromOneC.length > 0 ? fromOneC : MEETING_PURPOSES;
  }, [data]);

  const source: 'onec' | 'fallback' =
    !loading && (data?.purposes?.length ?? 0) > 0 ? 'onec' : 'fallback';

  return { purposes, loading, source };
}
