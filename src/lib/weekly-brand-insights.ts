/**
 * Агрегація інсайтів по бренду для Тижневого звіту (з таблиці `sales`):
 *   - topPromos — топ-3 акції бренду, що спрацювали (унік. клієнти, сума, %
 *     від усіх, хто купив бренд);
 *   - focusBought — клієнти, що купили «по фокусу» (повод містить «Фокус»);
 *   - totalBuyers — усього унік. клієнтів, що купили бренд у періоді.
 *
 * Ключ результату — SEGMENT-код звіту (VITARAN, IUSE, OTHER…): sales.brand
 * рол-апиться у сегмент (IUSE SB/hair/Coll. → IUSE; БАД/інше → OTHER).
 *
 * Pure-функція (без HTTP/1С) — тестується окремо.
 */
import { detectPromoTriggerBrand } from './strategic-kpi/sales-classifier';

export interface InsightRow {
  brand: string;      // sales.brand
  discount: string;   // повод
  client_code: string;
  sum_usd: number;
}

export interface PromoOut { name: string; clients: number; sum: number; pct: number }
export interface BrandInsight {
  totalBuyers: number;
  focusParticipants: number;  // з focus_participants (крон); заповнює API
  focusBought: number;
  focusSum: number;
  topPromos: PromoOut[];
}

/** Назва регіону (UA/RU) → `division` у sales (російські назви міст). */
const DIV_ALIASES: Record<string, string> = {
  'київ': 'Киев', 'киев': 'Киев',
  'одеса': 'Одесса', 'одесса': 'Одесса',
  'дніпро': 'Днепр', 'днепр': 'Днепр', 'днипро': 'Днепр',
  'харків': 'Харьков', 'харьков': 'Харьков',
  'вінниця': 'Винница', 'винница': 'Винница',
  'запоріжжя': 'Запорожье', 'запорожье': 'Запорожье',
  'миколаїв': 'Николаев', 'николаев': 'Николаев',
  'житомир': 'Житомир',
  'херсон': 'Херсон',
};
export function regionToDivision(regionName: string | null | undefined): string | null {
  return DIV_ALIASES[(regionName || '').toLowerCase().trim()] ?? null;
}

/** sales.brand → SEGMENT-код Тижневого звіту (SEGMENTS у mock-data). */
export function brandToSegment(brand: string): string {
  switch (brand) {
    case 'Vitaran': return 'VITARAN';
    case 'Neuronox': return 'NEURONOX';
    case 'Ellanse': return 'ELLANSE';
    case 'Petaran': return 'PETARAN';
    case 'Neuramis': return 'NEURAMIS';
    case 'EXOXE': return 'EXOXE';
    case 'ESSE': return 'ESSE';
    case 'IUSE SB':
    case 'IUSE hair':
    case 'IUSE Coll.': return 'IUSE';
    // Сегмент «Інші ТМ» (OTHER) = бренди «Vitaran Cosmetics» (Exosome/Centella)
    // + «БАД» (Магнокс). Обидва рол-апляться в один сегмент відображення.
    case 'Vitaran Cosmetics':
    case 'БАД': return 'OTHER';
    default: return 'OTHER'; // інше нерозпізнане
  }
}

const FOCUS_RE = /фокус/i;
const DISCOUNT_RE = /%|від\s*\d|\(\d{2}\.\d{2}\)/i;
/** «Справжня акція» — бренд-тригер або знижковий патерн (як у реактивації). */
function isRealPromo(discount: string): boolean {
  const d = (discount ?? '').trim();
  if (!d) return false;
  return !!detectPromoTriggerBrand(d) || DISCOUNT_RE.test(d);
}

/**
 * @param rows валідні продажі (не gift/ignored/excluded, brand != НЕ_МАПНУТО)
 *             за період та регіон (division).
 * @returns map SEGMENT-код → BrandInsight
 */
export function aggregateBrandInsights(rows: InsightRow[]): Record<string, BrandInsight> {
  // seg → { buyers:Set, focus:Set, focusSum, promo: Map<name,{cl:Set,sum}> }
  interface Acc { buyers: Set<string>; focus: Set<string>; focusSum: number; promo: Map<string, { cl: Set<string>; sum: number }> }
  const acc: Record<string, Acc> = {};
  const get = (seg: string): Acc => (acc[seg] ??= { buyers: new Set(), focus: new Set(), focusSum: 0, promo: new Map() });

  for (const r of rows) {
    const seg = brandToSegment(r.brand);
    const a = get(seg);
    a.buyers.add(r.client_code);
    const d = (r.discount ?? '').trim();
    if (FOCUS_RE.test(d)) {
      a.focus.add(r.client_code);
      a.focusSum += Number(r.sum_usd) || 0;
    } else if (isRealPromo(d)) {
      let p = a.promo.get(d);
      if (!p) { p = { cl: new Set(), sum: 0 }; a.promo.set(d, p); }
      p.cl.add(r.client_code);
      p.sum += Number(r.sum_usd) || 0;
    }
  }

  const out: Record<string, BrandInsight> = {};
  for (const [seg, a] of Object.entries(acc)) {
    const totalBuyers = a.buyers.size;
    const topPromos: PromoOut[] = [...a.promo.entries()]
      .map(([name, v]) => ({ name, clients: v.cl.size, sum: Math.round(v.sum), pct: totalBuyers > 0 ? Math.round((v.cl.size / totalBuyers) * 1000) / 10 : 0 }))
      .sort((x, y) => y.clients - x.clients)
      .slice(0, 3);
    out[seg] = { totalBuyers, focusParticipants: 0, focusBought: a.focus.size, focusSum: Math.round(a.focusSum), topPromos };
  }
  return out;
}
