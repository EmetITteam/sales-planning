/**
 * Промо-акції: топ-N за унікальними клієнтами per бренд × канал × місяць.
 *
 * Логіка з analytics-june-final.py:
 *   - Беремо raw rows з поводом скидки (включно з is_gift=true — акції що
 *     переносять gift на бренд-тригер, як «Vitaran 700$ + Подарок Marine Collagen»)
 *   - Виключаємо non-promo (Реклама/ДР/Гонорар — це is_excluded=true)
 *   - Виключаємо Амбассадор+free (is_excluded=true)
 *   - Виключаємо is_ignored (розхідники не мають промо)
 *   - Trigger brand = детект з тексту поводу («частина до Подарок»)
 *   - Показуємо у блоці trigger brand (не gift_brand)
 */

import { supabase } from '@/lib/supabase';
import type { StrategicBrand, StrategicChannel } from './brands';
import { AsyncCache } from './cache-helper';

// 5-хв кеш з дедуплікацією in-flight запитів + LRU eviction + frozen return
const PROMOS_CACHE = new AsyncCache<Promo[]>(5 * 60 * 1000, 'promos');

export interface Promo {
  name: string;
  brand: StrategicBrand | 'НЕ_МАПНУТО';
  channel: StrategicChannel;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  is_gift: boolean;
  gift_brand: string | null;
  // Overlap з іншим промо ТОГО ж бренду у ТОМУ ж періоді. Якщо промо А (знижка)
  // і промо B (gift) мають високий overlap (>50%) — це фактично ОДНА акція
  // розписана у 1С двома поводами. Показуємо це у UI.
  overlap_with?: {
    name: string;         // текст пов'язаного повода
    is_gift: boolean;     // чи то gift
    clients: number;      // скільки унікальних клієнтів у overlap
  };
}

interface PromoRow {
  doc_id: string;
  discount: string;
  brand: string;
  channel: string;
  client_code: string;
  qty: number;
  sum_usd: number;
  is_gift: boolean;
  gift_brand: string | null;
}

/**
 * Для gift-акцій треба знати «скільки клієнти реально купили trigger товару» —
 * не $0 з gift-рядків, а суму пов'язаних покупок у тих же документах.
 * Тримаємо мапу doc_id → sum trigger_brand у цьому документі.
 */
interface DocSums {
  [docId: string]: { brand: string; sum: number; qty: number };
}

// ============================================================================
// Brand detection на тексті поводу — той самий набір що у backfill/scripts
// ============================================================================
const BRAND_RULES: [StrategicBrand | 'НЕ_МАПНУТО', RegExp][] = [
  ['Neuronox',   /Neuronox|Ботулотоксин/i],
  ['Petaran',    /PETARAN/i],
  ['Ellanse',    /ELLANSE/i],
  ['Vitaran',    /HP\s*CELL\s*VITARAN|VITARAN\s*(?:i\b|Tox|Whitening|Cosm|а\s*ассор)/i],
  ['EXOXE',      /\bEXOXE\b(?!-)/i],
  ['Neuramis',   /NEURAMIS/i],
  ['IUSE SB',    /IUSE.*Skin\s*Booster|Skin\s*Booster/i],
  ['IUSE hair',  /IUSE.*(?:hair|волос)|IUSE\s+H\b/i],
  ['IUSE Coll.', /IUSE.*Collagen|Marine\s*Collagen|Collagen/i],
  ['ESSE',       /\.?ESSE\b|C5\.ESSE|SkinTrial|Skin\s*Trial|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set|Bakuchiol|Biome|Concealer|tube|Sensitive)/i],
  ['БАД',        /MAGNOX|Дієтична\s*добавк|Диетическая\s*добавк|БАД/i],
];

function detectPromoTriggerBrand(discount: string): StrategicBrand | 'НЕ_МАПНУТО' | null {
  if (!discount) return null;
  const triggerPart = discount.split(/Подар(?:ок|унок)/i)[0];
  for (const [brand, pat] of BRAND_RULES) {
    if (pat.test(triggerPart)) return brand;
  }
  return null;
}

/**
 * Тягне всі рядки з поводом скидки для конкретного місяця.
 * Виключає is_ignored/is_excluded (non-promo). Включає is_gift (потрібне
 * щоб побачити gift-only акції як «Vitaran 700$ + Подарок Marine Collagen»).
 */
async function fetchPromoRows(dateFrom: string, dateTo: string): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const result = await supabase
      .from('sales')
      .select('doc_id,discount,brand,channel,client_code,qty,sum_usd,is_gift,gift_brand')
      .gte('sale_date', dateFrom)
      .lt('sale_date', dateTo)
      .eq('is_ignored', false)
      .eq('is_excluded', false)
      .not('discount', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);

    if (result.error || !result.data) {
      throw new Error(`promos fetch: ${result.error?.message || 'no data'}`);
    }
    const rows = result.data as unknown as PromoRow[];
    const filtered = rows.filter(r => r.discount && r.discount.length > 0);
    out.push(...filtered);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Тягне суми trigger-покупок для БАГАТЬОХ промо ОДРАЗУ. Для gift-акцій треба
 * показати «на яку суму купували» не 0 (з gift-рядка), а РЕАЛЬНУ суму
 * trigger товару у тих же документах.
 *
 * Раніше було N+1: цикл по промо × окремий запит на кожне (по 300-500 мс кожен
 * = 15-25 сек на бренд з 50+ gift-промо). Тепер: 1 запит з великим IN, потім
 * розподіл по бекетах у JS.
 *
 * @param buckets  { promoKey: { brand: string; docIds: string[] } }
 * @returns Map<promoKey, { sum, qty }>
 */
async function fetchTriggerSumsBatch(
  buckets: Array<{ key: string; brand: string; docIds: string[] }>,
): Promise<Map<string, { sum: number; qty: number }>> {
  const result = new Map<string, { sum: number; qty: number }>();
  for (const b of buckets) result.set(b.key, { sum: 0, qty: 0 });
  if (buckets.length === 0) return result;

  // Об'єднаний масив унікальних doc_id
  const allDocSet = new Set<string>();
  for (const b of buckets) for (const d of b.docIds) allDocSet.add(d);
  const allDocs = Array.from(allDocSet);
  if (allDocs.length === 0) return result;

  // Тягнемо всі рядки по цих doc_id за одним запитом (порційно тільки якщо
  // GET URL довжина > лімітів — PostgREST мовчки обрізає).
  interface Row { doc_id: string; brand: string; sum_usd: number; qty: number }
  const allRows: Row[] = [];
  // CHUNK 100 замість 200 (audit Agent 4): при 200 × 12-char + escape ≈ 2.4KB
  // що може обрізуватись PostgREST мовчки. 100 × 12-char ≈ 1.2KB — безпечний
  // запас під більшість URL-лімітів (Vercel/Cloudflare 4-8KB).
  const CHUNK = 100;
  for (let i = 0; i < allDocs.length; i += CHUNK) {
    const chunk = allDocs.slice(i, i + CHUNK);
    const res = await supabase
      .from('sales')
      .select('doc_id,brand,sum_usd,qty')
      .in('doc_id', chunk)
      .eq('is_ignored', false)
      .eq('is_gift', false);
    if (res.error || !res.data) continue;
    allRows.push(...(res.data as unknown as Row[]));
  }

  // Індекс: (doc_id, brand) → aggregated { sum, qty }
  const idx = new Map<string, { sum: number; qty: number }>();
  for (const r of allRows) {
    const k = `${r.doc_id}|${r.brand}`;
    let agg = idx.get(k);
    if (!agg) { agg = { sum: 0, qty: 0 }; idx.set(k, agg); }
    agg.sum += Number(r.sum_usd);
    agg.qty += Number(r.qty);
  }

  // Розподіляємо суми по бекетах промо
  for (const b of buckets) {
    let totalSum = 0, totalQty = 0;
    for (const d of b.docIds) {
      const agg = idx.get(`${d}|${b.brand}`);
      if (agg) { totalSum += agg.sum; totalQty += agg.qty; }
    }
    result.set(b.key, { sum: totalSum, qty: totalQty });
  }
  return result;
}

/**
 * Групує промо за унікальним текстом поводу. Trigger brand визначається з
 * тексту (якщо не знайдено — беремо brand з рядка).
 *
 * Для gift-акцій (sum=0 у самих рядках) — окремим кроком тягнемо суму
 * trigger товару у ТИХ ЖЕ документах, щоб показати «на скільки купували
 * щоб отримати подарунок».
 */
export async function aggregatePromos(dateFrom: string, dateTo: string): Promise<Promo[]> {
  return PROMOS_CACHE.getOrLoad(`${dateFrom}|${dateTo}`, () => computePromos(dateFrom, dateTo));
}

async function computePromos(dateFrom: string, dateTo: string): Promise<Promo[]> {
  const rows = await fetchPromoRows(dateFrom, dateTo);

  const promoMap = new Map<string, {
    name: string;
    trigger_brand: string | null;
    channel: string;
    clients: Set<string>;
    doc_ids: Set<string>;
    qty: number;
    sum: number;
    is_gift_any: boolean;
    gift_brand: string | null;
  }>();

  for (const r of rows) {
    if (!r.discount) continue;
    let triggerBrand: string | null = detectPromoTriggerBrand(r.discount);
    if (!triggerBrand) triggerBrand = r.brand === 'НЕ_МАПНУТО' ? null : r.brand;
    if (!triggerBrand) continue;

    const key = `${r.discount}||${r.channel}`;
    let bucket = promoMap.get(key);
    if (!bucket) {
      bucket = {
        name: r.discount,
        trigger_brand: triggerBrand,
        channel: r.channel,
        clients: new Set(),
        doc_ids: new Set(),
        qty: 0,
        sum: 0,
        is_gift_any: false,
        gift_brand: null,
      };
      promoMap.set(key, bucket);
    }
    bucket.clients.add(r.client_code);
    bucket.doc_ids.add(r.doc_id);
    bucket.qty += Number(r.qty);
    bucket.sum += Number(r.sum_usd);
    if (r.is_gift) bucket.is_gift_any = true;
    if (r.gift_brand && !bucket.gift_brand) bucket.gift_brand = r.gift_brand;
  }

  // ============================================================================
  // OVERLAP: для кожного промо рахуємо перекриття з АГРЕГАТОМ усіх промо
  // ПРОТИЛЕЖНОЇ сторони (discount ↔ gift) того ж бренду × каналу.
  //
  // Приклад: клієнт отримав «Vitaran+Marine Collagen» (gift) АЛЕ його знижка
  // це «Vitaran -15% (05.26)» або «Амбассадор Vitaran» — інший рядок discount.
  // Pair-wise порівняння того не побачить, тому агрегуємо всі discount-промо
  // бренду в одну множину клієнтів і рахуємо overlap проти неї.
  //
  // Для UI overlap_with.name показує НАЙБІЛЬШИЙ окремий пов'язаний повод —
  // це найінформативніше, але clients рахуємо проти ВСЬОГО агрегату.
  // ============================================================================
  const buckets = Array.from(promoMap.values());
  const overlapMap = new Map<string, { name: string; is_gift: boolean; clients: number }>();

  // Ключ агрегата: brand||channel||side (side='gift' | 'disc')
  const sideAggregates = new Map<string, Set<string>>();
  const brandChannelSet = new Set<string>();
  for (const b of buckets) {
    if (!b.trigger_brand) continue;
    const bcKey = `${b.trigger_brand}||${b.channel}`;
    brandChannelSet.add(bcKey);
    const side = b.is_gift_any ? 'gift' : 'disc';
    const aggKey = `${bcKey}||${side}`;
    let agg = sideAggregates.get(aggKey);
    if (!agg) { agg = new Set(); sideAggregates.set(aggKey, agg); }
    for (const c of b.clients) agg.add(c);
  }

  for (const b of buckets) {
    if (!b.trigger_brand) continue;
    const bcKey = `${b.trigger_brand}||${b.channel}`;
    const oppositeSide = b.is_gift_any ? 'disc' : 'gift';
    const opposite = sideAggregates.get(`${bcKey}||${oppositeSide}`);
    if (!opposite || opposite.size === 0) continue;

    // Overlap проти всього агрегату протилежної сторони
    let overlapTotal = 0;
    for (const c of b.clients) if (opposite.has(c)) overlapTotal++;
    if (overlapTotal === 0) continue;

    // Найбільший окремий партнер (для label у UI)
    let bestPartner: { name: string; is_gift: boolean; clients: number } | null = null;
    for (const other of buckets) {
      if (other === b) continue;
      if (other.trigger_brand !== b.trigger_brand || other.channel !== b.channel) continue;
      if (other.is_gift_any === b.is_gift_any) continue;
      let pairOverlap = 0;
      for (const c of b.clients) if (other.clients.has(c)) pairOverlap++;
      if (pairOverlap > 0 && (!bestPartner || pairOverlap > bestPartner.clients)) {
        bestPartner = { name: other.name, is_gift: other.is_gift_any, clients: pairOverlap };
      }
    }

    // Записуємо overlap ТІЛЬКИ якщо є конкретний найкращий партнер.
    // Раніше при null bestPartner ставили '(інша сторона)' — це вводило
    // у оману користувача, коли pair-wise overlap = 0 але aggregate > 0
    // (мала фрагментація по багатьох дрібних промо). Тепер UI просто
    // не показує overlap-плашку для таких випадків.
    if (bestPartner) {
      overlapMap.set(`${b.name}||${b.channel}`, {
        name: bestPartner.name,
        is_gift: !b.is_gift_any,
        clients: overlapTotal,
      });
    }
  }

  // Батчимо всі промо з sum=0 у один запит trigger-sums. Раніше було N+1:
  // цикл × окремий REST-запит на кожне промо (по 300-500 мс) → 15-25 сек.
  const needTrigger: Array<{ key: string; brand: string; docIds: string[] }> = [];
  for (const b of promoMap.values()) {
    if (b.sum === 0 && b.trigger_brand) {
      needTrigger.push({
        key: `${b.name}||${b.channel}`,
        brand: b.trigger_brand,
        docIds: Array.from(b.doc_ids),
      });
    }
  }
  const triggerSums = await fetchTriggerSumsBatch(needTrigger);

  const result: Promo[] = [];
  for (const b of promoMap.values()) {
    const qty = b.qty;
    let sum = b.sum;
    if (sum === 0 && b.trigger_brand) {
      const trigger = triggerSums.get(`${b.name}||${b.channel}`);
      if (trigger) sum = trigger.sum;
    }
    const overlapInfo = overlapMap.get(`${b.name}||${b.channel}`);
    // Dedup правило (ITD 2026-07-02): якщо discount-промо перекликається з
    // gift-промо у тому ж бренді/каналі, то overlap-клієнти зараховуємо у gift
    // (це «сплеск» продажу — тригер акції). У discount-рядку показуємо тільки
    // ЧИСТУ знижку (без gift-overlap). Гарантія: сума unique_clients по gift+
    // discount = загальний унік. Не буде подвоєння у верхньоплановій цифрі.
    // Gift-сторона залишається як є (усі overlap-клієнти зараховуються сюди).
    let uc = b.clients.size;
    if (!b.is_gift_any && overlapInfo && overlapInfo.is_gift) {
      uc = Math.max(0, uc - overlapInfo.clients);
    }
    result.push({
      name: b.name,
      brand: b.trigger_brand as Promo['brand'],
      channel: b.channel as StrategicChannel,
      unique_clients: uc,
      total_qty: Math.round(qty * 100) / 100,
      total_sum_usd: Math.round(sum * 100) / 100,
      is_gift: b.is_gift_any,
      gift_brand: b.gift_brand,
      overlap_with: overlapInfo,
    });
  }
  return result;
}

/**
 * Топ-N промо для конкретного бренду × каналу за клієнтами.
 */
export function topPromosForBrand(
  promos: Promo[],
  brand: StrategicBrand,
  channel: StrategicChannel,
  n = 5,
): Promo[] {
  return promos
    .filter(p => p.brand === brand && p.channel === channel)
    .sort((a, b) => b.unique_clients - a.unique_clients)
    .slice(0, n);
}
