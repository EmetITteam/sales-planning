/**
 * GET /api/weekly-report/brand-insights?region=<code>&logins=a,b,c&period=YYYY-MM
 *
 * Інсайти по брендах для Тижневого звіту з таблиці `sales`:
 *   топ-3 акції, «купили по фокусу», усього купивших — per SEGMENT-код.
 *
 * ⚠️ Скоуп — РОСТЕР РЕГІОНУ (клієнти менеджерів `logins`, без резерву), той
 * самий, що у воронці категорій (regionStats). Раніше рахували по `division`
 * (місто) → у місто попадали клієнти, закріплені за колл-центром/іншим регіоном
 * → шапка/акції не збігались з воронкою. Тепер усе по клієнтах ростера.
 *
 * Доступ — allowedForRegion(region). `logins` — скоуп (як у звіті).
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { allowedForRegion } from '@/lib/weekly-report-access';
import { aggregateBrandInsights, regionToDivision, type InsightRow, type BrandInsight } from '@/lib/weekly-brand-insights';
import { readFocusCountsByLogins } from '@/lib/focus-participants-store';

function monthBounds(period: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [y, m] = period.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { from, to };
}

const empty = (): BrandInsight => ({ totalBuyers: 0, focusParticipants: 0, focusBought: 0, focusSum: 0, topPromos: [] });

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const region = sp.get('region') || '';
  const regionName = sp.get('regionName') || '';
  const logins = (sp.get('logins') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const period = sp.get('period') || '';
  const asOfDate = sp.get('asOfDate') || '';
  if (!region || !regionName || !period) return Response.json({ error: 'region + regionName + period required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const b = monthBounds(period);
  if (!b) return Response.json({ error: 'bad period' }, { status: 400 });

  // Верхня межа продажів = дата відсічки звітного тижня (asOfDate) ВКЛЮЧНО, щоб
  // шапка/акції рахувались у тому ж вікні, що воронка категорій (Action 3 читає
  // факт на asOfDate). Без asOfDate — весь місяць. Раніше шапка брала весь місяць
  // а воронка — по дату тижня → у середині місяця «7 vs 6» (клієнт купив після
  // кінця тижня: у шапці вже є, у воронці ще нема).
  let upper = b.to;
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    const d = new Date(`${asOfDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1); // +1 день → включаємо весь день asOfDate
    const dayAfter = d.toISOString().slice(0, 10);
    upper = dayAfter < b.to ? dayAfter : b.to; // clamp до кінця місяця
  }

  // ФАКТ регіону = продажі ПІДРОЗДІЛУ (division), а НЕ ростера менеджерів. Резерв
  // НЕ прибираємо — це фактичні продажі, всі мають рахуватись (резерв ховаємо лише
  // при просчёте бази регіону, не факту). Один регіон = один підрозділ у sales.
  const division = regionToDivision(regionName);
  if (!division) return Response.json({ error: `unknown division for region "${regionName}"` }, { status: 400 });

  try {
    // Усі продажі підрозділу за місяць ≤ asOfDate. is_ignored/is_excluded відкидаємо
    // (консумативи / Реклама·ДР·Гонорар), АЛЕ is_gift ЛИШАЄМО — фокус фізично стоїть
    // на подарунковому рядку (Tox Eye $0); aggregateBrandInsights атрибутує його по
    // бренду-тригеру поводу і не рахує подарунок як покупку.
    const rows: InsightRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const res = await supabase
        .from('sales')
        .select('brand,discount,client_code,sum_usd,is_gift')
        .eq('division', division)
        .gte('sale_date', b.from)
        .lt('sale_date', upper)
        .eq('is_ignored', false)
        .eq('is_excluded', false)
        .order('sale_date')
        .order('id')
        .range(from, from + PAGE - 1);
      if (res.error || !res.data) return Response.json({ error: res.error?.message || 'no data' }, { status: 500 });
      const chunk = res.data as unknown as InsightRow[];
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    const brands = aggregateBrandInsights(rows);
    // Учасники фокусу — планова к-сть з focus_participants по logins (крон sync-focus).
    const focusCounts = logins.length > 0 ? await readFocusCountsByLogins(period, logins) : {};
    for (const [seg, cnt] of Object.entries(focusCounts)) {
      (brands[seg] ??= empty()).focusParticipants = cnt;
    }
    return Response.json({ brands });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
