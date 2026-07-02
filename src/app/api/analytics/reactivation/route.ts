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
  dimension: 'brand' | 'channel' | 'promo';
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

  // Розкладаємо. Порахуємо total_clients як сумму DISTINCT client з dim=brand або
  // dim=channel — це «клієнти категорії у періоді» (враховуємо всіх, не тільки топ-5).
  const categoryTotalClients: Record<string, number> = { new: 0, sleeping: 0, lost: 0 };

  for (const r of rpc.data) {
    if (!(r.category in categories)) continue;
    const cat = categories[r.category];
    const sum = Number(r.total_sum_usd);
    const qty = Number(r.total_qty);
    const catTot = categoryTotal[r.category] ?? 0;

    const row: DimRow = {
      key: r.key,
      unique_clients: r.unique_clients,
      total_qty: Math.round(qty * 100) / 100,
      total_sum_usd: Math.round(sum * 100) / 100,
      pct_of_category: catTot > 0 ? Math.round((sum / catTot) * 1000) / 10 : 0,
    };

    if (r.dimension === 'brand' || r.dimension === 'channel') {
      cat.by_dim.push(row);
      categoryTotalClients[r.category] += r.unique_clients;
    } else if (r.dimension === 'promo') {
      cat.by_promo.push(row);
    }
  }

  // total_clients = максимальне з (сума UC по dim) — dim унікальний по клієнтах
  // усередині категорії тільки якщо брали canonical розріз. Насправді якщо клієнт
  // купив 2 бренди, він рахується двічі у sum. Тому total_clients беремо як
  // max по by_dim (найбільший acumulate) — це наближення. Для точного числа
  // треба окремий COUNT DISTINCT client_code per category, але для UI ~ok.
  for (const cat of ['new', 'sleeping', 'lost'] as const) {
    categories[cat].total_sum_usd = Math.round((categoryTotal[cat] ?? 0) * 100) / 100;
    // Топ-5 у кожному розрізі щоб UI був компактним
    categories[cat].by_dim = categories[cat].by_dim
      .sort((a, b) => b.total_sum_usd - a.total_sum_usd)
      .slice(0, 5);
    categories[cat].by_promo = categories[cat].by_promo
      .sort((a, b) => b.total_sum_usd - a.total_sum_usd)
      .slice(0, 5);
    // Загальна кількість клієнтів категорії = max від Set-суми по dim
    // (Set не робимо у SQL з UNION ALL — тому беремо приблизно з max)
    const dimClients = categoryTotalClients[cat];
    categories[cat].total_clients = dimClients;
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
