'use client';

import useSWR from 'swr';

export interface WindowStatus {
  allowed: boolean;
  reason: string;
  message: string;
}

/**
 * SWR-хук для перевірки window-lock стану (Етап 3 Пакету А).
 *
 * Викликає GET /api/planning/window-check. Кешує на 30 секунд щоб не
 * грузити сервер при кожному ре-рендері. Admin завжди отримує
 * `{ allowed: true, reason: 'admin-bypass' }`.
 *
 * Якщо передано null у будь-якому з параметрів — fetch не робиться.
 */
export function useWindowStatus(
  month: string | null,
  login: string | null,
): {
  status: WindowStatus | null;
  loading: boolean;
  refetch: () => void;
} {
  const shouldFetch = !!month && !!login;
  const key = shouldFetch ? `window-check|${month!.slice(0, 7)}|${login}` : null;

  const { data, isLoading, mutate } = useSWR<WindowStatus>(
    key,
    async () => {
      const params = new URLSearchParams({ month: month!, login: login! });
      const res = await fetch(`/api/planning/window-check?${params.toString()}`, {
        credentials: 'include',
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<WindowStatus>;
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  return {
    status: data ?? null,
    loading: isLoading,
    refetch: () => { mutate(); },
  };
}
