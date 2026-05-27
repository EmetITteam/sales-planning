'use client';

/**
 * Hooks для сторінки `/clients` («Мої клієнти», CRM-режим менеджера).
 *
 * Тягне дані з трьох джерел:
 *  - 1С `getManagerClients` — список клієнтів менеджера + категорії + телефони
 *  - 1С `getRegionData` (через `useOneCData`) — план/факт цього місяця
 *  - 1С `getClientReport` (lazy) — 3-міс історія, події, освіта, документи
 *
 * SWR обгортки автоматично:
 *  - dedup паралельні виклики
 *  - cache між монтуваннями
 *  - revalidate-on-focus
 */

import useSWR from 'swr';
import { useOneCData } from './use-onec-data';
import { useAppStore } from './store';
import type { ClientFromOneC, ClientReport } from './mityng-types';

interface UseMyClientsResult {
  clients: ClientFromOneC[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Список клієнтів менеджера. login підставляється з сесії (override у `/api/onec`).
 * Для admin/director — той самий механізм що у `useClientsForPlanning`:
 * якщо явно не передано targetLogin, повертається DIRECTOR_PROXY_LOGIN.
 *
 * @param targetLogin Опційно — admin/director може запросити чужий список.
 *                    Менеджер і РМ — ігнорується (override з сесії).
 */
export function useMyClients(targetLogin?: string): UseMyClientsResult {
  const sessionUser = useAppStore(s => s.user);
  const payload = sessionUser
    ? { login: targetLogin ?? sessionUser.login }
    : null;

  const { data, loading, error, refetch } = useOneCData(
    'getManagerClients',
    payload,
    {
      // 1С на cold start може повернути { clients: [] } — auto-retry до 3 разів.
      isEmptyResponse: r => !r?.clients || r.clients.length === 0,
    },
  );

  return {
    clients: data?.clients ?? [],
    loading,
    error,
    refetch,
  };
}

interface UseClientReportResult {
  report: ClientReport | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Detailed-звіт по одному клієнту: 3-міс історія + події + clientInfo.
 *
 * Lazy: викликати ТІЛЬКИ коли клієнт обраний у UI (наприклад accordion-row
 * розкрили). Передавай `clientID=null` щоб не тригерити запит.
 */
export function useClientReport(clientID: string | null): UseClientReportResult {
  const payload = clientID ? { clientID } : null;
  const { data, loading, error, refetch } = useOneCData('getClientReport', payload);
  return {
    report: data ?? null,
    loading,
    error,
    refetch,
  };
}

// === План по клієнтах (наш Supabase) + Факт по клієнтах (1С Action 3) ===

interface ClientPlanTotal {
  planTotal: number;
  brands: Record<string, number>;
}

interface UseClientsTotalsResult {
  /** planByClient[clientId] → { planTotal, brands: {segCode: amount} } */
  planByClient: Record<string, ClientPlanTotal>;
  /** factByClient[clientId] → { factTotal, brands: {segCode: amount} } */
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  loading: boolean;
  error: string | null;
}

/**
 * Тягне ПЛАН (з нашого Supabase) + ФАКТ (з 1С) для усіх клієнтів менеджера.
 *
 * @param login Логін менеджера (override з сесії на бекенді — можна не парити)
 * @param clientIds Список ID контрагентів для яких потрібен факт (з getSalesFact)
 */
export function useClientsTotals(login: string | null, clientIds: string[]): UseClientsTotalsResult {
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const periodId = currentPeriod.id;
  const month = currentPeriod.month?.slice(0, 7); // 'YYYY-MM'

  // 1) План з Supabase
  const planKey = login && periodId ? `clientPlanTotals|${login}|${periodId}` : null;
  const { data: planRes, error: planErr, isLoading: planLoading } = useSWR(
    planKey,
    async () => {
      const r = await fetch('/api/clients/plan-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, periodId, month }),
      });
      if (!r.ok) throw new Error(`plan-totals ${r.status}`);
      return r.json() as Promise<{ totals: Record<string, ClientPlanTotal> }>;
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  // 2) Факт з 1С: getSalesFact({login, period, clientIds})
  // 1С ліміт — 400 ID за запит. У менеджера може бути 481+ клієнтів →
  // batch'имо у 3 чанки по 400 (підтримує до 1200 клієнтів).
  // Hooks rules satisfied: ЗАВЖДИ викликаємо 3 useOneCData (порожні чанки
  // → payload=null → SWR не fetch'ить).
  const chunk1 = clientIds.slice(0, 400);
  const chunk2 = clientIds.slice(400, 800);
  const chunk3 = clientIds.slice(800, 1200);
  const mkPayload = (chunk: string[]) =>
    login && month && chunk.length > 0
      ? { login, period: month, clientIds: chunk }
      : null;
  const { data: f1, loading: l1, error: e1 } = useOneCData('getSalesFact', mkPayload(chunk1));
  const { data: f2, loading: l2, error: e2 } = useOneCData('getSalesFact', mkPayload(chunk2));
  const { data: f3, loading: l3, error: e3 } = useOneCData('getSalesFact', mkPayload(chunk3));
  const factLoading = l1 || l2 || l3;
  const factErr = e1 || e2 || e3;

  // Об'єднуємо segments з усіх чанків і денормалізуємо у factByClient.
  const factByClient = useMergedFactBreakdown([f1, f2, f3]);

  return {
    planByClient: planRes?.totals ?? {},
    factByClient,
    loading: planLoading || factLoading,
    error: planErr?.message || factErr || null,
  };
}

import { useMemo } from 'react';
import type { OneCActionMap } from './onec-types';

/**
 * Об'єднує segments[] з кількох getSalesFact-чанків і денормалізує у
 * map по clientId. Підтримує до 3 чанків (1200 клієнтів).
 */
function useMergedFactBreakdown(
  parts: Array<OneCActionMap['getSalesFact']['response'] | null | undefined>,
): Record<string, { factTotal: number; brands: Record<string, number> }> {
  return useMemo(() => {
    const out: Record<string, { factTotal: number; brands: Record<string, number> }> = {};
    for (const part of parts) {
      if (!part?.segments) continue;
      for (const seg of part.segments) {
        for (const c of seg.clients ?? []) {
          // 1С може повертати factAmountUSD як string ("360.00") — coerce.
          const amount = Number(c.factAmountUSD) || 0;
          if (!c.clientId || amount === 0) continue;
          if (!out[c.clientId]) out[c.clientId] = { factTotal: 0, brands: {} };
          out[c.clientId].factTotal += amount;
          out[c.clientId].brands[seg.segmentCode] = (out[c.clientId].brands[seg.segmentCode] || 0) + amount;
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, parts);
}
