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
  /**
   * Per-manager × segment breakdown — для розрахунку «Запл. %» per
   * (manager, brand) пара на дашборді РМ/Director. Без цього brand-row
   * падав на mock-формулу (`факт + 60% розриву`).
   */
  byLogin: Record<string, Record<string, { forecast: number; gap: number }>>;
  /**
   * Унікальні client_id_1c з усіх forecasts ∪ gap_closures цього scope.
   * (Зберігаємо для зворотньої сумісності, але новий код використовує
   * три окремі масиви нижче — для класифікації факту по плану.)
   */
  plannedClientIds: string[];
  /** Клієнти у блоці «Прогноз» (active за рішенням менеджера). */
  forecastClientIds: string[];
  /** Клієнти у «Закриття розриву» з category=Новий. */
  gapNewClientIds: string[];
  /** Клієнти у «Закриття розриву» з іншою категорією (sleeping/lost/none). */
  gapActivationClientIds: string[];
}

export function usePlanningAggregate(
  periodId: number | null,
  logins: string[] | null,
  month?: string | null,
): {
  data: PlanningAggregate | null;
  loading: boolean;
  error: string | null;
} {
  const sortedKey = logins && logins.length > 0
    ? [...logins].sort().join(',')
    : null;
  // month у key — щоб SWR не reused кеш між різними місяцями (тиждень фільтр
  // того ж місяця має той самий agg-результат бо canonical pid однаковий).
  const monthKey = month ? month.slice(0, 7) : '';
  const key = periodId !== null && sortedKey
    ? `agg|${periodId}|${monthKey}|${sortedKey}`
    : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const res = await fetch('/api/planning/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId, logins, month: month ?? undefined }),
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
