/**
 * Хуки для коментарів менеджера по клієнтах.
 *
 *  - useClientComments(clientId1c) — список коментарів конкретного клієнта,
 *    SWR, mutate() після CUD-операцій
 *  - useClientCommentsCounts(clientIds) — bulk map { [clientId]: count }
 *    для badge у списку «Мої клієнти»
 */

'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { useMemo } from 'react';
import type { ClientComment } from './client-comments/types';

const FETCH_INIT: RequestInit = { credentials: 'same-origin' };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, FETCH_INIT);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    ...FETCH_INIT,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `${r.status}`);
  }
  return r.json();
}

export function useClientComments(clientId1c: string | null) {
  const key = clientId1c ? `/api/clients/comments?clientId1c=${encodeURIComponent(clientId1c)}` : null;
  const { data, error, isLoading, mutate } = useSWR<{ comments: ClientComment[] }>(
    key,
    getJson,
  );
  return {
    comments: data?.comments ?? [],
    loading: isLoading,
    error: error?.message || null,
    refetch: () => mutate(),
  };
}

export async function addClientComment(clientId1c: string, comment: string): Promise<ClientComment> {
  const res = await postJson<{ comment: ClientComment }>('/api/clients/comments', { clientId1c, comment });
  // Revalidate SWR кеш для цього клієнта + bulk counts
  globalMutate(`/api/clients/comments?clientId1c=${encodeURIComponent(clientId1c)}`);
  globalMutate(
    (k: unknown) => typeof k === 'string' && k.startsWith('/api/clients/comments/counts:'),
  );
  return res.comment;
}

export async function deleteClientComment(id: number, clientId1c: string): Promise<void> {
  const r = await fetch(`/api/clients/comments/${id}`, { ...FETCH_INIT, method: 'DELETE' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `${r.status}`);
  }
  globalMutate(`/api/clients/comments?clientId1c=${encodeURIComponent(clientId1c)}`);
  globalMutate(
    (k: unknown) => typeof k === 'string' && k.startsWith('/api/clients/comments/counts:'),
  );
}

/**
 * Bulk-counts: { [clientId]: number } для badge у списку.
 *
 * Кеш-ключ містить хеш списку id-ів — інакше при зміні clientIds SWR
 * не перевикористовує кеш. Тримаємо ключ детермінованим (sort).
 */
export function useClientCommentsCounts(clientIds: string[]) {
  const sortedKey = useMemo(() => {
    if (clientIds.length === 0) return null;
    const sorted = [...clientIds].sort();
    return `/api/clients/comments/counts:${sorted.length}:${hash(sorted.join(','))}`;
  }, [clientIds]);

  const { data, mutate } = useSWR<{ counts: Record<string, number> }>(
    sortedKey,
    async () => {
      const r = await fetch('/api/clients/comments/counts', {
        ...FETCH_INIT,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  return {
    counts: data?.counts ?? {},
    refetch: () => mutate(),
  };
}

/** Простий не-крипто хеш для детермінованого ключа кешу. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
