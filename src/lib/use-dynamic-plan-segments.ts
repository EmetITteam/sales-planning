'use client';

import useSWR from 'swr';

/**
 * SWR-хук для активних dynamic plan segments у конкретному місяці.
 *
 * Використання:
 *   const { dynamicSegments } = useDynamicPlanSegments(currentPeriod.month);
 *   const isDynamic = dynamicSegments.has('NEURONOX');
 *
 * @param period YYYY-MM або YYYY-MM-DD (беремо перші 7 символів)
 */
export function useDynamicPlanSegments(period: string | null): {
  dynamicSegments: Set<string>;
  loading: boolean;
} {
  const monthKey = period?.slice(0, 7) ?? null;

  const { data, isLoading } = useSWR(
    monthKey ? `dynamic-plans-active|${monthKey}` : null,
    async () => {
      const r = await fetch(`/api/dynamic-plans/active?period=${monthKey}`, {
        credentials: 'same-origin',
      });
      if (!r.ok) return { segmentCodes: [] };
      return await r.json() as { segmentCodes: string[] };
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return {
    dynamicSegments: new Set(data?.segmentCodes ?? []),
    loading: isLoading,
  };
}
