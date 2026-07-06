/**
 * Крос-референс «незапланованих покупців».
 *
 * Логіка:
 *  - Action 2 (`getClientsForPlanning`) дає повний список клієнтів менеджера з категорією.
 *  - Action 3 (`getSalesFact`, з усіма clientIds) дає тих хто реально купував у місяці.
 *  - У Supabase зберігаємо план менеджера — рядки Прогнозу + Закриття розриву по сегменту.
 *
 * Незапланований = купив у поточному місяці (є у Action 3 facts) АЛЕ
 * не був у плані менеджера (немає серед `plannedClientIds`).
 *
 * Категорія береться з Action 2 (як її бачить 1С на момент перегляду).
 *
 * Розподіл по UI-блоках (узгоджено з Сашею 2026-05-06):
 *  - active           → блок «Прогноз по активних»     (read-only рядок з чипом)
 *  - sleeping/lost/new/none → блок «Закриття розриву»  (read-only рядок з чипом)
 */

import type { Client1C, SalesFactResponse } from './types';

export interface UnplannedBuyer {
  clientId: string;
  clientName: string;
  category: Client1C['category'];
  factAmount: number;
}

/**
 * Повертає незапланованих покупців конкретного сегменту.
 *
 * @param clients   Адаптований список клієнтів менеджера (з Action 2). Якщо null — повертає [].
 * @param fact      Адаптована відповідь Action 3 для місяця. Якщо null — повертає [].
 * @param segmentCode Код бренду в UI-форматі (PETARAN/NEURAMIS/.../OTHER).
 * @param plannedClientIds Set/масив clientId-ів які вже у плані менеджера по цьому сегменту.
 */
export function getUnplannedBuyersForSegment(
  clients: Client1C[] | null | undefined,
  fact: SalesFactResponse | null | undefined,
  segmentCode: string,
  plannedClientIds: Iterable<string>,
): UnplannedBuyer[] {
  if (!fact || !clients) return [];

  const factSegment = fact.facts.find(f => f.segmentCode === segmentCode);
  if (!factSegment || factSegment.clients.length === 0) return [];

  const planned = plannedClientIds instanceof Set
    ? plannedClientIds
    : new Set(plannedClientIds);

  // Швидкий доступ до категорії за clientId + набір резерв-клієнтів.
  const categoryById = new Map<string, Client1C['category']>();
  const reserved = new Set<string>();
  for (const c of clients) {
    categoryById.set(c.clientId, c.category);
    if (c.isReserved) reserved.add(c.clientId);
  }

  const out: UnplannedBuyer[] = [];
  for (const buyer of factSegment.clients) {
    if (planned.has(buyer.clientId)) continue;
    if (reserved.has(buyer.clientId)) continue; // Резерв — виключений з планування
    if (buyer.amount <= 0) continue; // нуль/від'ємне — не показуємо
    out.push({
      clientId: buyer.clientId,
      clientName: buyer.clientName,
      category: categoryById.get(buyer.clientId) ?? 'none',
      factAmount: buyer.amount,
    });
  }
  // Стабільний порядок: спершу більший факт.
  out.sort((a, b) => b.factAmount - a.factAmount);
  return out;
}

export interface UnplannedByCategory {
  active: UnplannedBuyer[];
  sleeping: UnplannedBuyer[];
  lost: UnplannedBuyer[];
  new: UnplannedBuyer[];
  none: UnplannedBuyer[];
}

export function groupUnplannedByCategory(items: UnplannedBuyer[]): UnplannedByCategory {
  const out: UnplannedByCategory = { active: [], sleeping: [], lost: [], new: [], none: [] };
  for (const it of items) out[it.category].push(it);
  return out;
}

/**
 * Розподіл по UI-блоках планування:
 *  - forecast: активні незаплановані (йдуть у блок «Прогноз по активних»)
 *  - gap: всі решта (sleeping/lost/new/none) — у блок «Закриття розриву»
 */
export function splitUnplannedForPlanning(items: UnplannedBuyer[]): {
  forecast: UnplannedBuyer[];
  gap: UnplannedBuyer[];
} {
  const forecast: UnplannedBuyer[] = [];
  const gap: UnplannedBuyer[] = [];
  for (const it of items) {
    if (it.category === 'active') forecast.push(it);
    else gap.push(it);
  }
  return { forecast, gap };
}

export interface UnplannedTotals {
  count: number;
  totalFact: number;
  byCategory: {
    active: { count: number; totalFact: number };
    sleeping: { count: number; totalFact: number };
    lost: { count: number; totalFact: number };
    new: { count: number; totalFact: number };
    none: { count: number; totalFact: number };
  };
}

export function computeUnplannedTotals(items: UnplannedBuyer[]): UnplannedTotals {
  const empty = () => ({ count: 0, totalFact: 0 });
  const byCategory = {
    active: empty(),
    sleeping: empty(),
    lost: empty(),
    new: empty(),
    none: empty(),
  };
  let total = 0;
  for (const it of items) {
    byCategory[it.category].count += 1;
    byCategory[it.category].totalFact += it.factAmount;
    total += it.factAmount;
  }
  return { count: items.length, totalFact: total, byCategory };
}

/** Локалізована назва категорії для UI (для chip / групування). */
export function categoryLabel(category: Client1C['category']): string {
  switch (category) {
    case 'active':   return 'Активний';
    case 'sleeping': return 'Сплячий';
    case 'lost':     return 'Втрачений';
    case 'new':      return 'Новий';
    case 'none':     return 'Без закупок';
  }
}
