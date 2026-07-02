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
import { isAdminLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { parsePeriod } from '@/lib/strategic-kpi/aggregate';
import { STRATEGIC_BRANDS } from '@/lib/strategic-kpi/brands';

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
  by_dim: DimRow[];       // по бренду АБО каналу (залежить чи brand заданий)
  by_promo: DimRow[];     // по discount тексту
}

// In-memory cache 5 хв — узгоджений з іншими strategic-kpi агрегаціями
const CACHE = new Map<string, { at: number; data: Response }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminLogin(session.login)) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
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
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data.clone();

  const rpc = await supabase.rpc<RpcRow[]>('get_reactivation_analytics', {
    p_brand: brand,
    p_from: from,
    p_to: to,
  });

  if (rpc.error || !rpc.data) {
    return Response.json({ error: `rpc failed: ${rpc.error?.message ?? 'no data'}` }, { status: 500 });
  }

  const empty = (): CategoryOut => ({ total_clients: 0, total_sum_usd: 0, by_dim: [], by_promo: [] });
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

  // Розкладаємо. total_clients беремо з рядка dimension='__cat_total__'
  // (справжній COUNT DISTINCT з RPC — migration 035). Це виправляє
  // подвоєння коли клієнт купив 2 бренди у категорії.
  const categoryTrueTotal: Record<string, number> = { new: 0, sleeping: 0, lost: 0 };

  for (const r of rpc.data) {
    if (!(r.category in categories)) continue;
    const cat = categories[r.category];
    const sum = Number(r.total_sum_usd);
    const qty = Number(r.total_qty);
    const catTot = categoryTotal[r.category] ?? 0;

    if (r.dimension === '__cat_total__') {
      categoryTrueTotal[r.category] = r.unique_clients;
      continue;
    }

    const row: DimRow = {
      key: r.key,
      unique_clients: r.unique_clients,
      total_qty: Math.round(qty * 100) / 100,
      total_sum_usd: Math.round(sum * 100) / 100,
      pct_of_category: catTot > 0 ? Math.round((sum / catTot) * 1000) / 10 : 0,
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
      .sort((a, b) => b.pct_of_category - a.pct_of_category);
    categories[cat].by_promo = categories[cat].by_promo
      .sort((a, b) => b.pct_of_category - a.pct_of_category);
    // ⭐ CORRECT: справжня кількість унікальних клієнтів (без double-count).
    // Fallback до 0 якщо migration 035 не застосована ще.
    categories[cat].total_clients = categoryTrueTotal[cat];
  }

  const response = Response.json({
    period: label,
    from,
    to,
    brand,
    dim_label: brand ? 'channel' : 'brand',   // UI підпис
    categories,
  });
  CACHE.set(cacheKey, { at: Date.now(), data: response.clone() });
  return response;
}
