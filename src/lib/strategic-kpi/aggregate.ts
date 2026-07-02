/**
 * Агрегація стратегічних KPI із таблиці `sales`.
 *
 * Ми не робимо GROUP BY через SQL (Supabase Postgres RPC це вміє, але щоб не
 * плодити SQL-функції — тягнемо порційно і агрегуємо у JS). При 5-10K рядках
 * на місяць це < 100 мс.
 *
 * Фільтр валідних рядків:
 *   NOT is_ignored AND NOT is_gift AND NOT is_excluded AND brand != 'НЕ_МАПНУТО'
 *
 * Для промо — окремо у promos.ts (там беруться raw rows включно з gift).
 */

import { supabase } from '@/lib/supabase';
import type { StrategicBrand, StrategicChannel } from './brands';

export interface BrandChannelMetrics {
  brand: StrategicBrand | 'НЕ_МАПНУТО';
  channel: StrategicChannel;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  avg_qty_per_client: number;
  avg_check_usd: number;
  rows: number;
}

interface SalesRow {
  brand: string;
  channel: string;
  client_code: string;
  qty: number;
  sum_usd: number;
}

/**
 * Тягне всі валідні рядки sales у діапазоні дат порційно (Range header).
 * Ліміт REST = 1000 рядків / запит.
 *
 * ПРАВИЛО (ITD 2026-07-02):
 *   Клієнт що ТІЛЬКИ отримав бренд як подарунок (без платної покупки) — НЕ
 *   рахується як клієнт цього бренду. Тому фільтр is_gift=false залишаємо.
 */
async function fetchValidSales(dateFromIso: string, dateToIso: string): Promise<SalesRow[]> {
  const out: SalesRow[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    // ORDER BY ОБОВ'ЯЗКОВО для порційної пагінації — без нього PostgREST повертає
    // рядки у непередбачуваному порядку і між сторінками може пропускати/дублювати
    // (був bug 2026-07-02: 108 клієнтів Vitaran пропали між page 0-999 і 1000-1999).
    const result = await supabase
      .from('sales')
      .select('brand,channel,client_code,qty,sum_usd')
      .gte('sale_date', dateFromIso)
      .lt('sale_date', dateToIso)
      .eq('is_ignored', false)
      .eq('is_gift', false)
      .eq('is_excluded', false)
      .neq('brand', 'НЕ_МАПНУТО')
      .order('id')
      .range(from, from + PAGE - 1);

    if (result.error || !result.data) {
      throw new Error(`sales fetch: ${result.error?.message || 'no data'}`);
    }
    const rows = result.data as unknown as SalesRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Агрегує рядки sales у метрики (per бренд × канал).
 *
 * @param dateFrom  ISO дата початку (включно): '2026-06-01T00:00:00Z'
 * @param dateTo    ISO дата кінця (виключно): '2026-07-01T00:00:00Z'
 */
export async function aggregateBrandChannelMetrics(
  dateFrom: string,
  dateTo: string,
): Promise<BrandChannelMetrics[]> {
  const rows = await fetchValidSales(dateFrom, dateTo);

  const bucketMap = new Map<string, {
    brand: string;
    channel: string;
    clients: Set<string>;
    qty: number;
    sum: number;
    rows: number;
  }>();

  for (const r of rows) {
    const key = `${r.brand}|${r.channel}`;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = { brand: r.brand, channel: r.channel, clients: new Set(), qty: 0, sum: 0, rows: 0 };
      bucketMap.set(key, bucket);
    }
    bucket.clients.add(r.client_code);
    bucket.qty += Number(r.qty);
    bucket.sum += Number(r.sum_usd);
    bucket.rows += 1;
  }

  const result: BrandChannelMetrics[] = [];
  for (const b of bucketMap.values()) {
    const n = b.clients.size;
    result.push({
      brand: b.brand as BrandChannelMetrics['brand'],
      channel: b.channel as StrategicChannel,
      unique_clients: n,
      total_qty: Math.round(b.qty * 100) / 100,
      total_sum_usd: Math.round(b.sum * 100) / 100,
      avg_qty_per_client: n > 0 ? Math.round((b.qty / n) * 100) / 100 : 0,
      avg_check_usd: n > 0 ? Math.round((b.sum / n) * 100) / 100 : 0,
      rows: b.rows,
    });
  }
  return result;
}

/**
 * YTD (Year-To-Date) для річних цілей — усі рядки з початку року до кінця
 * обраного місяця. Використовується для розрахунку % виконання річних цілей.
 */
export async function aggregateYTDMetrics(
  year: number,
  throughMonthEndIso: string,
): Promise<BrandChannelMetrics[]> {
  const yearStart = `${year}-01-01T00:00:00Z`;
  return aggregateBrandChannelMetrics(yearStart, throughMonthEndIso);
}

/**
 * Місячна дата: перший день місяця → перший день наступного (виключно).
 * Приймає period='2026-06' або '2026-06-01'.
 */
export function monthRange(period: string): { from: string; to: string; monthKey: string; monthIndex: number } {
  const monthKey = period.slice(0, 7); // '2026-06'
  const [y, m] = monthKey.split('-').map(Number);
  const from = `${monthKey}-01T00:00:00Z`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`;
  return { from, to, monthKey, monthIndex: m };
}
