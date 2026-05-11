/**
 * Pure-функція агрегації region-stats. Винесена з API route щоб тестувалась
 * без HTTP / сесій / 1С-моків.
 *
 * Класифікація buyer-ів — ПО ПЛАНУ МЕНЕДЖЕРА (не по 1С-категорії клієнта,
 * не по lastPurchaseDate бренду — ці спроби давали неузгоджені цифри).
 *
 * Кожен buyer потрапляє рівно в ОДНУ з 4 категорій (без дублювання):
 *   - 'active'    = клієнт у forecasts менеджера (Прогноз)
 *   - 'new'       = клієнт у gap_closures з category=Новий
 *   - 'activation' = клієнт у gap_closures з іншою категорією (Сплячий/Втрачений/БЗ)
 *   - 'unplanned' = купив але НЕ ні в forecasts, ні в gap_closures
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

export interface ManagerResult {
  /** Action 2 повертає список клієнтів менеджера. У цьому варіанті алгоритму
   *  ми не використовуємо їх (категорія береться з плану), але endpoint все
   *  одно викликає Action 2 для clientIds → Action 3. */
  clients: Array<{ clientId: string; category?: string; purchases?: Array<{ segmentCode: string; lastPurchaseDate?: string }> }>;
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

export interface AggregateResult {
  bySegment: Record<string, SegmentStats>;
  /** Діагностика dedup: скільки повторних (segment, client) пропущено та на яку суму. */
  dedup: {
    skippedCount: number;
    skippedSum: number;
    uniquePairs: number;
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

  for (const r of managerResults) {
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
        if (prevCount > 0) {
          // Дубль (segment, client) між менеджерами — рахуємо стат і скіпаємо.
          dedupSkippedCount += 1;
          dedupSkippedSum += amt;
          continue;
        }

        // Пріоритет: forecast → gapNew → gapAct → unplanned. Кожен buyer
        // у РІВНО одній категорії. Σ = totalFact (без переcікань).
        const id = buyer.clientId;
        if (forecastSet.has(id)) {
          sBlock.byCategory.active.factSum += amt;
          sBlock.byCategory.active.factCount += 1;
        } else if (gapNewSet.has(id)) {
          sBlock.byCategory.new.factSum += amt;
          sBlock.byCategory.new.factCount += 1;
        } else if (gapActSet.has(id)) {
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

  return {
    bySegment,
    dedup: {
      skippedCount: dedupSkippedCount,
      skippedSum: dedupSkippedSum,
      uniquePairs: seenPairs.size,
    },
  };
}
