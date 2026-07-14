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
import { AsyncCache, periodTouchesCurrentMonth, CURRENT_MONTH_TTL_MS } from './cache-helper';

// AsyncCache: дедуплікує race при cache miss + LRU eviction + frozen return.
const METRICS_CACHE = new AsyncCache<BrandChannelMetrics[]>(5 * 60 * 1000, 'metrics');

// Обгортки для legacy викликів у цьому файлі.
function cacheGet(key: string, ttlOverrideMs?: number): BrandChannelMetrics[] | null {
  return METRICS_CACHE.get(key, ttlOverrideMs);
}
function cacheSet(key: string, data: BrandChannelMetrics[]) {
  METRICS_CACHE.set(key, data);
}

export interface BrandChannelMetrics {
  brand: StrategicBrand | 'НЕ_МАПНУТО';
  channel: StrategicChannel;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  avg_qty_per_client: number;
  avg_check_usd: number;
  rows: number;
  // ТОТАЛ суми за весь період (не усереднений). Для 1 місяця = total_sum_usd;
  // для квартал/рік total_sum_usd усереднений, а це — реальна сума за період.
  // Використовується як знаменник частки промо (інакше доля роздувалась ×N).
  period_total_sum_usd?: number;
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

// ============================================================================
// Batch RPC (migration 031): період + YTD одним запитом на сервері.
// Це прискорює перше завантаження strategic-kpi у 8-10 разів.
// ============================================================================
interface KpiBatchRow {
  brand: string; channel: string;
  period_uc: number; period_qty: number | string; period_sum: number | string; period_rows: number;
  ytd_uc: number;    ytd_qty: number | string;    ytd_sum: number | string;    ytd_rows: number;
}

function toMetric(row: KpiBatchRow, side: 'period' | 'ytd'): BrandChannelMetrics {
  const uc  = side === 'period' ? row.period_uc  : row.ytd_uc;
  const qty = Number(side === 'period' ? row.period_qty : row.ytd_qty);
  const sum = Number(side === 'period' ? row.period_sum : row.ytd_sum);
  const rows = side === 'period' ? row.period_rows : row.ytd_rows;
  return {
    brand: row.brand as BrandChannelMetrics['brand'],
    channel: row.channel as StrategicChannel,
    unique_clients: uc,
    total_qty: Math.round(qty * 100) / 100,
    total_sum_usd: Math.round(sum * 100) / 100,
    avg_qty_per_client: uc > 0 ? Math.round((qty / uc) * 100) / 100 : 0,
    avg_check_usd: uc > 0 ? Math.round((sum / uc) * 100) / 100 : 0,
    rows,
  };
}

// ============================================================================
// Averaged batch RPC (migration 034): усереднений monthly агрегат для
// квартал/півріччя/рік + YTD одним запитом.
// ============================================================================
interface KpiAveragedRow {
  brand: string; channel: string;
  period_uc: number; period_qty: number | string; period_sum: number | string;
  /** 047: реальна (НЕ усереднена) сума за весь період — знаменник частки промо.
   *  Optional — до застосування міграції 047 RPC її не повертає (fallback на
   *  total_sum_usd у фронті, як раніше). */
  period_sum_total?: number | string;
  period_avg_qc: number | string; period_avg_chk: number | string; period_rows: number;
  ytd_uc: number; ytd_qty: number | string; ytd_sum: number | string; ytd_rows: number;
}

function toAveragedMetric(row: KpiAveragedRow): BrandChannelMetrics {
  const uc  = row.period_uc;
  const qty = Number(row.period_qty);
  const sum = Number(row.period_sum);
  const avgQc  = Number(row.period_avg_qc);
  const avgChk = Number(row.period_avg_chk);
  // Guard: якщо колонки ще нема (міграція 047 не застосована) — лишаємо undefined,
  // щоб фронт коректно впав на total_sum_usd, а не на NaN.
  const sumTotal = row.period_sum_total != null ? Number(row.period_sum_total) : NaN;
  return {
    brand: row.brand as BrandChannelMetrics['brand'],
    channel: row.channel as StrategicChannel,
    unique_clients: uc,
    total_qty: Math.round(qty * 100) / 100,
    total_sum_usd: Math.round(sum * 100) / 100,
    period_total_sum_usd: Number.isFinite(sumTotal) ? Math.round(sumTotal * 100) / 100 : undefined,
    avg_qty_per_client: Math.round(avgQc * 100) / 100,
    avg_check_usd: Math.round(avgChk * 100) / 100,
    rows: row.period_rows,
  };
}

/**
 * Батч-версія для періодів > 1 місяця (квартал/півріччя/рік). SQL робить
 * monthly-групування + AVG() на сервері за ~500-800 мс замість 30-120
 * REST-раундів (4-10 сек) у JS. Fallback — старий JS-шлях.
 */
export async function fetchKpiMetricsAveragedBatch(
  periodFrom: string,
  periodTo: string,
  ytdFrom: string,
): Promise<{ period: BrandChannelMetrics[]; ytd: BrandChannelMetrics[] }> {
  const periodKey = `avg|${periodFrom}|${periodTo}`;
  const ytdKey    = `single|${ytdFrom}|${periodTo}`;
  const ttl = periodTouchesCurrentMonth(periodTo) ? CURRENT_MONTH_TTL_MS : undefined;

  const cP = cacheGet(periodKey, ttl);
  const cY = cacheGet(ytdKey, ttl);
  if (cP && cY) return { period: cP, ytd: cY };

  const rpc = await supabase.rpc<KpiAveragedRow[]>('get_kpi_metrics_averaged', {
    p_from: periodFrom,
    p_to: periodTo,
    p_ytd_from: ytdFrom,
  });

  if (!rpc.error && Array.isArray(rpc.data)) {
    const period: BrandChannelMetrics[] = [];
    const ytd: BrandChannelMetrics[] = [];
    for (const row of rpc.data) {
      if (row.period_rows > 0) period.push(toAveragedMetric(row));
      if (row.ytd_rows > 0) {
        const uc  = row.ytd_uc;
        const qty = Number(row.ytd_qty);
        const sum = Number(row.ytd_sum);
        ytd.push({
          brand: row.brand as BrandChannelMetrics['brand'],
          channel: row.channel as StrategicChannel,
          unique_clients: uc,
          total_qty: Math.round(qty * 100) / 100,
          total_sum_usd: Math.round(sum * 100) / 100,
          avg_qty_per_client: uc > 0 ? Math.round((qty / uc) * 100) / 100 : 0,
          avg_check_usd: uc > 0 ? Math.round((sum / uc) * 100) / 100 : 0,
          rows: row.ytd_rows,
        });
      }
    }
    cacheSet(periodKey, period);
    cacheSet(ytdKey, ytd);
    return { period, ytd };
  }
  if (rpc.error) {
    console.warn('[aggregate] get_kpi_metrics_averaged RPC failed, JS fallback:', rpc.error.message);
  }

  // Fallback: JS-шлях
  const [period, ytd] = await Promise.all([
    aggregatePeriodMetricsAveraged(periodFrom, periodTo),
    aggregateBrandChannelMetrics(ytdFrom, periodTo),
  ]);
  return { period, ytd };
}

/**
 * Батч-версія: один RPC повертає одразу period + YTD агрегати.
 * Заповнює обидва кеш-ключі щоб наступні виклики були cache-hit.
 * Fallback на JS-шлях якщо RPC відсутня (migration 031 не застосована).
 */
export async function fetchKpiMetricsBatch(
  periodFrom: string,
  periodTo: string,
  ytdFrom: string,
): Promise<{ period: BrandChannelMetrics[]; ytd: BrandChannelMetrics[] }> {
  const periodKey = `single|${periodFrom}|${periodTo}`;
  const ytdKey    = `single|${ytdFrom}|${periodTo}`;
  const ttl = periodTouchesCurrentMonth(periodTo) ? CURRENT_MONTH_TTL_MS : undefined;

  const cP = cacheGet(periodKey, ttl);
  const cY = cacheGet(ytdKey, ttl);
  if (cP && cY) return { period: cP, ytd: cY };

  // ── Швидкий шлях: rollup (передпорахований, ~80мс замість ~2-5с скану 150K).
  // Ті самі колонки що live RPC. periodFrom = початок місяця 'YYYY-MM-01T…Z',
  // ytdFrom завжди = початок року → rollup.uc_ytd (Jan..month) збігається.
  // Якщо місяць ще не у rollup (не перерахований) — падаємо на live RPC нижче.
  // Свіжість: rollup оновлюється refresh_kpi_rollup() після кожного доливу sales
  // (backfill). Live sales-екшен у майбутньому — просто рефрешити частіше.
  const ry = parseInt(periodFrom.slice(0, 4), 10);
  const rm = parseInt(periodFrom.slice(5, 7), 10);
  if (Number.isFinite(ry) && Number.isFinite(rm)) {
    const roll = await supabase.rpc<KpiBatchRow[]>('get_kpi_metrics_batch_rollup', {
      p_year: ry,
      p_month: rm,
    });
    if (!roll.error && Array.isArray(roll.data) && roll.data.length > 0) {
      const period: BrandChannelMetrics[] = [];
      const ytd: BrandChannelMetrics[] = [];
      for (const row of roll.data) {
        if (row.period_rows > 0) period.push(toMetric(row, 'period'));
        if (row.ytd_rows > 0)    ytd.push(toMetric(row, 'ytd'));
      }
      cacheSet(periodKey, period);
      cacheSet(ytdKey, ytd);
      return { period, ytd };
    }
  }

  const rpc = await supabase.rpc<KpiBatchRow[]>('get_kpi_metrics_batch', {
    p_from: periodFrom,
    p_to: periodTo,
    p_ytd_from: ytdFrom,
  });

  if (!rpc.error && Array.isArray(rpc.data)) {
    const period: BrandChannelMetrics[] = [];
    const ytd: BrandChannelMetrics[] = [];
    for (const row of rpc.data) {
      if (row.period_rows > 0) period.push(toMetric(row, 'period'));
      if (row.ytd_rows > 0)    ytd.push(toMetric(row, 'ytd'));
    }
    cacheSet(periodKey, period);
    cacheSet(ytdKey, ytd);
    return { period, ytd };
  }
  if (rpc.error) {
    console.warn('[aggregate] get_kpi_metrics_batch RPC failed, JS fallback:', rpc.error.message);
  }

  // Fallback: два послідовні JS-агрегати (як раніше)
  const [period, ytd] = await Promise.all([
    aggregateBrandChannelMetrics(periodFrom, periodTo),
    aggregateBrandChannelMetrics(ytdFrom, periodTo),
  ]);
  return { period, ytd };
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
  const cacheKey = `single|${dateFrom}|${dateTo}`;
  const c = cacheGet(cacheKey);
  if (c) return c;

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
  cacheSet(cacheKey, result);
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
 * Скільки МІСЯЦІВ у діапазоні [from, to). Використовується для середнього
 * при квартал/півріччя/рік показниках.
 */
export function countMonthsInRange(from: string, to: string): number {
  const f = new Date(from);
  const t = new Date(to);
  return (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
}

/**
 * Період-метрики: середнє з місячних агрегацій.
 * Для kind='month' збігається з aggregateBrandChannelMetrics (там же 1 місяць).
 * Для періодів > 1 місяця — рахуємо метрики per місяць і усереднюємо.
 *
 * Логіка:
 *   - Тягнемо всі валідні рядки [from, to) одним запитом (з ORDER BY id, порційно)
 *   - Групуємо у 2 рівні: (year, month) → (brand, channel) → aggregate
 *   - Для кожного (brand, channel) отримуємо масив monthly метрик
 *   - Повертаємо середні: mean(unique_clients), mean(avg_qty_per_client), mean(avg_check_usd)
 *
 * Це правильна семантика для «Купують у місяць», «ср/уп», «середній чек»:
 *   у Q2 маємо середнє за квіт+трав+чер, не сумарну активність кварталу.
 */
interface SalesRowWithDate extends SalesRow {
  sale_date: string;
}

async function fetchValidSalesWithDate(dateFromIso: string, dateToIso: string): Promise<SalesRowWithDate[]> {
  const out: SalesRowWithDate[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const result = await supabase
      .from('sales')
      .select('brand,channel,client_code,qty,sum_usd,sale_date')
      .gte('sale_date', dateFromIso)
      .lt('sale_date', dateToIso)
      .eq('is_ignored', false)
      .eq('is_gift', false)
      .eq('is_excluded', false)
      .neq('brand', 'НЕ_МАПНУТО')
      .order('id')
      .range(from, from + PAGE - 1);
    if (result.error || !result.data) throw new Error(`sales fetch: ${result.error?.message || 'no data'}`);
    const rows = result.data as unknown as SalesRowWithDate[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function aggregatePeriodMetricsAveraged(
  dateFrom: string,
  dateTo: string,
): Promise<BrandChannelMetrics[]> {
  const monthsCount = countMonthsInRange(dateFrom, dateTo);
  if (monthsCount <= 1) {
    // Для одного місяця середнє = сама метрика
    return aggregateBrandChannelMetrics(dateFrom, dateTo);
  }

  const cacheKey = `avg|${dateFrom}|${dateTo}`;
  const c = cacheGet(cacheKey);
  if (c) return c;

  const rows = await fetchValidSalesWithDate(dateFrom, dateTo);

  // 2-рівнева групація: monthKey → (brand|channel) → aggregation state
  const byMonth = new Map<string, Map<string, {
    brand: string;
    channel: string;
    clients: Set<string>;
    qty: number;
    sum: number;
    rows: number;
  }>>();

  for (const r of rows) {
    const d = new Date(r.sale_date);
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let monthMap = byMonth.get(monthKey);
    if (!monthMap) {
      monthMap = new Map();
      byMonth.set(monthKey, monthMap);
    }
    const bcKey = `${r.brand}|${r.channel}`;
    let bucket = monthMap.get(bcKey);
    if (!bucket) {
      bucket = { brand: r.brand, channel: r.channel, clients: new Set(), qty: 0, sum: 0, rows: 0 };
      monthMap.set(bcKey, bucket);
    }
    bucket.clients.add(r.client_code);
    bucket.qty += Number(r.qty);
    bucket.sum += Number(r.sum_usd);
    bucket.rows += 1;
  }

  // Тепер для кожного (brand × channel) збираємо масив monthly метрик та усереднюємо
  const perBc = new Map<string, {
    brand: string;
    channel: string;
    clientsSum: number;   // сума monthly unique_clients
    qtySum: number;       // сума monthly total_qty
    sumSum: number;       // сума monthly total_sum
    avgQtyPerClientSum: number;  // сума monthly avg_qty_per_client
    avgCheckSum: number;         // сума monthly avg_check
    monthCount: number;
    rowsSum: number;
  }>();

  for (const monthMap of byMonth.values()) {
    for (const [bcKey, bucket] of monthMap) {
      let p = perBc.get(bcKey);
      if (!p) {
        p = {
          brand: bucket.brand,
          channel: bucket.channel,
          clientsSum: 0, qtySum: 0, sumSum: 0,
          avgQtyPerClientSum: 0, avgCheckSum: 0,
          monthCount: 0, rowsSum: 0,
        };
        perBc.set(bcKey, p);
      }
      const n = bucket.clients.size;
      p.clientsSum += n;
      p.qtySum += bucket.qty;
      p.sumSum += bucket.sum;
      p.avgQtyPerClientSum += n > 0 ? bucket.qty / n : 0;
      p.avgCheckSum += n > 0 ? bucket.sum / n : 0;
      p.monthCount += 1;
      p.rowsSum += bucket.rows;
    }
  }

  const result: BrandChannelMetrics[] = [];
  for (const p of perBc.values()) {
    const mc = p.monthCount;
    result.push({
      brand: p.brand as BrandChannelMetrics['brand'],
      channel: p.channel as StrategicChannel,
      // Середні МІСЯЧНІ значення (за період)
      unique_clients: mc > 0 ? Math.round(p.clientsSum / mc) : 0,
      total_qty: Math.round((p.qtySum / mc) * 100) / 100,       // середня qty за місяць
      total_sum_usd: Math.round((p.sumSum / mc) * 100) / 100,   // середня сума за місяць
      period_total_sum_usd: Math.round(p.sumSum * 100) / 100,    // ТОТАЛ за період (для частки промо)
      avg_qty_per_client: mc > 0 ? Math.round((p.avgQtyPerClientSum / mc) * 100) / 100 : 0,
      avg_check_usd: mc > 0 ? Math.round((p.avgCheckSum / mc) * 100) / 100 : 0,
      rows: p.rowsSum,
    });
  }
  cacheSet(cacheKey, result);
  return result;
}

/**
 * Гнучкий period parser. Підтримує:
 *   - '2026-06'       → місяць
 *   - '2026-Q2'       → квартал (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
 *   - '2026-H1'       → півріччя (H1=Jan-Jun, H2=Jul-Dec)
 *   - '2026'          → цілий рік
 *
 * monthIndex — для pace / пропорційного розрахунку:
 *   місяць N → N (1..12)
 *   квартал Q → останній місяць кварталу (Q1=3, Q2=6, Q3=9, Q4=12)
 *   півріччя H → останній місяць півріччя (H1=6, H2=12)
 *   рік       → 12
 */
export function parsePeriod(period: string): {
  from: string; to: string;
  kind: 'month' | 'quarter' | 'half' | 'year';
  year: number;
  monthIndex: number;
  label: string;
} {
  const p = period.trim();

  // Місяць '2026-06' або '2026-06-01'
  const monthMatch = p.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (monthMatch) {
    const y = Number(monthMatch[1]);
    const m = Number(monthMatch[2]);
    const from = `${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`;
    return { from, to, kind: 'month', year: y, monthIndex: m, label: `${y}-${String(m).padStart(2, '0')}` };
  }

  // Квартал '2026-Q2'
  const qMatch = p.match(/^(\d{4})-Q([1-4])$/i);
  if (qMatch) {
    const y = Number(qMatch[1]);
    const q = Number(qMatch[2]);
    const startMonth = (q - 1) * 3 + 1;      // Q1=1, Q2=4, Q3=7, Q4=10
    const endMonth = q * 3;                   // Q1=3, Q2=6, Q3=9, Q4=12
    const from = `${y}-${String(startMonth).padStart(2, '0')}-01T00:00:00Z`;
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear = endMonth === 12 ? y + 1 : y;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`;
    return { from, to, kind: 'quarter', year: y, monthIndex: endMonth, label: `${y}-Q${q}` };
  }

  // Півріччя '2026-H1'
  const hMatch = p.match(/^(\d{4})-H([12])$/i);
  if (hMatch) {
    const y = Number(hMatch[1]);
    const h = Number(hMatch[2]);
    const startMonth = h === 1 ? 1 : 7;
    const endMonth = h === 1 ? 6 : 12;
    const from = `${y}-${String(startMonth).padStart(2, '0')}-01T00:00:00Z`;
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear = endMonth === 12 ? y + 1 : y;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00Z`;
    return { from, to, kind: 'half', year: y, monthIndex: endMonth, label: `${y}-H${h}` };
  }

  // Рік '2026'
  const yMatch = p.match(/^(\d{4})$/);
  if (yMatch) {
    const y = Number(yMatch[1]);
    return { from: `${y}-01-01T00:00:00Z`, to: `${y + 1}-01-01T00:00:00Z`, kind: 'year', year: y, monthIndex: 12, label: `${y}` };
  }

  throw new Error(`Invalid period: ${period}. Use YYYY-MM, YYYY-Qn, YYYY-Hn або YYYY.`);
}

/** Backward compat — старий monthRange. */
export function monthRange(period: string): { from: string; to: string; monthKey: string; monthIndex: number } {
  const p = parsePeriod(period);
  return { from: p.from, to: p.to, monthKey: p.label, monthIndex: p.monthIndex };
}
