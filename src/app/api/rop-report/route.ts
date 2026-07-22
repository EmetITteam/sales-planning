/**
 * GET /api/rop-report?period=YYYY-MM[&week=YYYY-MM-DD]
 *
 * Зведений звіт РОП (Лист 4) — усі 8 представництв в одному об'єкті. СЕРВЕРНА
 * агрегація ПОВЕРХ існуючих розрахунків (getRegionData, aggregateRegion,
 * calcForecastPercent, statusBadge/isRed, weekly_report_notes, period_summaries,
 * working-days). Нічого не дублює — pure-логіка у lib/rop-report-aggregate.
 *
 * Доступ: РОП / директор (CSO) / strategic (CEO/CMO/owner) / admin. РМ і менеджер
 * — 403 (перевірка на сервері, не лише приховування в UI).
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { canViewRopReport, DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import { callOneCServer } from '@/lib/onec-server';
import { adaptRegionData } from '@/lib/onec-adapters';
import { aggregateRegion } from '@/lib/region-aggregates';
import { calcForecastPercent, pctOf } from '@/lib/format';
import { getWeeksForMonth, monthlyPidFromMonth } from '@/lib/periods';
import { getPassedWorkingDays, getWorkingDaysInMonth } from '@/lib/working-days';
import { statusBadge, isRed } from '@/lib/status-badge';
import {
  pickWorstBrand, rollupPromises, crossRegionRedZones, computeRopDeadline,
  resolvePlanStatus, reportSubmissionState, countByTone, type BrandLine, type PromiseLine,
} from '@/lib/rop-report-aggregate';
import { isRepresentativeRegionCode, REPORT_RECIPIENT, ESCALATION_RECIPIENT } from '@/lib/rop-report-config';
import { readWeekNotes, type WeeklyNote } from '@/lib/weekly-notes-store';
import { listWeekStatuses } from '@/lib/weekly-report-status-store';
import { readRopMeta } from '@/lib/rop-report-meta-store';

export const maxDuration = 60;

/** Latest-версія замітки (append-only): notes DESC by created_at → перша виграє. */
function indexLatest(notes: WeeklyNote[]): Map<string, WeeklyNote> {
  const m = new Map<string, WeeklyNote>();
  for (const n of notes) {
    const key = `${n.region_code}|${n.segment_code ?? ''}|${n.field}`;
    if (!m.has(key)) m.set(key, n);
  }
  return m;
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canViewRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const period = sp.get('period') || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: 'period must be YYYY-MM' }, { status: 400 });
  const [y, m] = period.split('-').map(Number);

  // Тиждень звіту: параметр або останній тиждень, що завершився (<= сьогодні);
  // якщо період повністю у майбутньому — перший тиждень.
  const weeks = getWeeksForMonth(y, m - 1);
  if (weeks.length === 0) return Response.json({ error: 'no weeks in period' }, { status: 400 });
  const weekParam = sp.get('week');
  let week = weekParam && weeks.some(w => w.weekEnd === weekParam)
    ? weekParam
    : ([...weeks].reverse().find(w => w.weekEnd <= today)?.weekEnd ?? weeks[0].weekEnd);
  const weekIdx = weeks.findIndex(w => w.weekEnd === week);
  const prevWeek = weekIdx > 0 ? weeks[weekIdx - 1].weekEnd : null;

  // ── 1С: усі регіони за період на дату тижня ──
  const regResp = await callOneCServer('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period, asOfDate: week });
  if (!regResp.ok || !regResp.data) {
    return Response.json({ error: `getRegionData: ${regResp.errorMessage ?? 'no data'}` }, { status: 502 });
  }
  const allRegions = adaptRegionData(regResp.data as Parameters<typeof adaptRegionData>[0])
    .regions.filter(r => r.regionCode && isRepresentativeRegionCode(r.regionCode));

  // Робочі дні для темпу прогнозу (та сама формула, що у звіті РМ).
  const weekDate = new Date(week);
  const passedWD = getPassedWorkingDays(y, m - 1, weekDate);
  const totalWD = getWorkingDaysInMonth(y, m - 1);
  const deadline = computeRopDeadline(period);

  // ── замітки цього + минулого тижня (по всіх регіонах, 2 запити) ──
  const [thisNotes, prevNotes, weekStatuses, lateReasons] = await Promise.all([
    readWeekNotes(week),
    prevWeek ? readWeekNotes(prevWeek) : Promise.resolve([] as WeeklyNote[]),
    listWeekStatuses(week),
    readRopMeta(period),
  ]);
  const thisLatest = indexLatest(thisNotes);
  const prevLatest = indexLatest(prevNotes);
  const finalizedReportRegions = new Set(weekStatuses.map(s => s.region_code));
  // Регіони, де вже є замітки цього тижня (для стану 'partial' — заповнюється).
  const regionsWithNotes = new Set(thisNotes.filter(n => n.text?.trim()).map(n => n.region_code));

  // ── фіналізація ПЛАНУ (4.4): period_summaries по всіх менеджерах регіонів ──
  const allLogins = [...new Set(allRegions.flatMap(r => r.managers.map(mm => (mm.login || '').toLowerCase()).filter(Boolean)))];
  const pid = monthlyPidFromMonth(period);
  const planFinByLogin = new Map<string, { hasFinal: boolean; hasDraft: boolean; maxAt: number }>();
  if (allLogins.length > 0) {
    const { data: sums, error } = await supabase.from('period_summaries')
      .select('user_id,finalized_at').eq('period_id', pid).in('user_id', allLogins);
    if (error) return Response.json({ error: `period_summaries: ${error.message}` }, { status: 500 });
    for (const s of (sums ?? []) as Array<{ user_id: string; finalized_at: string | null }>) {
      const login = (s.user_id || '').toLowerCase();
      const cur = planFinByLogin.get(login) ?? { hasFinal: false, hasDraft: false, maxAt: 0 };
      if (s.finalized_at) { cur.hasFinal = true; cur.maxAt = Math.max(cur.maxAt, Date.parse(s.finalized_at)); }
      else cur.hasDraft = true;
      planFinByLogin.set(login, cur);
    }
  }

  // ── per-region збірка ──
  const regionRows = allRegions.map(region => {
    const agg = aggregateRegion(region);
    const regionForecastPct = calcForecastPercent(agg.totalFact, agg.totalPlan, passedWD, totalWD);
    const pct = pctOf(agg.totalFact, agg.totalPlan);
    const badge = statusBadge(regionForecastPct);

    // Бренди з планом > 0 — тільки вони можуть бути «червоними» (без плану
    // forecastPct=0 і фейково червонів). reason/дія з заміток цього тижня.
    const brands: BrandLine[] = agg.segments
      .filter(s => s.planAmount > 0 || s.factAmount > 0)
      .map(s => ({
        code: s.segmentCode,
        name: s.segmentName,
        forecastPct: s.planAmount > 0 ? calcForecastPercent(s.factAmount, s.planAmount, passedWD, totalWD) : 999,
        reason: thisLatest.get(`${region.regionCode}|${s.segmentCode}|reason`)?.text || undefined,
        action: thisLatest.get(`${region.regionCode}|${s.segmentCode}|action`)?.text || undefined,
      }));
    const worstRes = pickWorstBrand(brands);
    const redBrandNames = worstRes.red.map(b => b.name);

    // Обіцянки: дія минулого тижня (обіцянка) + promise_check цього тижня.
    const promiseLines: PromiseLine[] = agg.segments
      .filter(s => s.planAmount > 0 || s.factAmount > 0)
      .map(s => {
        const promiseText = prevLatest.get(`${region.regionCode}|${s.segmentCode}|action`)?.text || '';
        const check = thisLatest.get(`${region.regionCode}|${s.segmentCode}|promise_check`);
        return {
          brand: s.segmentName,
          hadPromise: !!promiseText.trim(),
          done: check ? check.done : null,
          reason: check?.text || undefined,
          promiseText,
        };
      });
    const promise = rollupPromises(promiseLines);

    // План (4.4): узгоджено = КОЖЕН менеджер регіону фіналізував, без чернеток.
    // Регіон без ЖОДНОГО запису → 'not_started' (а не фейкове «нема чернеток»).
    const logins = region.managers.map(mm => (mm.login || '').toLowerCase()).filter(Boolean);
    // Рахуємо ЛИШЕ менеджерів, що мають рядки у period_summaries (тобто планують).
    // Менеджера БЕЗ рядків (напр. РОП headofsd у KYV-ноді — не планує) ІГНОРУЄМО,
    // інакше регіон фейково «чернетка» попри усіх реальних менеджерів фіналізованих
    // (узгоджено з planning-readiness: «усі менеджери фіналізували»).
    const withRows = logins.map(l => planFinByLogin.get(l)).filter(Boolean) as Array<{ hasFinal: boolean; hasDraft: boolean; maxAt: number }>;
    const hasAnyRecord = withRows.length > 0;
    const fullyFinalized = withRows.length > 0 && withRows.every(r => r.hasFinal && !r.hasDraft);
    const maxAt = Math.max(0, ...withRows.map(r => r.maxAt));
    const plan = resolvePlanStatus({
      hasAnyRecord,
      fullyFinalized,
      finalizedAt: fullyFinalized && maxAt > 0 ? new Date(maxAt) : null,
      deadline,
    });

    return {
      code: region.regionCode,
      name: region.regionName,
      managerCount: region.managers.length,
      pct,
      forecastPct: regionForecastPct,
      badge: { label: badge.label, tone: badge.tone },
      redBrands: redBrandNames,
      worst: worstRes.worst
        ? { code: worstRes.worst.code, name: worstRes.worst.name, forecastPct: worstRes.worst.forecastPct, reason: worstRes.worst.reason, action: worstRes.worst.action }
        : null,
      extraRedCount: worstRes.extraRedCount,
      // Червоні бренди з причина/дія — для розкриття «+N» у 4.1 (гірший показаний,
      // решта за бейджем). Відсортовані за forecastPct (найгірший перший).
      reds: worstRes.red.map(b => ({ code: b.code, name: b.name, forecastPct: b.forecastPct, reason: b.reason ?? null, action: b.action ?? null })),
      promise,
      // Усі обіцянки регіону (виконані + ні) — для розкриття у 4.3 по кліку.
      promises: promiseLines.filter(p => p.hadPromise).map(p => ({ brand: p.brand, promiseText: p.promiseText || '', done: p.done, reason: p.reason ?? null })),
      reportFinalized: finalizedReportRegions.has(region.regionCode),
      submission: reportSubmissionState(finalizedReportRegions.has(region.regionCode), regionsWithNotes.has(region.regionCode)),
      plan: {
        state: plan.state,
        agreed: plan.agreed,
        inTime: plan.inTime,
        overdueWorkingDays: plan.overdueWorkingDays,
        finalizedAt: plan.finalizedAt ? plan.finalizedAt.toISOString() : null,
        lateReason: lateReasons.get(region.regionCode) || null,
      },
    };
  });

  // ── 4.2 червоні зони (крос-регіон) ──
  const redZones = crossRegionRedZones(
    regionRows.map(r => ({ region: r.name, redBrands: r.reds.map(b => ({ name: b.name, forecastPct: b.forecastPct })) })),
  );

  // ── hero ──
  const totals = allRegions.reduce((acc, region) => {
    const agg = aggregateRegion(region);
    acc.plan += agg.totalPlan; acc.fact += agg.totalFact; return acc;
  }, { plan: 0, fact: 0 });
  const companyForecastPct = calcForecastPercent(totals.fact, totals.plan, passedWD, totalWD);
  const regionsByTone = countByTone(regionRows.map(r => r.forecastPct));
  const overdueRegions = regionRows
    .filter(r => r.plan.agreed && !r.plan.inTime)
    .map(r => ({ region: r.name, days: r.plan.overdueWorkingDays, reason: r.plan.lateReason }));
  const planAgreedInTime = regionRows.filter(r => r.plan.inTime).length;
  const promisesTotal = regionRows.reduce((a, r) => a + r.promise.total, 0);
  const promisesDone = regionRows.reduce((a, r) => a + r.promise.doneCount, 0);

  // ── 4.3 реєстр обіцянок (лише регіони, де були обіцянки) ──
  const promiseRegister = regionRows
    .filter(r => r.promise.total > 0)
    .map(r => ({ region: r.name, status: r.promise.status, total: r.promise.total, doneCount: r.promise.doneCount, promises: r.promises }));

  return Response.json({
    period, week, prevWeek, deadline: deadline.toISOString(),
    recipients: { report: REPORT_RECIPIENT, escalation: ESCALATION_RECIPIENT },
    hero: {
      companyPlan: Math.round(totals.plan),
      companyFact: Math.round(totals.fact),
      companyPct: pctOf(totals.fact, totals.plan),
      companyForecastPct,
      norm: totalWD > 0 ? (passedWD / totalWD) * 100 : 0,
      regionsByTone,
      planAgreedInTime,
      planTotal: regionRows.length,
      overdueRegions,
      promisesDone,
      promisesTotal,
    },
    regions: regionRows,      // 4.1
    redZones,                 // 4.2
    promiseRegister,          // 4.3
    meta: {
      regionCount: regionRows.length,
      logins: allLogins.length,
      passedWD, totalWD,
      thisWeekNotes: thisNotes.length,
      viewer: session.login,
    },
  });
}
