/**
 * Категорії клієнтів per бренд × період:
 *   - НОВІ:      клієнти які купили цей бренд у періоді, але НЕ мали жодної
 *                покупки цього бренду до початку періоду (вся історія бази).
 *   - АКТИВНІ:   попередня покупка цього бренду ≤ 120 днів (~4 місяці) до
 *                початку періоду.
 *   - СПЛЯЧІ:    попередня покупка 120 < days ≤ 180 (~4-6 місяців).
 *   - ВТРАЧЕНІ:  попередня покупка > 180 днів.
 *
 * Для квартал/півріччя/рік логіка та сама: клієнт що купив у ПЕРІОДІ →
 * дивимось його попередню покупку ДО початку періоду.
 *
 * Правило узгоджено з ITD 2026-07-02.
 */

import { supabase } from '@/lib/supabase';
import { AsyncCache } from './cache-helper';

const DAY_MS = 24 * 60 * 60 * 1000;

// AsyncCache: 5-хв TTL + dedup race + LRU eviction + frozen return.
const CATEGORIES_CACHE = new AsyncCache<ClientCategories>(5 * 60 * 1000, 'categories');

export interface ClientCategories {
  new: number;
  active: number;
  sleeping: number;
  lost: number;
  total: number;
}

interface SaleRow {
  client_code: string;
  sale_date: string;
}

/**
 * Тягне ВСІ рядки бренду з початку бази до dateTo (виключно), only valid rows.
 * Для великих брендів це може бути ~50K рядків — порційно.
 */
async function fetchAllBrandRows(brand: string, dateToIso: string): Promise<SaleRow[]> {
  const out: SaleRow[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const result = await supabase
      .from('sales')
      .select('client_code,sale_date')
      .eq('brand', brand)
      .lt('sale_date', dateToIso)
      .eq('is_ignored', false)
      .eq('is_gift', false)
      .eq('is_excluded', false)
      .order('id')
      .range(from, from + PAGE - 1);
    if (result.error || !result.data) {
      throw new Error(`categories fetch: ${result.error?.message || 'no data'}`);
    }
    const rows = result.data as unknown as SaleRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Обчислює категорії клієнтів для бренду у [dateFromIso, dateToIso).
 * Кешовано у пам'яті на 5 хвилин.
 *
 * Стратегія (2026-07-02):
 *  1. Спочатку пробуємо SQL RPC функцію `get_brand_client_categories`
 *     (migration 030) — вона робить GROUP BY на сервері за ~500 мс.
 *  2. Якщо RPC не існує (стара БД) — fallback на JS (тягне всі рядки).
 */
export async function getBrandClientCategories(
  brand: string,
  dateFromIso: string,
  dateToIso: string,
): Promise<ClientCategories> {
  const cacheKey = `${brand}|${dateFromIso}|${dateToIso}`;
  return CATEGORIES_CACHE.getOrLoad(cacheKey, () => computeCategories(brand, dateFromIso, dateToIso));
}

async function computeCategories(
  brand: string,
  dateFromIso: string,
  dateToIso: string,
): Promise<ClientCategories> {
  // Пробуємо RPC (швидко)
  interface RpcRow { new_cnt: number; active_cnt: number; sleeping_cnt: number; lost_cnt: number; total_cnt: number }
  const rpc = await supabase.rpc<RpcRow[]>('get_brand_client_categories', {
    p_brand: brand,
    p_from: dateFromIso,
    p_to: dateToIso,
  });
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    const row = rpc.data[0];
    return {
      new: row.new_cnt || 0,
      active: row.active_cnt || 0,
      sleeping: row.sleeping_cnt || 0,
      lost: row.lost_cnt || 0,
      total: row.total_cnt || 0,
    };
  }
  if (rpc.error) {
    console.warn('[categories] RPC failed, using JS fallback:', rpc.error.message);
  }

  // Fallback: JS-логіка
  const rows = await fetchAllBrandRows(brand, dateToIso);
  const periodStart = new Date(dateFromIso).getTime();

  const periodClients = new Map<string, boolean>();
  const lastBefore = new Map<string, number>();

  for (const r of rows) {
    const t = new Date(r.sale_date).getTime();
    if (t >= periodStart) {
      periodClients.set(r.client_code, true);
    } else {
      const cur = lastBefore.get(r.client_code) ?? 0;
      if (t > cur) lastBefore.set(r.client_code, t);
    }
  }

  const result: ClientCategories = { new: 0, active: 0, sleeping: 0, lost: 0, total: 0 };
  for (const client of periodClients.keys()) {
    result.total++;
    const lastT = lastBefore.get(client);
    if (!lastT) {
      result.new++;
    } else {
      const days = (periodStart - lastT) / DAY_MS;
      if (days <= 120) result.active++;
      else if (days <= 180) result.sleeping++;
      else result.lost++;
    }
  }
  return result;
}
