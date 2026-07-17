/**
 * Pure-функція агрегації region-stats. Винесена з API route щоб тестувалась
 * без HTTP / сесій / 1С-моків.
 *
 * Класифікація buyer-ів — ПО ПЛАНУ МЕНЕДЖЕРА per (segment, clientId).
 * НЕ просто по clientId — менеджер може запланувати клієнта по Vitaran
 * але не по IUSE; коли той купує IUSE, це «Незаплановані для IUSE», а
 * не «Активний» (баг-репорт 2026-05-12: Запоріжжя $1,178 IUSE-факту
 * показувалось як активні бо клієнти були в forecast по Vitaran).
 *
 * Ключі у `forecastClientIds`/`gapNewClientIds`/`gapActivationClientIds` —
 * рядки виду `${SEGMENT_CODE}|${clientId}` (формат UI-сегмента, не 1С —
 * 'OTHER' а не 'ДРУГИЕТМ').
 *
 * Кожен buyer потрапляє рівно в ОДНУ з 4 категорій (без дублювання):
 *   - 'active'    = (segment, client) у forecasts менеджера
 *   - 'new'       = (segment, client) у gap_closures з category=Новий
 *   - 'activation' = (segment, client) у gap_closures з іншою категорією
 *   - 'unplanned' = купив у цьому бренді, АЛЕ ця (segment, client) пара
 *                   НЕ в жодному плановому списку
 *
 * Σ (active + activation + new + unplanned) = totalFact (без переcікань).
 */

export type BucketKey = 'active' | 'activation' | 'new' | 'unplanned';

// Старі ключі — для зворотньої сумісності з UI типами (CategoryStatsTable
// очікує active/sleeping/lost/new/none у byCategory). Маппимо нашу
// 4-bucket-логіку у цей формат: active=active, activation→sleeping,
// new=new, інші ключі лишаються 0.
export type CatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

export interface FactSegment {
  segmentCode: string;
  clients: Array<{ clientId: string; factAmountUSD: number | string }>;
}

import type { ClientCategoryStats } from './types';

export interface ManagerResult {
  /** Логін менеджера — потрібен для діагностики дублів (хто з ким пересікся). */
  login?: string;
  /** Action 2 повертає список клієнтів менеджера. clientName потрібен щоб у
   *  meta-діагностиці дублів показати читабельне ім'я. */
  clients: Array<{ clientId: string; clientName?: string; category?: string; isReserved?: boolean; purchases?: Array<{ segmentCode: string; lastPurchaseDate?: string }> }>;
  segments: FactSegment[];
}

export interface CategoryStat {
  factCount: number;
  factSum: number;
}

export interface SegmentStats {
  byCategory: Record<CatKey, CategoryStat>;
  unplanned: CategoryStat;
}

export interface DuplicateOccurrence {
  login: string;
  factAmountUSD: number;
}

export interface DuplicateEntry {
  segmentCode: string;
  clientId: string;
  clientName: string;
  occurrences: DuplicateOccurrence[];
}

export interface AggregateResult {
  bySegment: Record<string, SegmentStats>;
  /** Діагностика dedup: скільки повторних (segment, client) пропущено та на яку суму. */
  dedup: {
    skippedCount: number;
    skippedSum: number;
    uniquePairs: number;
    /** Топ-N конкретних дублів — для дебагу хто з ким пересікся. */
    duplicates: DuplicateEntry[];
  };
}

export interface PlanBuckets {
  forecastClientIds?: string[] | null;
  gapNewClientIds?: string[] | null;
  gapActivationClientIds?: string[] | null;
}

export function mapSegmentCode(code: string): string {
  if (code === 'ДРУГИЕТМ') return 'OTHER';
  return code;
}

// === Клієнти по 1С-категорії (унікальні): база / заплановано / купили ===
export type ClientCat = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

/** 1С-категорія клієнта → ключ. Локальна копія (файл тримаємо без залежностей). */
function mapClientCat(category: string | null | undefined): ClientCat {
  const s = (category ?? '').trim().toLowerCase();
  // Вже UI-ключ (з БД-зрізу client_category_history) — пропускаємо без ремапу.
  if (s === 'active' || s === 'sleeping' || s === 'lost' || s === 'new' || s === 'none') return s as ClientCat;
  // Сирі 1С-категорії (live-шлях Action 2).
  if (s === 'активный' || s === 'активний') return 'active';
  if (s === 'спящий' || s === 'сплячий') return 'sleeping';
  if (s === 'потерянный' || s === 'втрачений') return 'lost';
  if (s === 'новый' || s === 'новий') return 'new';
  return 'none'; // «без закупок» + невідомі
}

export interface ClientCatCounts { base: number; planned: number; bought: number }
export interface ClientCategoryBreakdown {
  region: Record<ClientCat, ClientCatCounts>;
  byManager: Array<{ login: string; byCategory: Record<ClientCat, ClientCatCounts> }>;
}

const CLIENT_CATS: readonly ClientCat[] = ['active', 'sleeping', 'lost', 'new', 'none'];
function emptyClientCat(): Record<ClientCat, ClientCatCounts> {
  return {
    active: { base: 0, planned: 0, bought: 0 },
    sleeping: { base: 0, planned: 0, bought: 0 },
    lost: { base: 0, planned: 0, bought: 0 },
    new: { base: 0, planned: 0, bought: 0 },
    none: { base: 0, planned: 0, bought: 0 },
  };
}

/**
 * Розбивка клієнтів по 1С-категорії (УНІКАЛЬНІ, per manager + region-total):
 *   base    — усього клієнтів категорії у ростері менеджера (Action 2).
 *   planned — з них ті, у кого є план ХОЧА Б в одному бренді (plannedClientIds).
 *   bought  — з них ті, хто купив цього місяця (fact > 0, Action 3).
 * Клієнт рахується РІВНО раз (по своїй 1С-категорії), незалежно від к-сті брендів
 * — на відміну від `bySegment` де сума plannedCount «не унікальна».
 */
export function aggregateClientCategoryStats(
  managers: ManagerResult[],
  plannedClientIds: string[],
): ClientCategoryBreakdown {
  const plannedSet = new Set(plannedClientIds.filter(Boolean));
  const region = emptyClientCat();
  const byManager: ClientCategoryBreakdown['byManager'] = [];
  for (const m of managers) {
    // Клієнти які купили цього місяця (унік. clientId з fact > 0).
    const boughtSet = new Set<string>();
    for (const seg of m.segments) {
      for (const c of seg.clients ?? []) {
        const amt = typeof c.factAmountUSD === 'number' ? c.factAmountUSD : parseFloat(String(c.factAmountUSD));
        if (Number.isFinite(amt) && amt > 0 && c.clientId) boughtSet.add(c.clientId);
      }
    }
    const mgr = emptyClientCat();
    const seen = new Set<string>();
    for (const cl of m.clients) {
      if (!cl.clientId || seen.has(cl.clientId)) continue;
      if (cl.isReserved) continue; // Резерв виключений (як з планування)
      seen.add(cl.clientId);
      const cat = mapClientCat(cl.category);
      mgr[cat].base += 1;
      if (plannedSet.has(cl.clientId)) mgr[cat].planned += 1;
      if (boughtSet.has(cl.clientId)) mgr[cat].bought += 1;
    }
    for (const c of CLIENT_CATS) {
      region[c].base += mgr[c].base;
      region[c].planned += mgr[c].planned;
      region[c].bought += mgr[c].bought;
    }
    byManager.push({ login: m.login ?? '', byCategory: mgr });
  }
  return { region, byManager };
}

/**
 * Мапить резерв-виключений `clientCategory.region` (base/planned/bought) у формат
 * картки `ClientStatsCard` (total/bought). Використовується на дашбордах, щоб
 * карточка «Клієнти — факт купівель» була БЕЗ резерву (як Тижневий звіт та
 * /clients), а не з сирих Action 5 clientStats (де резерв не відокремлений).
 */
export function clientCategoryToStats(cc: Record<ClientCat, ClientCatCounts>): ClientCategoryStats {
  const totalClients = cc.active.base + cc.sleeping.base + cc.lost.base + cc.new.base + cc.none.base;
  const totalBought = cc.active.bought + cc.sleeping.bought + cc.lost.bought + cc.new.bought + cc.none.bought;
  return {
    active: { total: cc.active.base, bought: cc.active.bought },
    sleeping: { total: cc.sleeping.base, bought: cc.sleeping.bought },
    lost: { total: cc.lost.base, bought: cc.lost.bought },
    newClients: { total: cc.new.base, bought: cc.new.bought },
    none: { total: cc.none.base, bought: cc.none.bought },
    totalBought,
    totalClients,
  };
}

function emptyStat(): CategoryStat {
  return { factCount: 0, factSum: 0 };
}

function emptySegmentStats(): SegmentStats {
  return {
    byCategory: {
      active: emptyStat(),
      sleeping: emptyStat(),
      lost: emptyStat(),
      new: emptyStat(),
      none: emptyStat(),
    },
    unplanned: emptyStat(),
  };
}

export function aggregateRegionStats(
  managerResults: ManagerResult[],
  planBuckets: PlanBuckets,
): AggregateResult {
  const forecastSet = new Set<string>(
    Array.isArray(planBuckets.forecastClientIds)
      ? planBuckets.forecastClientIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
  );
  const gapNewSet = new Set<string>(
    Array.isArray(planBuckets.gapNewClientIds)
      ? planBuckets.gapNewClientIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
  );
  const gapActSet = new Set<string>(
    Array.isArray(planBuckets.gapActivationClientIds)
      ? planBuckets.gapActivationClientIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
  );

  const bySegment: Record<string, SegmentStats> = {};
  const ensureSeg = (seg: string) => {
    if (!bySegment[seg]) bySegment[seg] = emptySegmentStats();
    return bySegment[seg];
  };

  // ⚠️ Dedup per (segment, client) + діагностика.
  // Підтверджено емпірично 2026-05-11: dedup ЗМЕНШИВ суму $343k → $325k
  // (різниця ~$18k = 5%). Тобто у проді РЕАЛЬНО зустрічається повторення
  // (segment, client) між менеджерами, попри теоретичне правило
  // «1 клієнт = 1 менеджер». Можливі джерела:
  //   - переходи між менеджерами протягом місяця;
  //   - тимчасова підмінка (відпустка) — обидва бачать продажі;
  //   - дані 1С після переключення відповідального ще «теплі» у двох гілках.
  // Action 5 (hero «Факт») групує на стороні 1С — звідси і має менше.
  // Тут рахуємо КОЖНУ пару (segment, client) лише раз.
  // Логуємо стат у meta — щоб видно було скільки $ і скільки пар
  // спрацювало dedup. Якщо одного дня dedupSkipped = 0 — правило
  // дотримується ідеально.
  const seenPairs = new Map<string, number>();
  let dedupSkippedCount = 0;
  let dedupSkippedSum = 0;
  // Зберігаємо ВСІ occurrences кожної пари (для діагностики дублів).
  // Map<pairKey, Array<{login, factAmountUSD}>>
  const pairOccurrences = new Map<string, DuplicateOccurrence[]>();
  // Map<clientId, clientName> з усіх Action 2 — для читабельного виводу
  const clientNameById = new Map<string, string>();
  for (const r of managerResults) {
    for (const c of r.clients ?? []) {
      if (c?.clientId && c.clientName) clientNameById.set(c.clientId, c.clientName);
    }
  }

  for (const r of managerResults) {
    const login = r.login ?? '';
    const segments = Array.isArray(r.segments) ? r.segments : [];
    if (segments.length === 0) continue;

    for (const seg of segments) {
      if (!seg || !seg.segmentCode) continue;
      const segCode = mapSegmentCode(seg.segmentCode);
      const sBlock = ensureSeg(segCode);
      const buyers = Array.isArray(seg.clients) ? seg.clients : [];
      for (const buyer of buyers) {
        if (!buyer || !buyer.clientId) continue;
        const amt = typeof buyer.factAmountUSD === 'number'
          ? buyer.factAmountUSD
          : parseFloat(String(buyer.factAmountUSD));
        if (!Number.isFinite(amt) || amt === 0) continue;

        const pairKey = `${segCode}|${buyer.clientId}`;
        const prevCount = seenPairs.get(pairKey) ?? 0;
        seenPairs.set(pairKey, prevCount + 1);
        // Зберігаємо occurrence для діагностики
        if (!pairOccurrences.has(pairKey)) pairOccurrences.set(pairKey, []);
        pairOccurrences.get(pairKey)!.push({ login, factAmountUSD: amt });
        if (prevCount > 0) {
          // Дубль (segment, client) між менеджерами — рахуємо стат і скіпаємо.
          dedupSkippedCount += 1;
          dedupSkippedSum += amt;
          continue;
        }

        // Пріоритет: forecast → gapNew → gapAct → unplanned. Кожен buyer
        // у РІВНО одній категорії. Σ = totalFact (без переcікань).
        // Ключ КЛАСИФІКАЦІЇ — `${segment}|${clientId}` (не лише clientId),
        // інакше client запланований у бренді A і купує у бренді B
        // фейково потрапляє у «Активні» по бренду B.
        const planKey = `${segCode}|${buyer.clientId}`;
        if (forecastSet.has(planKey)) {
          sBlock.byCategory.active.factSum += amt;
          sBlock.byCategory.active.factCount += 1;
        } else if (gapNewSet.has(planKey)) {
          sBlock.byCategory.new.factSum += amt;
          sBlock.byCategory.new.factCount += 1;
        } else if (gapActSet.has(planKey)) {
          // 'sleeping' — frontend колапсує sleeping+lost+none у «Активізація»
          sBlock.byCategory.sleeping.factSum += amt;
          sBlock.byCategory.sleeping.factCount += 1;
        } else {
          sBlock.unplanned.factSum += amt;
          sBlock.unplanned.factCount += 1;
        }
      }
    }
  }

  // Збираємо ТОП дублі (де occurrences.length > 1) для діагностики.
  // Сортуємо за загальною сумою повторного internal-факту (DESC) — найбільші
  // дублі зверху, щоб user одразу бачила хто найбільше впливає.
  const duplicates: DuplicateEntry[] = [];
  for (const [pairKey, occs] of pairOccurrences) {
    if (occs.length < 2) continue;
    const [segmentCode, clientId] = pairKey.split('|');
    duplicates.push({
      segmentCode,
      clientId,
      clientName: clientNameById.get(clientId) ?? clientId,
      occurrences: occs,
    });
  }
  duplicates.sort((a, b) => {
    const sumA = a.occurrences.reduce((s, o) => s + o.factAmountUSD, 0);
    const sumB = b.occurrences.reduce((s, o) => s + o.factAmountUSD, 0);
    return sumB - sumA;
  });

  return {
    bySegment,
    dedup: {
      skippedCount: dedupSkippedCount,
      skippedSum: dedupSkippedSum,
      uniquePairs: seenPairs.size,
      duplicates,
    },
  };
}
