/**
 * Чисті функції батчингу для /clients-хуків (use-my-clients).
 *
 * Винесено в окремий модуль БЕЗ React/SWR/zustand-store — щоб покрити юніт-
 * тестами в node (store.ts тягне sessionStorage через persist → падає поза
 * браузером). Хуки лише обгортають ці функції у useMemo.
 */
import type { OneCActionMap } from './onec-types';

export interface ClientPlanTotal {
  planTotal: number;
  brands: Record<string, number>;
}

export interface ClientFactTotal {
  factTotal: number;
  brands: Record<string, number>;
}

export interface ClientActivity {
  hasCall: boolean;
  hasMeeting: boolean;
  lastCallDate: string | null;
  lastMeetingDate: string | null;
}

export interface ClientFocusItem {
  focusName: string;
  since?: string;
  validUntil?: string | null;
}

/**
 * Розбиває id-шки на рівно `count` чанків по `size`.
 *
 * ⚠️ Усе понад `size * count` ТИХО відкидається — це навмисний ліміт (1С
 * приймає обмежену к-сть ID за запит: ~400 для getSalesFact, ~200 для
 * getClientFocus / checkActivities). Якщо у менеджера клієнтів більше —
 * їхній факт/фокус/активність просто не підтягнуться (відомий cap).
 * Завжди повертає рівно `count` масивів (зайві — порожні) — щоб хук міг
 * безумовно викликати фіксовану к-сть useOneCData (rules-of-hooks).
 */
export function chunkClientIds(ids: string[], size: number, count: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < count; i++) {
    out.push(ids.slice(i * size, (i + 1) * size));
  }
  return out;
}

/**
 * Об'єднує segments[] з кількох getSalesFact-чанків і денормалізує у map
 * по clientId. Coerce-ить factAmountUSD (1С інколи шле string "360.00"),
 * пропускає нульові/безідішні записи, акумулює по брендах і між чанками.
 */
export function mergeFactBreakdown(
  parts: Array<OneCActionMap['getSalesFact']['response'] | null | undefined>,
): Record<string, ClientFactTotal> {
  const out: Record<string, ClientFactTotal> = {};
  for (const part of parts) {
    if (!part?.segments) continue;
    for (const seg of part.segments) {
      for (const c of seg.clients ?? []) {
        const amount = Number(c.factAmountUSD) || 0;
        if (!c.clientId || amount === 0) continue;
        if (!out[c.clientId]) out[c.clientId] = { factTotal: 0, brands: {} };
        out[c.clientId].factTotal += amount;
        out[c.clientId].brands[seg.segmentCode] = (out[c.clientId].brands[seg.segmentCode] || 0) + amount;
      }
    }
  }
  return out;
}

/**
 * Об'єднує focuses[] з кількох getClientFocus-чанків → map по clientId.
 * Пропускає безідішні записи; items нормалізує у масив.
 */
export function mergeFocuses(
  parts: Array<OneCActionMap['getClientFocus']['response'] | null | undefined>,
): Record<string, ClientFocusItem[]> {
  const out: Record<string, ClientFocusItem[]> = {};
  for (const res of parts) {
    if (!res?.focuses) continue;
    for (const f of res.focuses) {
      if (!f.clientId) continue;
      out[f.clientId] = Array.isArray(f.items) ? f.items : [];
    }
  }
  return out;
}

/**
 * Об'єднує activities[] з кількох checkActivities-чанків → map по clientId.
 */
export function mergeActivities(
  parts: Array<OneCActionMap['checkActivities']['response'] | null | undefined>,
): Record<string, ClientActivity> {
  const out: Record<string, ClientActivity> = {};
  for (const res of parts) {
    if (!res?.activities) continue;
    for (const a of res.activities) {
      if (!a.clientId) continue;
      out[a.clientId] = {
        hasCall: !!a.hasCall,
        hasMeeting: !!a.hasMeeting,
        lastCallDate: a.lastCallDate ?? null,
        lastMeetingDate: a.lastMeetingDate ?? null,
      };
    }
  }
  return out;
}
