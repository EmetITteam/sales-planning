/**
 * Pure-функція агрегації region-stats. Винесена з API route щоб тестувалась
 * без HTTP / сесій / 1С-моків.
 *
 * Вхід: масив (clients, segments) пар по кожному менеджеру.
 * Вихід: bySegment з byCategory + unplanned (підмножина).
 *
 * Класифікація клієнтів:
 *   - 'new'      = 1С-категорія `Новий` (це справжній 1С-маркер)
 *   - 'active'   = lastPurchaseDate ЦЬОГО сегмента ≥ asOfMs − 90д
 *   - 'sleeping' = (НЕ new) AND (НЕ active) — все інше; frontend колапсує
 *                  sleeping/lost/none у «Активізація»
 *   - 'unplanned' = ОКРЕМИЙ ЗРІЗ (підмножина): buyer чий ID НЕМАЄ у
 *                  plannedClientIds. Може пересікатися з усіма категоріями.
 *
 * havePlanInfo:
 *   - undefined / null → клієнт ще не отримав planAgg, unplanned лишається 0
 *   - [] (пустий)      → план реально порожній, ВСІ buyers стають unplanned
 */

export type CatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

export interface ClientWithPurchases {
  clientId: string;
  category?: string;
  purchases?: Array<{ segmentCode: string; lastPurchaseDate?: string }>;
}

export interface FactSegment {
  segmentCode: string;
  clients: Array<{ clientId: string; factAmountUSD: number | string }>;
}

export interface ManagerResult {
  clients: ClientWithPurchases[];
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
}

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

export function isRecentBrandPurchase(
  dateStr: string | null | undefined,
  cutoffMs: number,
): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d).getTime() >= cutoffMs;
}

export function isNewClient1C(raw: string | null | undefined): boolean {
  const c = (raw || '').toLowerCase().trim();
  return c === 'новый' || c === 'новий';
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
  plannedClientIds: string[] | null | undefined,
  asOfMs: number = Date.now(),
): AggregateResult {
  const havePlanInfo = Array.isArray(plannedClientIds);
  const plannedSet = new Set<string>(
    Array.isArray(plannedClientIds)
      ? plannedClientIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
  );
  const cutoffMs = asOfMs - THREE_MONTHS_MS;
  const bySegment: Record<string, SegmentStats> = {};
  const ensureSeg = (seg: string) => {
    if (!bySegment[seg]) bySegment[seg] = emptySegmentStats();
    return bySegment[seg];
  };

  for (const r of managerResults) {
    const clients = Array.isArray(r.clients) ? r.clients : [];
    const segments = Array.isArray(r.segments) ? r.segments : [];
    if (clients.length === 0 || segments.length === 0) continue;

    const lastPurchaseBy = new Map<string, string>();
    const newClientSet = new Set<string>();
    for (const c of clients) {
      if (!c || !c.clientId) continue;
      if (isNewClient1C(c.category)) newClientSet.add(c.clientId);
      const purchases = Array.isArray(c.purchases) ? c.purchases : [];
      for (const p of purchases) {
        if (!p || !p.segmentCode || !p.lastPurchaseDate) continue;
        const segCode = mapSegmentCode(p.segmentCode);
        lastPurchaseBy.set(`${c.clientId}|${segCode}`, p.lastPurchaseDate);
      }
    }

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

        let cat: CatKey;
        if (newClientSet.has(buyer.clientId)) {
          cat = 'new';
        } else {
          const lpd = lastPurchaseBy.get(`${buyer.clientId}|${segCode}`);
          cat = isRecentBrandPurchase(lpd, cutoffMs) ? 'active' : 'sleeping';
        }

        sBlock.byCategory[cat].factSum += amt;
        sBlock.byCategory[cat].factCount += 1;

        if (havePlanInfo && !plannedSet.has(buyer.clientId)) {
          sBlock.unplanned.factSum += amt;
          sBlock.unplanned.factCount += 1;
        }
      }
    }
  }

  return { bySegment };
}
