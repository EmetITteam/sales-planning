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
  brand: string;      // sales.brand (бренд ТОВАРУ рядка)
  discount: string;   // повод
  client_code: string;
  sum_usd: number;
  is_gift?: boolean;  // подарунковий рядок ($0). Фокус часто стоїть саме на ньому.
  doc_id?: string;    // документ — для «схлопування» $0-акцій з покупками того ж доку.
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
  // «СХЛОПУВАННЯ» (як Стратегія, promos.ts DocSums): $0 gift/free-рядок акції треба
  // рахувати не по його нулю, а по РЕАЛЬНИХ покупках trigger-товару в ТОМУ Ж
  // документі. Приклад: «4 продукта по цене 3-х» стоїть на безкоштовному 4-му
  // товарі ($0), а 3 оплачені ($189) — під «VitaranCosm −10%» у тому ж doc.
  // docSum: реальна сума покупок сегменту per документ (без подарунків).
  const docSum = new Map<string, number>(); // `${doc_id}|${seg}` → сума
  for (const r of rows) {
    if (r.is_gift || r.brand === 'НЕ_МАПНУТО' || !r.doc_id) continue;
    const k = `${r.doc_id}|${brandToSegment(r.brand)}`;
    docSum.set(k, (docSum.get(k) ?? 0) + (Number(r.sum_usd) || 0));
  }
  const sumOfDocs = (docKeys: Set<string>) => { let s = 0; for (const k of docKeys) s += docSum.get(k) ?? 0; return s; };

  // seg → набори клієнтів/документів (сума рахується через docSum наприкінці).
  interface Acc { buyers: Set<string>; focus: Set<string>; focusDocs: Set<string>; promo: Map<string, { cl: Set<string>; docs: Set<string> }> }
  const acc: Record<string, Acc> = {};
  const get = (seg: string): Acc => (acc[seg] ??= { buyers: new Set(), focus: new Set(), focusDocs: new Set(), promo: new Map() });

  for (const r of rows) {
    const d = (r.discount ?? '').trim();
    const isFocus = FOCUS_RE.test(d);

    // ФОКУС — атрибуція по бренду-ТРИГЕРУ поводу (як Стратегія: detectPromoTriggerBrand),
    // а НЕ по бренду товару рядка. Бо повод «Фокус: …PETARAN 2шт+Подарок VITARAN Tox Eye»
    // фізично стоїть на подарунковому Tox Eye ($0, brand=Vitaran) — але фокус це PETARAN.
    // Сума фокусу — теж по покупках trigger-сегменту у тих самих документах (docSum).
    if (isFocus) {
      const fseg = brandToSegment(detectPromoTriggerBrand(d) ?? r.brand);
      const fa = get(fseg);
      fa.focus.add(r.client_code);
      if (r.doc_id) fa.focusDocs.add(`${r.doc_id}|${fseg}`);
    }

    // ПОКУПКИ / ТОП-АКЦІЇ — лише реальні рядки (не подарунок, розпізнаний бренд).
    if (!r.is_gift && r.brand !== 'НЕ_МАПНУТО') {
      const seg = brandToSegment(r.brand);
      const a = get(seg);
      a.buyers.add(r.client_code);
      // Топ-акції — не-фокусні знижкові поводи (фокус рахується окремо, вище).
      if (!isFocus && isRealPromo(d)) {
        let p = a.promo.get(d);
        if (!p) { p = { cl: new Set(), docs: new Set() }; a.promo.set(d, p); }
        p.cl.add(r.client_code);
        if (r.doc_id) p.docs.add(`${r.doc_id}|${seg}`);
      }
    }
  }

  const out: Record<string, BrandInsight> = {};
  for (const [seg, a] of Object.entries(acc)) {
    const totalBuyers = a.buyers.size;
    const topPromos: PromoOut[] = [...a.promo.entries()]
      .map(([name, v]) => ({ name, clients: v.cl.size, sum: Math.round(sumOfDocs(v.docs)), pct: totalBuyers > 0 ? Math.round((v.cl.size / totalBuyers) * 1000) / 10 : 0 }))
      .sort((x, y) => y.clients - x.clients)
      .slice(0, 3);
    out[seg] = { totalBuyers, focusParticipants: 0, focusBought: a.focus.size, focusSum: Math.round(sumOfDocs(a.focusDocs)), topPromos };
  }
  return out;
}
