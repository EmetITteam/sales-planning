/**
 * GET /api/weekly-report/brand-insights?region=<code>&division=<city>&period=YYYY-MM
 *
 * Інсайти по брендах для Тижневого звіту з таблиці `sales` (по регіону):
 *   топ-3 акції, «купили по фокусу», усього купивших — per SEGMENT-код.
 *
 * Доступ — як до звіту (allowedForRegion по regionCode). Дані рахуються за
 * `division` (місто регіону) поточного місяця, канал representatives.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { allowedForRegion } from '@/lib/weekly-report-access';
import { aggregateBrandInsights, type InsightRow } from '@/lib/weekly-brand-insights';

function monthBounds(period: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [y, m] = period.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { from, to };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const region = sp.get('region') || '';
  const division = sp.get('division') || '';
  const period = sp.get('period') || '';
  if (!region || !division || !period) return Response.json({ error: 'region + division + period required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const b = monthBounds(period);
  if (!b) return Response.json({ error: 'bad period' }, { status: 400 });

  try {
    const rows: InsightRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const res = await supabase
        .from('sales')
        .select('brand,discount,client_code,sum_usd')
        .eq('division', division)
        .eq('channel', 'representatives')
        .gte('sale_date', b.from)
        .lt('sale_date', b.to)
        .eq('is_ignored', false)
        .eq('is_gift', false)
        .eq('is_excluded', false)
        .neq('brand', 'НЕ_МАПНУТО')
        .order('sale_date')
        .order('id')
        .range(from, from + PAGE - 1);
      if (res.error || !res.data) return Response.json({ error: res.error?.message || 'no data' }, { status: 500 });
      const chunk = res.data as unknown as InsightRow[];
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return Response.json({ brands: aggregateBrandInsights(rows) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
