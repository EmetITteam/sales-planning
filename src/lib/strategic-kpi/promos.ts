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
import { AsyncCache, periodTouchesCurrentMonth, CURRENT_MONTH_TTL_MS } from './cache-helper';
import { detectPromoTriggerBrand } from './sales-classifier';

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
  // Реальний Set клієнтів — використовується для точного dedup у segment-агрегаціях.
  // НЕ віддається у UI (route.ts не мапить це поле у відповідь).
  client_codes?: string[];
  overlap_with?: {
    name: string;
    is_gift: boolean;
    clients: number;
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

// Тригер-бренд поводу — КАНОНІЧНИЙ detectPromoTriggerBrand з класифікатора
// (single source). Раніше promos.ts мав свою копію BRAND_RULES, що розійшлася
// (IUSE Coll. з голим «Collagen», ESSE без «Gift set 2026») → тригер у ТОП-5
// не збігався з колонкою promo_trigger_brand у Реактивації. Тепер один набір.

// Суфікс місяця у назві промо: «... -47% (05.26)». Одну й ту саму акцію 1С
// маркує різними місяцями (05.26 / 06.26) — це фактично одне промо, тому при
// групуванні суфікс прибираємо, а у UI показуємо суфіксом ВИБРАНОГО періоду.
const MONTH_SUFFIX_RE = /\s*\(\d{2}\.\d{2}\)\s*$/;
function stripPromoMonthSuffix(name: string): string {
  return name.replace(MONTH_SUFFIX_RE, '').trim();
}
// Суфікс місяця для показу — ТІЛЬКИ якщо період рівно 1 місяць (напр. '06.26').
// Для періодів > 1 місяця (квартал/півріччя/рік) повертаємо null: акції все одно
// схлопуються за базовою назвою, але БЕЗ конкретного місяця — інакше червневий
// «Collagen» у піврічному звіті показувався б як «(01.26)» (підміна місяця).
function periodMonthSuffix(dateFromIso: string, dateToIso: string): string | null {
  const f = new Date(dateFromIso), t = new Date(dateToIso);
  const span = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
  if (span !== 1) return null;
  return `${dateFromIso.slice(5, 7)}.${dateFromIso.slice(2, 4)}`;
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
      // ⚠️ ORDER BY sale_date (не id!): фільтр по sale_date + ORDER BY id
      // змушував planner сканувати весь id-індекс (266K), бо крон пере-вставляє
      // поточний місяць зі свіжими max(id) → липень у хвості → statement timeout
      // (57014). idx_sales_sale_date робить range миттєвим; id — вторинний для
      // стабільної пагінації (у документа однаковий sale_date на всіх рядках).
      .order('sale_date')
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
  const PAGE = 1000;
  for (let i = 0; i < allDocs.length; i += CHUNK) {
    const chunk = allDocs.slice(i, i + CHUNK);
    // Пагінація з .order('id') — 100 мультипозиційних B2B-документів можуть дати
    // >1000 рядків, і PostgREST мовчки обрізав би на 1000-му → недосчёт trigger-сум.
    let off = 0;
    for (;;) {
      const res = await supabase
        .from('sales')
        .select('doc_id,brand,sum_usd,qty')
        .in('doc_id', chunk)
        .eq('is_ignored', false)
        .eq('is_gift', false)
        .order('id')
        .range(off, off + PAGE - 1);
      if (res.error || !res.data) break;
      const rows = res.data as unknown as Row[];
      allRows.push(...rows);
      if (rows.length < PAGE) break;
      off += PAGE;
    }
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
  const ttl = periodTouchesCurrentMonth(dateTo) ? CURRENT_MONTH_TTL_MS : undefined;
  return PROMOS_CACHE.getOrLoad(`${dateFrom}|${dateTo}`, () => computePromos(dateFrom, dateTo), ttl);
}

async function computePromos(dateFrom: string, dateTo: string): Promise<Promo[]> {
  const rows = await fetchPromoRows(dateFrom, dateTo);

  const periodSuffix = periodMonthSuffix(dateFrom, dateTo);

  const promoMap = new Map<string, {
    name: string;              // базова назва БЕЗ суфікса місяця
    had_suffix: boolean;       // чи хоч один варіант мав суфікс (05.26)
    trigger_brand: string | null;
    channel: string;
    clients: Set<string>;
    doc_ids: Set<string>;
    pairs: Set<string>;        // `${client_code}|${doc_id}` — для overlap по документу
    clientSum: Map<string, number>;  // сума per клієнт — щоб вирахувати gift-earners
    clientQty: Map<string, number>;
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

    // Групуємо за базовою назвою (без місяця) — щоб (05.26) і (06.26) злились.
    const baseName = stripPromoMonthSuffix(r.discount);
    const key = `${baseName}||${r.channel}`;
    let bucket = promoMap.get(key);
    if (!bucket) {
      bucket = {
        name: baseName,
        had_suffix: false,
        trigger_brand: triggerBrand,
        channel: r.channel,
        clients: new Set(),
        doc_ids: new Set(),
        pairs: new Set(),
        clientSum: new Map(),
        clientQty: new Map(),
        qty: 0,
        sum: 0,
        is_gift_any: false,
        gift_brand: null,
      };
      promoMap.set(key, bucket);
    }
    if (MONTH_SUFFIX_RE.test(r.discount)) bucket.had_suffix = true;
    bucket.clients.add(r.client_code);
    bucket.doc_ids.add(r.doc_id);
    bucket.pairs.add(`${r.client_code}|${r.doc_id}`);
    bucket.clientSum.set(r.client_code, (bucket.clientSum.get(r.client_code) ?? 0) + Number(r.sum_usd));
    bucket.clientQty.set(r.client_code, (bucket.clientQty.get(r.client_code) ?? 0) + Number(r.qty));
    bucket.qty += Number(r.qty);
    bucket.sum += Number(r.sum_usd);
    if (r.is_gift) bucket.is_gift_any = true;
    if (r.gift_brand && !bucket.gift_brand) bucket.gift_brand = r.gift_brand;
  }

  // ============================================================================
  // OVERLAP по ДОКУМЕНТУ (не по клієнту за місяць!).
  //
  // Подарок зараховуємо промо ТІЛЬКИ якщо gift-рядок у ТІЙ САМІЙ реалізації
  // (doc_id), що й повод-знижка. Інакше клієнт з окремою покупкою «від 4х +
  // Подарок» помилково додавав подарунок до непов'язаної «-3,5% від 2х»
  // (баг ITD 2026-07-03: щоб отримати коллаген треба $700 = 4+ уп., це НЕ
  // може бути в -3,5%-від-2х покупці).
  //
  // Тому: overlap = клієнти цього промо, у яких документ цього промо є ТАКОЖ
  // документом протилежної сторони (gift). Партнер для label — gift-промо з
  // найбільшим числом спільних документів.
  // ============================================================================
  const buckets = Array.from(promoMap.values());
  const overlapMap = new Map<string, { name: string; is_gift: boolean; clients: number; clientSet: Set<string> }>();

  // Ключ агрегата: brand||channel||side — множина doc_id тієї сторони.
  const sideDocs = new Map<string, Set<string>>();
  for (const b of buckets) {
    if (!b.trigger_brand) continue;
    const side = b.is_gift_any ? 'gift' : 'disc';
    const aggKey = `${b.trigger_brand}||${b.channel}||${side}`;
    let agg = sideDocs.get(aggKey);
    if (!agg) { agg = new Set(); sideDocs.set(aggKey, agg); }
    for (const d of b.doc_ids) agg.add(d);
  }

  for (const b of buckets) {
    if (!b.trigger_brand) continue;
    const bcKey = `${b.trigger_brand}||${b.channel}`;
    const oppositeSide = b.is_gift_any ? 'disc' : 'gift';
    const oppositeDocs = sideDocs.get(`${bcKey}||${oppositeSide}`);
    if (!oppositeDocs || oppositeDocs.size === 0) continue;

    // Overlap-клієнти: чий документ цього промо є і документом протилежної сторони.
    const overlapClients = new Set<string>();
    for (const pair of b.pairs) {
      const sep = pair.lastIndexOf('|');
      const doc = pair.slice(sep + 1);
      if (oppositeDocs.has(doc)) overlapClients.add(pair.slice(0, sep));
    }
    const overlapTotal = overlapClients.size;
    if (overlapTotal === 0) continue;

    // Найбільший партнер протилежної сторони — за числом СПІЛЬНИХ документів.
    let bestPartner: { name: string; is_gift: boolean; clients: number } | null = null;
    for (const other of buckets) {
      if (other === b) continue;
      if (other.trigger_brand !== b.trigger_brand || other.channel !== b.channel) continue;
      if (other.is_gift_any === b.is_gift_any) continue;
      let sharedDocs = 0;
      for (const d of b.doc_ids) if (other.doc_ids.has(d)) sharedDocs++;
      if (sharedDocs > 0 && (!bestPartner || sharedDocs > bestPartner.clients)) {
        bestPartner = { name: other.name, is_gift: other.is_gift_any, clients: sharedDocs };
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
        clientSet: overlapClients,
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
    let qty = b.qty;
    let sum = b.sum;
    if (sum === 0 && b.trigger_brand) {
      const trigger = triggerSums.get(`${b.name}||${b.channel}`);
      if (trigger) sum = trigger.sum;
    }
    const overlapInfo = overlapMap.get(`${b.name}||${b.channel}`);
    // Client-level: у ЗНИЖКОВОГО промо, що перекликається з подарунком, гроші
    // gift-earners відносимо у подарунок → з знижки віднімаємо ЇХНІ суми/шт
    // (як лічильник клієнтів). Інакше «-15%» показувала 295 кл, але 92% факту
    // (гроші всіх 493). Тепер сума/шт узгоджені з чистими 295 клієнтами.
    if (!b.is_gift_any && overlapInfo && overlapInfo.is_gift) {
      for (const c of overlapInfo.clientSet) {
        sum -= b.clientSum.get(c) ?? 0;
        qty -= b.clientQty.get(c) ?? 0;
      }
    }
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
    // Показуємо базову назву + суфікс ВИБРАНОГО періоду (напр. «06.26»), якщо
    // акція взагалі маркувалась місяцем. Так злиті 05+06 показуються як «06».
    const displayName = (periodSuffix && b.had_suffix) ? `${b.name} (${periodSuffix})` : b.name;
    result.push({
      name: displayName,
      brand: b.trigger_brand as Promo['brand'],
      channel: b.channel as StrategicChannel,
      unique_clients: uc,
      total_qty: Math.round(qty * 100) / 100,
      total_sum_usd: Math.round(sum * 100) / 100,
      is_gift: b.is_gift_any,
      gift_brand: b.gift_brand,
      overlap_with: overlapInfo,
      // Зберігаємо реальний client set (as Array) для точних dedup-агрегацій
      // у segment-блоках. Не віддається у UI — фільтрується у route.ts.
      client_codes: Array.from(b.clients),
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
