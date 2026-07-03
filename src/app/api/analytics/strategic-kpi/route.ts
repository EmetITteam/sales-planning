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
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { aggregateBrandChannelMetrics, aggregatePeriodMetricsAveraged, aggregateYTDMetrics, fetchKpiMetricsBatch, fetchKpiMetricsAveragedBatch, parsePeriod } from '@/lib/strategic-kpi/aggregate';
import { aggregatePromos } from '@/lib/strategic-kpi/promos';
import { getBrandClientCategories, getBrandChannelCategories, type ClientCategories, type ChannelCategoriesMap } from '@/lib/strategic-kpi/categories';
import { buildFirstTrainedMap, countFirstTrainedInRange } from '@/lib/strategic-kpi/first-trained';
import { fetchEllanseRepSeminars, type RepSeminar } from '@/lib/strategic-kpi/rep-seminars';
import { STRATEGIC_BRANDS, STRATEGIC_CHANNELS, STRATEGIC_SEGMENTS, isSegment } from '@/lib/strategic-kpi/brands';

// 1С company-wide екшени (план+факт) можуть тривати 30-40с на першу загрузку —
// даємо функції достатньо часу (Vercel default 10с вбив би 1С-виклики).
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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
  if (!isStrategicKpiLogin(session.login)) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodParam = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  // Опційно фільтруємо тільки selected brand щоб швидко рахувати категорії +
  // first-trained (для одного бренду це швидко, для всіх — довго).
  const brandParamRaw = url.searchParams.get('brand');
  // Якщо запит по СЕГМЕНТУ (наприклад IUSE), розгортаємо у список підбрендів.
  // API далі агрегує факти + промо як для одного «мета-бренду».
  const segmentBrands: string[] | null = brandParamRaw && isSegment(brandParamRaw)
    ? [...STRATEGIC_SEGMENTS[brandParamRaw as keyof typeof STRATEGIC_SEGMENTS]]
    : null;
  const brandParam = brandParamRaw && !segmentBrands ? brandParamRaw : null;
  let parsed;
  try {
    parsed = parsePeriod(periodParam);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const { from, to, label: monthKey, monthIndex, year, kind: periodKind } = parsed;

  // Паралельно: period agg + YTD + promos + targets + Ellanse семінари.
  // Для одного місяця period+YTD через batch-RPC (один запит).
  // Для квартал/півріччя/рік period — усереднений (JS), YTD окремо через batch.
  const ytdFrom = `${year}-01-01T00:00:00Z`;
  // Обираємо RPC залежно від типу періоду:
  //   month   → get_kpi_metrics_batch (period+YTD одним запитом, sum-based)
  //   quarter/half/year → get_kpi_metrics_averaged (monthly-averaged + YTD)
  const batchP = periodKind === 'month'
    ? fetchKpiMetricsBatch(from, to, ytdFrom)
    : fetchKpiMetricsAveragedBatch(from, to, ytdFrom);

  const [batch, promos, targetsResult, seminarsResult] = await Promise.all([
    batchP,
    aggregatePromos(from, to),
    supabase.from('strategic_targets').select('*').eq('year', year),
    supabase.from('ellanse_seminars_actual').select('*').eq('year', year),
  ]);
  const monthMetrics = batch.period;
  const ytdMetrics = batch.ytd;

  if (targetsResult.error) {
    return Response.json({ error: `targets: ${targetsResult.error.message}` }, { status: 500 });
  }
  const targets = (targetsResult.data as unknown as StrategicTargetRow[]) ?? [];

  // Ellanse семінари — фільтр по місяцях у period range
  interface SeminarActualRow {
    year: number; month: number; location: string;
    seminars_held: number; new_trained: number | null;
  }
  const seminars = (seminarsResult.data as unknown as SeminarActualRow[]) ?? [];

  // Категорії клієнтів + First-trained (Ellanse only) — рахуємо ТІЛЬКИ якщо
  // передано ?brand=X (для одного бренду швидко, для всіх — довго).
  let categories: ClientCategories | null = null;
  let channelCategories: ChannelCategoriesMap | null = null;
  // Для сегмента (IUSE): категорії клієнтів per суб-бренд × канал — щоб показати
  // розбивку у кожному блоці суб-бренда.
  let subBrandChannelCategories: Record<string, ChannelCategoriesMap> | null = null;
  let firstTrained: { period: number; ytd: number } | null = null;
  let repSeminars: RepSeminar[] | null = null;
  // Річна зведена картина Ellanse-навчань:
  //   plan  = сума trainings_annual по всіх Ellanse × channel таргетах
  //   actual_ytd = уник. пари (seminar, division) у представництвах + семінари у дистрів
  let ellanseSeminarsSummary: { plan: number; actual_ytd: number } | null = null;
  // Soft-timeout helper для оптіональних важких операцій. Якщо запит YT+Ellanse
  // може затягнутись до 10-15 сек — Vercel вбʼє процес. Краще повернути null для
  // оптіональних полів ніж всю відповідь провалити.
  async function softRace<T>(op: Promise<T>, ms: number, label: string): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>(resolve => {
      timer = setTimeout(() => {
        console.warn(`[strategic-kpi] ${label} exceeded ${ms}ms, returning null`);
        resolve(null);
      }, ms);
    });
    try { return await Promise.race([op, timeout]); }
    finally { if (timer) clearTimeout(timer); }
  }

  // % виконання плану рахує фронт із «Огляд компанії» (той самий 1С план+факт,
  // що в Плануванні) — тут 1С більше не зовемо, щоб не гальмувати ендпоінт.

  if (brandParam && STRATEGIC_BRANDS.includes(brandParam as (typeof STRATEGIC_BRANDS)[number])) {
    try {
      categories = await softRace(getBrandClientCategories(brandParam, from, to), 6000, 'categories');
    } catch (e) {
      console.warn('categories failed:', (e as Error).message);
    }
    try {
      channelCategories = await softRace(getBrandChannelCategories(brandParam, from, to), 6000, 'channel-categories');
    } catch (e) {
      console.warn('channel-categories failed:', (e as Error).message);
    }
    if (brandParam === 'Ellanse') {
      try {
        const map = await softRace(buildFirstTrainedMap(), 6000, 'first-trained-map');
        if (map) {
          const yearStart = new Date(`${year}-01-01T00:00:00Z`);
          const periodStart = new Date(from);
          const periodEnd = new Date(to);
          firstTrained = {
            period: countFirstTrainedInRange(map, periodStart, periodEnd),
            ytd: countFirstTrainedInRange(map, yearStart, periodEnd),
          };
        }
      } catch (e) {
        console.warn('first-trained failed:', (e as Error).message);
      }
      try {
        repSeminars = await softRace(fetchEllanseRepSeminars(from, to), 4000, 'rep-seminars');
      } catch (e) {
        console.warn('rep-seminars failed:', (e as Error).message);
      }
      // Річна зведена картина
      try {
        const yearStartIso = `${year}-01-01T00:00:00Z`;
        const ytdRepSeminars = await fetchEllanseRepSeminars(yearStartIso, to);
        const distSeminarsYTD = seminars
          .filter(s => s.month <= (endM === 0 ? 12 : endM))
          .reduce((sum, s) => sum + (s.seminars_held ?? 0), 0);
        const planTotal = targets
          .filter(t => t.brand === 'Ellanse')
          .reduce((sum, t) => sum + (t.trainings_annual ?? 0), 0);
        ellanseSeminarsSummary = {
          plan: planTotal,
          actual_ytd: ytdRepSeminars.length + distSeminarsYTD,
        };
      } catch (e) {
        console.warn('ellanse-seminars-summary failed:', (e as Error).message);
      }
    }
  }

  // СЕГМЕНТ (IUSE): категорії клієнтів per суб-бренд × канал — для розбивки у
  // кожному блоці суб-бренда. Три суб-бренди рахуємо паралельно.
  if (segmentBrands) {
    try {
      const pairs = await Promise.all(
        segmentBrands.map(sb =>
          softRace(getBrandChannelCategories(sb, from, to), 6000, `sub-cat:${sb}`)
            .then(m => [sb, m] as const),
        ),
      );
      subBrandChannelCategories = {};
      for (const [sb, m] of pairs) if (m) subBrandChannelCategories[sb] = m;
    } catch (e) {
      console.warn('sub-brand-categories failed:', (e as Error).message);
    }
  }
  // Період покриває місяці startM..endM
  const startM = new Date(from).getUTCMonth() + 1;
  const endM = new Date(to).getUTCMonth();  // to — початок наступного місяця, тобто endM inclusive
  const endMFixed = endM === 0 ? 12 : endM;
  const seminarsInPeriod = seminars.filter(s => s.month >= startM && s.month <= endMFixed);
  const seminarsYTD = seminars.filter(s => s.month <= endMFixed);
  const sumSeminars = (rows: SeminarActualRow[], field: 'seminars_held' | 'new_trained') =>
    rows.reduce((s, r) => s + (r[field] ?? 0), 0);

  const targetKey = (b: string, c: string) => `${b}|${c}`;
  const targetMap = new Map<string, StrategicTargetRow>();
  for (const t of targets) targetMap.set(targetKey(t.brand, t.channel), t);

  const metricKey = (b: string, c: string) => `${b}|${c}`;
  const monthMap = new Map(monthMetrics.map(m => [metricKey(m.brand, m.channel), m]));
  const ytdMap = new Map(ytdMetrics.map(m => [metricKey(m.brand, m.channel), m]));

  // Реальний прогрес YTD у частках (0..1). Для запиту 15 квітня 2026:
  //   monthIndex=4 → старе pace=4/12=0.33, але реально пройшло тільки 105 з 365 днів = 0.288.
  //   Для запиту наприкінці кварталу різниця мала, для запиту всередині — суттєва.
  // Використовуємо min(to, now) щоб для «майбутніх» періодів pace = завершений період.
  const realPace = (() => {
    const now = Date.now();
    const yearStartTs = new Date(`${year}-01-01T00:00:00Z`).getTime();
    const yearEndTs   = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
    const toTs        = Math.min(new Date(to).getTime(), now);
    if (toTs <= yearStartTs) return 0;
    if (toTs >= yearEndTs)   return 1;
    return (toTs - yearStartTs) / (yearEndTs - yearStartTs);
  })();

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
      overlap_with?: { name: string; is_gift: boolean; clients: number };
    }>;
    // Тільки для Ellanse × distributors — факт семінарів з ellanse_seminars_actual
    seminars_actual?: {
      period: { seminars_held: number; new_trained: number };
      ytd: { seminars_held: number; new_trained: number };
      by_location: Array<{
        location: string;
        period: { seminars_held: number; new_trained: number };
        ytd: { seminars_held: number; new_trained: number };
      }>;
    };
    // Тільки для segment-блоків (напр. brand='IUSE') — розкладка по sub-brands.
    sub_brands?: Array<{
      brand: string;
      month_uc: number;
      month_qty: number;
      month_sum: number;
      month_avg_qty: number;
      month_avg_check: number;
      ytd_uc: number;
      ytd_sum: number;
      target_uc_annual: number | null;
      target_buyers_monthly: number | null;
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

      const isEllanseDist = brand === 'Ellanse' && channel === 'distributors';

      // Skip якщо нема ні таргетів ні даних (Ellanse×distributors — завжди показуємо, там семінари)
      if (!isEllanseDist && !t && !m && !y && brandPromos.length === 0) continue;

      const pctOr = (num: number | null, den: number | null | undefined) => {
        if (num === null || !den || den === 0) return null;
        return Math.round((num / den) * 1000) / 10;
      };

      const monthPace = realPace;

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
          overlap_with: p.overlap_with,
        })),
        seminars_actual: isEllanseDist ? {
          period: {
            seminars_held: sumSeminars(seminarsInPeriod, 'seminars_held'),
            new_trained: sumSeminars(seminarsInPeriod, 'new_trained'),
          },
          ytd: {
            seminars_held: sumSeminars(seminarsYTD, 'seminars_held'),
            new_trained: sumSeminars(seminarsYTD, 'new_trained'),
          },
          by_location: ['poltava', 'chernivtsi'].map(loc => ({
            location: loc,
            period: {
              seminars_held: sumSeminars(seminarsInPeriod.filter(s => s.location === loc), 'seminars_held'),
              new_trained: sumSeminars(seminarsInPeriod.filter(s => s.location === loc), 'new_trained'),
            },
            ytd: {
              seminars_held: sumSeminars(seminarsYTD.filter(s => s.location === loc), 'seminars_held'),
              new_trained: sumSeminars(seminarsYTD.filter(s => s.location === loc), 'new_trained'),
            },
          })),
        } : undefined,
      });
    }
  }

  // ============================================================================
  // SEGMENT MODE (наприклад IUSE = SB + hair + Coll.)
  // UI показує 3 sub-brand-блоки як окремі бренди зі СВОЇМИ таргетами і %.
  // На hero — зведений грошовий % по сегменту (fact_$ / plan_$_derived).
  // ============================================================================
  interface SegmentSummary {
    brand: string;
    month_uc: number;
    month_sum: number;
    ytd_uc: number;
    ytd_sum: number;
    plan_month_uc: number;
    plan_month_sum_derived: number;   // sum(target.buyers_monthly × target.avg_check)
    plan_ytd_uc: number;
  }
  let segmentSummary: SegmentSummary | null = null;
  if (segmentBrands) {
    let mUC = 0, mSum = 0, yUC = 0, ySum = 0;
    let pUC = 0, pYearUC = 0, pMonthSum = 0;
    for (const sb of segmentBrands) {
      for (const channel of STRATEGIC_CHANNELS) {
        const m = monthMap.get(metricKey(sb, channel));
        const y = ytdMap.get(metricKey(sb, channel));
        const t = targetMap.get(targetKey(sb, channel));
        if (m) { mUC += m.unique_clients; mSum += m.total_sum_usd; }
        if (y) { yUC += y.unique_clients; ySum += y.total_sum_usd; }
        if (t?.buyers_monthly) {
          pUC += t.buyers_monthly;
          if (t.avg_check_annual) pMonthSum += t.buyers_monthly * t.avg_check_annual;
        }
        if (t?.unique_clients_annual) pYearUC += t.unique_clients_annual;
      }
    }
    segmentSummary = {
      brand: brandParamRaw!,
      month_uc: mUC,
      month_sum: Math.round(mSum * 100) / 100,
      ytd_uc: yUC,
      ytd_sum: Math.round(ySum * 100) / 100,
      plan_month_uc: pUC,
      plan_month_sum_derived: Math.round(pMonthSum * 100) / 100,
      plan_ytd_uc: pYearUC,
    };
  }

  return Response.json({
    period: monthKey,
    periodKind,
    year,
    monthIndex,
    monthPace: monthIndex / 12,
    blocks,
    categories,      // тільки коли ?brand=X переданий
    channel_categories: channelCategories,  // per-channel розкладка для брендів з КЦ
    sub_brand_channel_categories: subBrandChannelCategories,  // сегмент: per суб-бренд×канал
    first_trained: firstTrained,  // тільки для brand=Ellanse
    rep_seminars: repSeminars,    // тільки для brand=Ellanse — семінари у представництвах
    ellanse_seminars_summary: ellanseSeminarsSummary,  // річний план + факт YTD
    segment_summary: segmentSummary,   // zvedeni cifri po IUSE-tipu segmentu
  });
}
