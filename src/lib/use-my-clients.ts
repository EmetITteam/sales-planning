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
import { monthlyPidFromMonth } from './periods';
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

// === Повна історія зустрічей по клієнту (Action getAllMeetingsForClient) ===
// Lazy: викликати тільки коли менеджер натиснув «Показати всі зустрічі» у
// досьє. Дешевий запит — список без тіл деталей.

interface ClientMeetingHistoryItem {
  id: string;
  date: string;
  time: string;
  status: string;
  purpose: string;
  comment: string;
  plannedAddress: string;
  durationMin: number | null;
}

interface UseClientMeetingsHistoryResult {
  meetings: ClientMeetingHistoryItem[];
  loading: boolean;
  error: string | null;
}

export function useClientMeetingsHistory(clientID: string | null): UseClientMeetingsHistoryResult {
  const payload = clientID ? { clientID } : null;
  const { data, loading, error } = useOneCData('getAllMeetingsForClient', payload);

  const meetings = useMemo<ClientMeetingHistoryItem[]>(() => {
    const raw = data?.meetings;
    if (!Array.isArray(raw)) return [];
    return raw
      .map(m => ({
        id: m.ID ?? '',
        date: m.Date ?? '',
        time: m.Time ?? '',
        status: m.Status ?? '',
        purpose: m.Purpose ?? '',
        comment: m.Comment ?? '',
        plannedAddress: m.PlannedAddress ?? m.StartAddress ?? '',
        durationMin:
          typeof m.DurationMin === 'number'
            ? m.DurationMin
            : m.DurationMin
              ? parseInt(String(m.DurationMin), 10) || null
              : null,
      }))
      .filter(m => m.id)
      // 1С повертає у довільному порядку — сортуємо новіші зверху.
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [data]);

  return { meetings, loading, error };
}

// === План по клієнтах (наш Supabase) + Факт по клієнтах (1С Action 3) ===

interface UseClientsTotalsResult {
  /** planByClient[clientId] → { planTotal, brands: {segCode: amount} } */
  planByClient: Record<string, ClientPlanTotal>;
  /** factByClient[clientId] → { factTotal, brands: {segCode: amount} } */
  factByClient: Record<string, ClientFactTotal>;
  /**
   * Загальний факт менеджера = Σ totalFactUSD по сегментах (по ВСІХ його
   * клієнтах, не тільки в clientIds). Збігається з планинг-дашбордом. Для
   * hero-картки «Виконання» — НЕ сума factByClient (та рахує лише деталізовані
   * clients[] і суттєво недооцінює факт).
   */
  factTotalAgg: number;
  /** Клієнти у яких stage='Зустріч' хоч в одному forecast/gap row поточного періоду. */
  meetingStageClientIds: Set<string>;
  loading: boolean;
  error: string | null;
}

/**
 * Тягне ПЛАН (з нашого Supabase) + ФАКТ (з 1С) для усіх клієнтів менеджера.
 *
 * @param login Логін менеджера (override з сесії на бекенді — можна не парити)
 * @param clientIds Список ID контрагентів для яких потрібен факт (з getSalesFact)
 */
/**
 * @param monthOverride YYYY-MM. Якщо передано — використовується замість
 *   глобального currentPeriod (для локальних фільтрів /clients). Інакше —
 *   читається зі store (legacy / /planning інтеграція).
 */
export function useClientsTotals(
  login: string | null,
  clientIds: string[],
  monthOverride?: string | null,
): UseClientsTotalsResult {
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const month = monthOverride ?? currentPeriod.month?.slice(0, 7); // 'YYYY-MM'
  const periodId = monthOverride ? monthlyPidFromMonth(monthOverride) : currentPeriod.id;

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
      return r.json() as Promise<{ totals: Record<string, ClientPlanTotal>; meetingStageClientIds?: string[] }>;
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  // 2) Факт з 1С: getSalesFact({login, period, clientIds, asOfDate})
  // 1С ліміт — 400 ID за запит. У менеджера може бути 481+ клієнтів →
  // batch'имо у 3 чанки по 400 (підтримує до 1200 клієнтів).
  // Hooks rules satisfied: ЗАВЖДИ викликаємо 3 useOneCData (порожні чанки
  // → payload=null → SWR не fetch'ить).
  //
  // ⚠️ asOfDate ЗАВЖДИ передаємо явно (як у dashboards). Без нього 1С могла
  // повертати завищені цифри для минулих місяців (баг помічений 2026-06-04:
  // квітень показував $120К при реальних ~$55К — підозра що 1С брала діапазон
  // 1.04 → today, а не 1.04 → 30.04). Поточний місяць → today; минулий →
  // останній день того місяця.
  const asOfDate = useMemo(() => {
    if (!month) return undefined;
    const [y, m] = month.split('-').map(Number);
    const today = new Date();
    const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (month === todayMonth) {
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    const last = new Date(y, m, 0); // day 0 наступного = останній день поточного
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }, [month]);

  const [chunk1, chunk2, chunk3] = chunkClientIds(clientIds, 400, 3);
  const mkPayload = (chunk: string[]) =>
    login && month && chunk.length > 0
      ? { login, period: month, clientIds: chunk, asOfDate }
      : null;
  const { data: f1, loading: l1, error: e1 } = useOneCData('getSalesFact', mkPayload(chunk1));
  const { data: f2, loading: l2, error: e2 } = useOneCData('getSalesFact', mkPayload(chunk2));
  const { data: f3, loading: l3, error: e3 } = useOneCData('getSalesFact', mkPayload(chunk3));
  const factLoading = l1 || l2 || l3;
  const factErr = e1 || e2 || e3;

  // Об'єднуємо segments з усіх чанків і денормалізуємо у factByClient.
  const factByClient = useMemo(() => mergeFactBreakdown([f1, f2, f3]), [f1, f2, f3]);

  // Загальний факт = Σ totalFactUSD по сегментах. totalFactUSD — факт сегменту
  // по ВСІХ клієнтах менеджера (не залежить від clientIds), тож у різних чанках
  // значення сегмента ОДНАКОВЕ → dedupe по segmentCode (інакше 3 чанки утроять).
  const factTotalAgg = useMemo(() => {
    const bySeg = new Map<string, number>();
    for (const part of [f1, f2, f3]) {
      for (const seg of part?.segments ?? []) {
        bySeg.set(seg.segmentCode, Number(seg.totalFactUSD) || 0);
      }
    }
    let sum = 0;
    for (const v of bySeg.values()) sum += v;
    return sum;
  }, [f1, f2, f3]);

  return {
    planByClient: planRes?.totals ?? {},
    factByClient,
    factTotalAgg,
    meetingStageClientIds: new Set(planRes?.meetingStageClientIds ?? []),
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
  // 4 чанки по 200 = до 800 клієнтів (як checkActivities). Порожні чанки → без запиту.
  const [chunk1, chunk2, chunk3, chunk4] = chunkClientIds(clientIds, 200, 4);
  const mkPayload = (chunk: string[]) =>
    login && chunk.length > 0
      ? { login, clientIds: chunk }
      : null;

  const { data: f1, loading: l1, error: e1 } = useOneCData('getClientFocus', mkPayload(chunk1));
  const { data: f2, loading: l2, error: e2 } = useOneCData('getClientFocus', mkPayload(chunk2));
  const { data: f3, loading: l3, error: e3 } = useOneCData('getClientFocus', mkPayload(chunk3));
  const { data: f4, loading: l4, error: e4 } = useOneCData('getClientFocus', mkPayload(chunk4));

  const focusByClient = useMemo(() => mergeFocuses([f1, f2, f3, f4]), [f1, f2, f3, f4]);

  return {
    focusByClient,
    loading: l1 || l2 || l3 || l4,
    error: e1 || e2 || e3 || e4 || null,
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

/**
 * @param monthOverride YYYY-MM. Якщо передано — checkActivities бере цей
 *   місяць замість глобального currentPeriod. Використовується для локального
 *   фільтра /clients.
 */
export function useClientActivities(
  login: string | null,
  clientIds: string[],
  monthOverride?: string | null,
): UseClientActivitiesResult {
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const month = monthOverride ?? currentPeriod.month?.slice(0, 7);

  // 4 чанки по 200 = до 800 клієнтів. Порожні чанки → payload null → без запиту
  // (безкоштовно для менших менеджерів). Раніше 3 (600) — впритул до найбільших.
  const [chunk1, chunk2, chunk3, chunk4] = chunkClientIds(clientIds, 200, 4);
  const mkPayload = (chunk: string[]) =>
    login && month && chunk.length > 0
      ? { login, period: month, clientIds: chunk }
      : null;

  const { data: a1, loading: la1, error: ea1 } = useOneCData('checkActivities', mkPayload(chunk1));
  const { data: a2, loading: la2, error: ea2 } = useOneCData('checkActivities', mkPayload(chunk2));
  const { data: a3, loading: la3, error: ea3 } = useOneCData('checkActivities', mkPayload(chunk3));
  const { data: a4, loading: la4, error: ea4 } = useOneCData('checkActivities', mkPayload(chunk4));

  const activityByClient = useMemo(() => mergeActivities([a1, a2, a3, a4]), [a1, a2, a3, a4]);

  return {
    activityByClient,
    loading: la1 || la2 || la3 || la4,
    error: ea1 || ea2 || ea3 || ea4 || null,
  };
}
