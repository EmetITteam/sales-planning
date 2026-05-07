'use client';

import useSWR from 'swr';
import { callOneC } from './onec-client';
import { adaptClientsForPlanning } from './onec-adapters';
import type { ClientCategoryStats } from './mock-data';

/**
 * Хук агрегує клієнтів по списку логінів менеджерів через паралельні
 * виклики Action 2 (`getClientsForPlanning`). Для РМ/Director дашборду —
 * щоб показати ClientStatsCard (Активні / Сплячі / Нові + total bought).
 *
 * SWR кешує per (logins.join), повторне відкриття дашборду — миттєве.
 *
 * `bought` (хто купив) тут не рахуємо — Action 2 не повертає факт по
 * клієнтах. Це окрема історія через Action 3 (getSalesFact). Поки 0.
 */
export function useClientsAggregate(logins: string[] | null): {
  data: ClientCategoryStats | null;
  loading: boolean;
  error: string | null;
} {
  const key = logins && logins.length > 0
    ? `clientsAgg|${logins.slice().sort().join(',')}`
    : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      // Паралельні fetch-и через Promise.all. SWR-кеш — per ключ цього хука,
      // не per кожен Action 2; для індивідуальних викликів окремий useOneCData
      // вже кешує сам Action 2. Тут наш ключ — список логінів.
      const responses = await Promise.all(
        (logins ?? []).map(login => callOneC('getClientsForPlanning', { login })),
      );

      const stats: ClientCategoryStats = {
        active: { total: 0, bought: 0 },
        sleeping: { total: 0, bought: 0 },
        newClients: { total: 0, bought: 0 },
        totalBought: 0,
        totalClients: 0,
      };

      for (const r of responses) {
        const all = adaptClientsForPlanning(r);
        for (const c of all) {
          stats.totalClients += 1;
          if (c.category === 'active') stats.active.total += 1;
          else if (c.category === 'sleeping' || c.category === 'lost') stats.sleeping.total += 1;
          else if (c.category === 'new') stats.newClients.total += 1;
          // 'none' (Без закупок) — у totalClients, але не в одну з 3 категорій-карток
        }
      }
      return stats;
    },
    { dedupingInterval: 300_000, revalidateOnFocus: false },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
