/**
 * GET /api/analytics/reactivation?period=YYYY-MM[&brand=Vitaran]
 *
 * Реактивація категорій клієнтів (Нові / Сплячі / Втрачені) у обраному періоді:
 *   - Класифікація станом на 1-е число обраного місяця (p_from)
 *   - Для кожної категорії — розклад по (brand або channel) + по акціях
 *
 * Дані з SQL RPC `get_reactivation_analytics` (migration 032). Мапиться у UI-
 * shape з відсотками від суми категорії.
 *
 * Admin only. Створено 2026-07-02.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { parsePeriod } from '@/lib/strategic-kpi/aggregate';
import { STRATEGIC_BRANDS } from '@/lib/strategic-kpi/brands';
import { AsyncCache } from '@/lib/strategic-kpi/cache-helper';

interface RpcRow {
  category: 'new' | 'sleeping' | 'lost';
  // '__cat_total__' — новий тип рядка з migration 035: справжній COUNT DISTINCT
  // клієнтів у категорії (без double-count по брендах).
  dimension: 'brand' | 'channel' | 'promo' | '__cat_total__';
  key: string;
  unique_clients: number;
  total_qty: number | string;
  total_sum_usd: number | string;
  category_total_sum_usd: number | string;
}

interface DimRow {
  key: string;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  pct_of_category: number;
}

interface CategoryOut {
  total_clients: number;
  total_sum_usd: number;
  // Частка категорії від загальної суми ВСІХ реактивованих (Нові+Сплячі+Втрачені).
  // Наприклад Нові $26.7K із $63K = 42.3%.
  pct_of_reactivation: number;
  by_dim: DimRow[];       // по бренду АБО каналу (залежить чи brand заданий)
  by_promo: DimRow[];     // по discount тексту
}

// AsyncCache: dedup race + frozen return + LRU eviction. Зберігаємо JSON-тіло
// а не Response — Response.body одноразовий і clone у Map дає багато CPU.
interface ReactivationResponse {
  period: string;
  from: string;
  to: string;
  brand: string | null;
  dim_label: 'brand' | 'channel';
  categories: {
    new: CategoryOut;
    sleeping: CategoryOut;
    lost: CategoryOut;
  };
}
const CACHE = new AsyncCache<ReactivationResponse>(5 * 60 * 1000, 'reactivation');

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isStrategicKpiLogin(session.login)) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodParam = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  const brandParam = url.searchParams.get('brand');
  const brand = brandParam && STRATEGIC_BRANDS.includes(brandParam as (typeof STRATEGIC_BRANDS)[number])
    ? brandParam
    : null;

  let parsed;
  try {
    parsed = parsePeriod(periodParam);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const { from, to, label } = parsed;

  const cacheKey = `${brand ?? '_all'}|${from}|${to}`;
  try {
    const body = await CACHE.getOrLoad(cacheKey, () => computeReactivation(brand, from, to, label));
    return Response.json(body);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function computeReactivation(
  brand: string | null,
  from: string,
  to: string,
  label: string,
): Promise<ReactivationResponse> {
  const rpc = await supabase.rpc<RpcRow[]>('get_reactivation_analytics', {
    p_brand: brand,
    p_from: from,
    p_to: to,
  });

  if (rpc.error || !rpc.data) {
    throw new Error(`rpc failed: ${rpc.error?.message ?? 'no data'}`);
  }

  const empty = (): CategoryOut => ({ total_clients: 0, total_sum_usd: 0, pct_of_reactivation: 0, by_dim: [], by_promo: [] });
  const categories: Record<'new' | 'sleeping' | 'lost', CategoryOut> = {
    new: empty(),
    sleeping: empty(),
    lost: empty(),
  };

  // Загальні totals категорії — беремо з першого доступного рядка
  const categoryTotal: Record<string, number> = {};
  for (const r of rpc.data) {
    const catTotal = Number(r.category_total_sum_usd);
    if (!(r.category in categoryTotal) || categoryTotal[r.category] === 0) {
      categoryTotal[r.category] = catTotal;
    }
  }

  // Перший прохід — витягуємо __cat_total__ (true DISTINCT count) для кожної
  // категорії. Він потрібен щоб рахувати % по клієнтах у наступних рядках.
  const categoryTrueTotal: Record<string, number> = { new: 0, sleeping: 0, lost: 0 };
  for (const r of rpc.data) {
    if (r.dimension === '__cat_total__' && r.category in categories) {
      categoryTrueTotal[r.category] = r.unique_clients;
    }
  }

  // Другий прохід — будуємо рядки, % рахуємо ПО КЛІЄНТАХ (не по сумі).
  // Знаменник для brand/channel/promo — categoryTrueTotal (COUNT DISTINCT).
  // Клієнт може бути у 2 брендах — тоді сума pct може перевищувати 100%,
  // це нормально (клієнт «прийшов» на 2 брендах, обидва частково відповідальні).
  for (const r of rpc.data) {
    if (r.dimension === '__cat_total__') continue;
    if (!(r.category in categories)) continue;
    const cat = categories[r.category];
    const sum = Number(r.total_sum_usd);
    const qty = Number(r.total_qty);
    const catUC = categoryTrueTotal[r.category] ?? 0;

    const row: DimRow = {
      key: r.key,
      unique_clients: r.unique_clients,
      total_qty: Math.round(qty * 100) / 100,
      total_sum_usd: Math.round(sum * 100) / 100,
      // % ЗА КЛІЄНТАМИ (не за сумою) — узгоджено з ITD 2026-07-02
      pct_of_category: catUC > 0 ? Math.round((r.unique_clients / catUC) * 1000) / 10 : 0,
    };

    if (r.dimension === 'brand' || r.dimension === 'channel') {
      cat.by_dim.push(row);
    } else if (r.dimension === 'promo') {
      cat.by_promo.push(row);
    }
  }

  for (const cat of ['new', 'sleeping', 'lost'] as const) {
    categories[cat].total_sum_usd = Math.round((categoryTotal[cat] ?? 0) * 100) / 100;
    categories[cat].by_dim = categories[cat].by_dim
      .sort((a, b) => b.unique_clients - a.unique_clients);
    categories[cat].by_promo = categories[cat].by_promo
      .sort((a, b) => b.unique_clients - a.unique_clients);
    categories[cat].total_clients = categoryTrueTotal[cat];
  }

  // Загальна сума ВСІЄЇ реактивації (Нові + Сплячі + Втрачені).
  // Частка кожної категорії — для UI-підпису у header'і.
  const reactivationTotal = categories.new.total_sum_usd
    + categories.sleeping.total_sum_usd
    + categories.lost.total_sum_usd;
  if (reactivationTotal > 0) {
    for (const cat of ['new', 'sleeping', 'lost'] as const) {
      categories[cat].pct_of_reactivation =
        Math.round((categories[cat].total_sum_usd / reactivationTotal) * 1000) / 10;
    }
  }

  return {
    period: label,
    from,
    to,
    brand,
    dim_label: brand ? 'channel' : 'brand',
    categories,
  };
}
