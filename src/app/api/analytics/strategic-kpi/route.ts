/**
 * GET /api/analytics/strategic-kpi?period=2026-06[&year=2026]
 *
 * Повертає для дашборду /admin/strategic-kpi:
 *   - Метрики місяця (per бренд × канал)
 *   - Метрики YTD (per бренд × канал) — для % виконання річних цілей
 *   - Топ-5 промо для кожного (бренд × канал)
 *   - Річні + місячні таргети (з strategic_targets)
 *   - Порахований % виконання (простий / темповий / прогноз)
 *
 * Admin only. Тільки itd@emet.in.ua.
 *
 * Створено 2026-07-02.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { aggregateBrandChannelMetrics, aggregateYTDMetrics, monthRange } from '@/lib/strategic-kpi/aggregate';
import { aggregatePromos } from '@/lib/strategic-kpi/promos';
import { STRATEGIC_BRANDS, STRATEGIC_CHANNELS } from '@/lib/strategic-kpi/brands';

interface StrategicTargetRow {
  year: number;
  brand: string;
  channel: string;
  unique_clients_annual: number | null;
  avg_check_annual: number | null;
  buyers_monthly: number | null;
  avg_qty_per_client: number | null;
  new_trained_annual: number | null;
  trainings_annual: number | null;
  trainings_repeat: number | null;
  conversion_repeat_pct: number | null;
  retention_monthly: number | null;
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminLogin(session.login)) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) {
    return Response.json({ error: 'period must be YYYY-MM or YYYY-MM-DD' }, { status: 400 });
  }

  const { from, to, monthKey, monthIndex } = monthRange(period);
  const year = Number(monthKey.slice(0, 4));

  // Паралельно: month agg + YTD + promos + targets
  const [monthMetrics, ytdMetrics, promos, targetsResult] = await Promise.all([
    aggregateBrandChannelMetrics(from, to),
    aggregateYTDMetrics(year, to),
    aggregatePromos(from, to),
    supabase.from('strategic_targets').select('*').eq('year', year),
  ]);

  if (targetsResult.error) {
    return Response.json({ error: `targets: ${targetsResult.error.message}` }, { status: 500 });
  }
  const targets = (targetsResult.data as unknown as StrategicTargetRow[]) ?? [];

  const targetKey = (b: string, c: string) => `${b}|${c}`;
  const targetMap = new Map<string, StrategicTargetRow>();
  for (const t of targets) targetMap.set(targetKey(t.brand, t.channel), t);

  const metricKey = (b: string, c: string) => `${b}|${c}`;
  const monthMap = new Map(monthMetrics.map(m => [metricKey(m.brand, m.channel), m]));
  const ytdMap = new Map(ytdMetrics.map(m => [metricKey(m.brand, m.channel), m]));

  // Собираємо per (brand × channel) блок з таргетами + метриками + %.
  interface BlockResult {
    brand: string;
    channel: string;
    target: StrategicTargetRow | null;
    month: {
      unique_clients: number;
      total_qty: number;
      total_sum_usd: number;
      avg_qty_per_client: number;
      avg_check_usd: number;
    } | null;
    ytd: {
      unique_clients: number;
      total_sum_usd: number;
      avg_check_usd: number;
    } | null;
    execution: {
      // Місячні
      buyers_monthly_pct: number | null;
      avg_qty_per_client_pct: number | null;
      // Річні — 3 %
      unique_clients_simple_pct: number | null;   // ytd / annual
      unique_clients_pace_pct: number | null;      // ytd / (annual × month/12)
      unique_clients_forecast: number | null;      // ytd × 12 / month
      avg_check_annual_pct: number | null;
    };
    promos: Array<{
      name: string;
      unique_clients: number;
      total_qty: number;
      total_sum_usd: number;
      is_gift: boolean;
      gift_brand: string | null;
    }>;
  }

  const blocks: BlockResult[] = [];
  for (const brand of STRATEGIC_BRANDS) {
    for (const channel of STRATEGIC_CHANNELS) {
      const t = targetMap.get(targetKey(brand, channel));
      const m = monthMap.get(metricKey(brand, channel));
      const y = ytdMap.get(metricKey(brand, channel));
      const brandPromos = promos
        .filter(p => p.brand === brand && p.channel === channel)
        .sort((a, b) => b.unique_clients - a.unique_clients)
        .slice(0, 5);

      // Skip якщо нема ні таргетів ні даних
      if (!t && !m && !y && brandPromos.length === 0) continue;

      const pctOr = (num: number | null, den: number | null | undefined) => {
        if (num === null || !den || den === 0) return null;
        return Math.round((num / den) * 1000) / 10;
      };

      const monthPace = monthIndex / 12;

      blocks.push({
        brand,
        channel,
        target: t ?? null,
        month: m ? {
          unique_clients: m.unique_clients,
          total_qty: m.total_qty,
          total_sum_usd: m.total_sum_usd,
          avg_qty_per_client: m.avg_qty_per_client,
          avg_check_usd: m.avg_check_usd,
        } : null,
        ytd: y ? {
          unique_clients: y.unique_clients,
          total_sum_usd: y.total_sum_usd,
          avg_check_usd: y.avg_check_usd,
        } : null,
        execution: {
          buyers_monthly_pct: pctOr(m?.unique_clients ?? null, t?.buyers_monthly),
          avg_qty_per_client_pct: pctOr(m?.avg_qty_per_client ?? null, t?.avg_qty_per_client),
          unique_clients_simple_pct: pctOr(y?.unique_clients ?? null, t?.unique_clients_annual),
          unique_clients_pace_pct: t?.unique_clients_annual && monthPace > 0
            ? pctOr(y?.unique_clients ?? null, t.unique_clients_annual * monthPace)
            : null,
          unique_clients_forecast: y?.unique_clients && monthIndex > 0
            ? Math.round(y.unique_clients * 12 / monthIndex)
            : null,
          avg_check_annual_pct: pctOr(y?.avg_check_usd ?? null, t?.avg_check_annual),
        },
        promos: brandPromos.map(p => ({
          name: p.name,
          unique_clients: p.unique_clients,
          total_qty: p.total_qty,
          total_sum_usd: p.total_sum_usd,
          is_gift: p.is_gift,
          gift_brand: p.gift_brand,
        })),
      });
    }
  }

  return Response.json({
    period: monthKey,
    year,
    monthIndex,
    monthPace: monthIndex / 12,
    blocks,
    counts: {
      month_rows: monthMetrics.reduce((s, m) => s + m.rows, 0),
      ytd_rows: ytdMetrics.reduce((s, m) => s + m.rows, 0),
      promos: promos.length,
      targets: targets.length,
    },
  });
}
