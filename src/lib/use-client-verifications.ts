/**
 * Хуки для верифікацій нових клієнтів через Bitrix SPA 1048.
 *
 *  - useClientVerificationsForManager() — pending+in_progress+clarification
 *    для поточного менеджера (для фільтра «На верифікації» у /clients)
 *  - useClientVerificationByClient(clientId1c) — latest для конкретного клієнта
 *    (для бейджа на картці)
 */

'use client';

import useSWR from 'swr';
import type { ClientVerification } from './client-verifications/types';

const FETCH_INIT: RequestInit = { credentials: 'same-origin' };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, FETCH_INIT);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/**
 * Список активних верифікацій менеджера. Полінг 30с (як notifications)
 * щоб коли КЦ закрив у Bitrix — UI оновився без перезавантаження.
 */
export function useClientVerificationsForManager() {
  const { data, error, isLoading, mutate } = useSWR<{ verifications: ClientVerification[] }>(
    '/api/clients/verifications',
    getJson,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
  return {
    verifications: data?.verifications ?? [],
    loading: isLoading,
    error: error?.message || null,
    refetch: () => mutate(),
  };
}

/**
 * Verification конкретного клієнта (для UI бейджа на картці).
 * `null` якщо клієнт не реєструвався як новий або вже verified/rejected.
 */
export function useClientVerificationByClient(clientId1c: string | null) {
  const key = clientId1c ? `/api/clients/verifications?clientId1c=${encodeURIComponent(clientId1c)}` : null;
  const { data, mutate } = useSWR<{ verifications: ClientVerification[] }>(
    key,
    getJson,
    { revalidateOnFocus: false },
  );
  return {
    verification: data?.verifications?.[0] ?? null,
    refetch: () => mutate(),
  };
}
