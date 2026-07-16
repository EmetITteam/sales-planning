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

/** Клієнти по 1С-категорії (унікальні): база / заплановано / купили. */
export interface ClientCatCounts { base: number; planned: number; bought: number }
export interface ClientCategoryBreakdown {
  region: Record<RegionStatsCategory, ClientCatCounts>;
  byManager: Array<{ login: string; byCategory: Record<RegionStatsCategory, ClientCatCounts> }>;
}

export interface RegionStats {
  bySegment: Record<string, {
    byCategory: Record<RegionStatsCategory, RegionStatsCategoryStat>;
    unplanned: { factCount: number; factSum: number };
  }>;
  /** Розбивка клієнтів по 1С-категорії (унікальні) — для нової таблиці weekly-report. */
  clientCategory?: ClientCategoryBreakdown;
}

export interface PlanBucketsInput {
  forecastClientIds?: string[] | null;
  gapNewClientIds?: string[] | null;
  gapActivationClientIds?: string[] | null;
}

export function useRegionStats(
  period: string | null,
  asOfDate: string | null,
  logins: string[] | null,
  planBuckets: PlanBucketsInput | null = null,
): {
  data: RegionStats | null;
  loading: boolean;
  error: string | null;
} {
  const sortedKey = logins && logins.length > 0
    ? [...logins].sort().join(',')
    : null;
  // Хеш planBuckets — короткий, для cache-bust. Розрізняє null vs пустий
  // план vs з даними. Включає розміри 3 sets щоб різні плани давали різні
  // ключі.
  const fLen = planBuckets?.forecastClientIds?.length ?? -1;
  const nLen = planBuckets?.gapNewClientIds?.length ?? -1;
  const aLen = planBuckets?.gapActivationClientIds?.length ?? -1;
  const planHash = !planBuckets
    ? 'np'
    : `pb-${fLen}-${nLen}-${aLen}`;
  const key = period && sortedKey
    ? `region-stats|${period}|${asOfDate ?? ''}|${sortedKey}|${planHash}`
    : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const res = await fetch('/api/onec/region-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          asOfDate,
          logins,
          forecastClientIds: planBuckets?.forecastClientIds ?? null,
          gapNewClientIds: planBuckets?.gapNewClientIds ?? null,
          gapActivationClientIds: planBuckets?.gapActivationClientIds ?? null,
        }),
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
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      // Одна спроба у разі помилки (без exponential backoff retry-петлі).
      errorRetryCount: 1,
      // Поки revalidate — показуємо старі дані щоб не блимав спіннер.
      keepPreviousData: true,
    },
  );

  // Якщо хук впав з error — більше НЕ показуємо «loading» спіннер.
  // Інакше при 500 з API спіннер крутиться нескінченно (SWR isLoading=true
  // поки немає valid response або data). Error має «перебивати» loading.
  const failed = !!error;
  return {
    data: data ?? null,
    loading: isLoading && !failed,
    error: error instanceof Error ? error.message : null,
  };
}
