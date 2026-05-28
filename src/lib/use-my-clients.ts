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
import { useMemo } from 'react';
import { useOneCData } from './use-onec-data';
import { useAppStore } from './store';
import type { ClientFromOneC, ClientReport } from './mityng-types';
import {
  chunkClientIds,
  mergeFactBreakdown,
  mergeFocuses,
  mergeActivities,
  type ClientPlanTotal,
  type ClientFactTotal,
  type ClientActivity,
  type ClientFocusItem,
} from './client-batching';

// Re-export типів для споживачів (clients-page імпортує ClientFocusItem звідси).
export type { ClientActivity, ClientFocusItem };

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

interface UseClientsTotalsResult {
  /** planByClient[clientId] → { planTotal, brands: {segCode: amount} } */
  planByClient: Record<string, ClientPlanTotal>;
  /** factByClient[clientId] → { factTotal, brands: {segCode: amount} } */
  factByClient: Record<string, ClientFactTotal>;
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
  const [chunk1, chunk2, chunk3] = chunkClientIds(clientIds, 400, 3);
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
  const factByClient = useMemo(() => mergeFactBreakdown([f1, f2, f3]), [f1, f2, f3]);

  return {
    planByClient: planRes?.totals ?? {},
    factByClient,
    loading: planLoading || factLoading,
    error: planErr?.message || factErr || null,
  };
}

// === Контактна активність по клієнтах (для Hero Card 4) ===
// checkActivities(login, period, clientIds[]) → activities[] з hasCall / hasMeeting per client.
// 1С ліміт ~200 ID — chunk-имо у 3 чанки (підтримує до 600 клієнтів).

interface UseClientActivitiesResult {
  /** activityByClient[clientId] → { hasCall, hasMeeting, lastCallDate, lastMeetingDate } */
  activityByClient: Record<string, ClientActivity>;
  loading: boolean;
  error: string | null;
}

// === Фокуси клієнтів (Action A: getClientFocus) ===
// Bulk-дія: повертає масив focuses[].items[] на клієнта. Один клієнт може
// мати кілька активних фокусів одночасно.

interface UseClientFocusesResult {
  /** focusByClient[clientId] → items[] (порожній якщо нема активних фокусів). */
  focusByClient: Record<string, ClientFocusItem[]>;
  loading: boolean;
  error: string | null;
}

export function useClientFocuses(login: string | null, clientIds: string[]): UseClientFocusesResult {
  // Чанк 200 — як checkActivities (1С спека ~200-500 ID per call).
  const [chunk1, chunk2, chunk3] = chunkClientIds(clientIds, 200, 3);
  const mkPayload = (chunk: string[]) =>
    login && chunk.length > 0
      ? { login, clientIds: chunk }
      : null;

  const { data: f1, loading: l1, error: e1 } = useOneCData('getClientFocus', mkPayload(chunk1));
  const { data: f2, loading: l2, error: e2 } = useOneCData('getClientFocus', mkPayload(chunk2));
  const { data: f3, loading: l3, error: e3 } = useOneCData('getClientFocus', mkPayload(chunk3));

  const focusByClient = useMemo(() => mergeFocuses([f1, f2, f3]), [f1, f2, f3]);

  return {
    focusByClient,
    loading: l1 || l2 || l3,
    error: e1 || e2 || e3 || null,
  };
}

// === План активації бази (Action B: getClientActivationPlan) ===
// login-bound, один документ на менеджера+місяць. Повертає raw-план;
// «активовано» рахуємо у компоненті (факт по категоріях), бо totalInCategory
// з 1С нам не потрібен — категорії рахуємо самі.

interface UseActivationPlanResult {
  plan: import('./onec-types').GetClientActivationPlanResponse | null;
  loading: boolean;
  error: string | null;
}

export function useClientActivationPlan(login: string | null, month: string | null): UseActivationPlanResult {
  const payload = login && month ? { login, period: month } : null;
  const { data, loading, error } = useOneCData('getClientActivationPlan', payload);
  return { plan: data ?? null, loading, error };
}

export function useClientActivities(login: string | null, clientIds: string[]): UseClientActivitiesResult {
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const month = currentPeriod.month?.slice(0, 7);

  const [chunk1, chunk2, chunk3] = chunkClientIds(clientIds, 200, 3);
  const mkPayload = (chunk: string[]) =>
    login && month && chunk.length > 0
      ? { login, period: month, clientIds: chunk }
      : null;

  const { data: a1, loading: la1, error: ea1 } = useOneCData('checkActivities', mkPayload(chunk1));
  const { data: a2, loading: la2, error: ea2 } = useOneCData('checkActivities', mkPayload(chunk2));
  const { data: a3, loading: la3, error: ea3 } = useOneCData('checkActivities', mkPayload(chunk3));

  const activityByClient = useMemo(() => mergeActivities([a1, a2, a3]), [a1, a2, a3]);

  return {
    activityByClient,
    loading: la1 || la2 || la3,
    error: ea1 || ea2 || ea3 || null,
  };
}
