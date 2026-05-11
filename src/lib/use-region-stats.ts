'use client';

import useSWR from 'swr';

/**
 * Хук для виклику /api/onec/region-stats — повертає сумарний fact + count
 * по категоріях клієнтів (active/sleeping/lost/new/none) per segment
 * для списку менеджерів регіону.
 *
 * Сервер сам викликає Action 2 + Action 3 для всіх login-ів (паралельно)
 * і агрегує. Один HTTP-call з фронтенду.
 */

export type RegionStatsCategory = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

export interface RegionStatsCategoryStat {
  factCount: number;
  factSum: number;
}

export interface RegionStats {
  bySegment: Record<string, {
    byCategory: Record<RegionStatsCategory, RegionStatsCategoryStat>;
  }>;
}

export function useRegionStats(period: string | null, asOfDate: string | null, logins: string[] | null): {
  data: RegionStats | null;
  loading: boolean;
  error: string | null;
} {
  const sortedKey = logins && logins.length > 0
    ? [...logins].sort().join(',')
    : null;
  const key = period && sortedKey
    ? `region-stats|${period}|${asOfDate ?? ''}|${sortedKey}`
    : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const res = await fetch('/api/onec/region-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, asOfDate, logins }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
      }
      return await res.json() as RegionStats;
    },
    {
      // Запит важкий (N×2 на 1С) — кешуємо довше.
      dedupingInterval: 120_000,
      revalidateOnFocus: false,
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
