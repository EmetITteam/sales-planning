'use client';

import useSWR from 'swr';

interface FinalizationStatus {
  finalizedAt: string | null;
  finalizedBy: string | null;
}

/**
 * SWR-хук для finalization status плану (manager × segment × month).
 *
 * Викликає GET /api/planning/finalize. Кешований по композитному key —
 * перемикання сегментів / drill-down оновлює автоматично.
 *
 * Якщо передано null у будь-якому з параметрів — fetch не робиться
 * (для умовних викликів коли period/login ще не готові).
 */
export function useFinalizationStatus(
  periodId: number | null,
  segmentCode: string | null,
  login: string | null,
  monthHint?: string | null,
): {
  finalizedAt: string | null;
  finalizedBy: string | null;
  loading: boolean;
  refetch: () => void;
} {
  const shouldFetch = periodId !== null && segmentCode !== null && login !== null;
  const key = shouldFetch
    ? `finalize|${periodId}|${segmentCode}|${login}|${monthHint ?? ''}`
    : null;

  const { data, isLoading, mutate } = useSWR<FinalizationStatus>(
    key,
    async () => {
      const params = new URLSearchParams({
        periodId: String(periodId!),
        segmentCode: segmentCode!,
        login: login!,
      });
      if (monthHint) params.set('month', monthHint);
      const res = await fetch(`/api/planning/finalize?${params.toString()}`, {
        credentials: 'include',
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<FinalizationStatus>;
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  return {
    finalizedAt: data?.finalizedAt ?? null,
    finalizedBy: data?.finalizedBy ?? null,
    loading: isLoading,
    refetch: () => { mutate(); },
  };
}

/**
 * POST /api/planning/finalize — фіналізувати (manager + admin).
 */
export async function finalizePlan(params: {
  periodId: number;
  month?: string;
  segmentCode: string;
  targetLogin?: string;
}): Promise<{ ok: true; finalizedAt: string; finalizedBy: string } | { ok: false; error: string }> {
  const res = await fetch('/api/planning/finalize', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
    },
    body: JSON.stringify({
      periodId: params.periodId,
      period: params.month ? { month: params.month } : undefined,
      segmentCode: params.segmentCode,
      targetLogin: params.targetLogin,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  return { ok: true, finalizedAt: data.finalizedAt, finalizedBy: data.finalizedBy };
}

/**
 * DELETE /api/planning/finalize — розфіналізувати (тільки admin).
 */
export async function unfinalizePlan(params: {
  periodId: number;
  month?: string;
  segmentCode: string;
  targetLogin?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/planning/finalize', {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
    },
    body: JSON.stringify({
      periodId: params.periodId,
      period: params.month ? { month: params.month } : undefined,
      segmentCode: params.segmentCode,
      targetLogin: params.targetLogin,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  return { ok: true };
}
