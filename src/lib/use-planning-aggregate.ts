'use client';

import useSWR from 'swr';

/**
 * Хук для виклику /api/planning/aggregate — повертає сумарний прогноз і
 * потенціал закриття розриву по списку менеджерів за період.
 *
 * Використовується на дашбордах РМ/Директора для розрахунку «Очікуваного %»
 * без N паралельних запитів за кожним менеджером.
 */

export type PlanCategoryKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

export interface CategoryStat {
  plannedCount: number;
  plannedSum: number;
}

export interface PlanningAggregate {
  totalForecast: number;
  totalGapPotential: number;
  bySegment: Record<string, {
    forecast: number;
    gap: number;
    forecastClients: number;
    gapClients: number;
    byCategory: Record<PlanCategoryKey, CategoryStat>;
  }>;
}

export function usePlanningAggregate(periodId: number | null, logins: string[] | null): {
  data: PlanningAggregate | null;
  loading: boolean;
  error: string | null;
} {
  const sortedKey = logins && logins.length > 0
    ? [...logins].sort().join(',')
    : null;
  const key = periodId !== null && sortedKey
    ? `agg|${periodId}|${sortedKey}`
    : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const res = await fetch('/api/planning/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId, logins }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
      }
      return await res.json() as PlanningAggregate;
    },
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
