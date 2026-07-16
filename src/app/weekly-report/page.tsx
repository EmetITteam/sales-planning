'use client';

/**
 * /weekly-report — «Тижневий звіт» (тестова сторінка).
 *
 * Авто-збір показників паспорта наради (Регламент РОП–РМ §4.4) з тих самих
 * джерел, що RM-дашборд: getRegionData (Action 5) → aggregateRegion/Managers,
 * usePlanningAggregate (план по категоріях, №4), useRegionStats (факт по
 * категоріях, №5). Заповнює числову частину звіту; текстові поля (дія,
 * причина-висновок, обіцянка→факт) лишаються для ручного вводу.
 *
 * Показники: №1 Виконання регіону · №3 Прогноз темпу · №6 Розріз по менеджерах
 * (розрив) · №7 Минулий місяць $(±) · по брендах №2 %+мітка / №4 Заплановано %
 * · №5 Розклад по категоріях (Активні/Активізація/Незаплановані/Нові).
 *
 * Тестова: доступ admin + strategic-kpi логіни.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { PeriodFilter } from '@/components/layout/period-filter';
import { MetricCard } from '@/components/dashboard/metric-card';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData, mapSegmentCode } from '@/lib/onec-adapters';
import { aggregateRegion, aggregateManagers } from '@/lib/region-aggregates';
import { ClientCategoryUniqueTable } from '@/components/dashboard/client-category-unique-table';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import { CategoryStatsTable } from '@/components/dashboard/category-stats-table';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { pctOf, calcForecastPercent, formatUSD, formatPct } from '@/lib/format';
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import { ArrowLeft, ClipboardList, PenLine, Check, ChevronDown, MapPin, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** Ключі категорій клієнтів (як у planAgg/regionStats byCategory). */
type BrandCatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

/** Кастомний дропдаун вибору регіону (glass, стиль як PeriodFilter). */
function RegionDropdown({ regions, value, onChange, loading }: {
  regions: { regionCode: string; regionName: string }[];
  value: string | null;
  onChange: (code: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const t = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
  }, [open]);
  const current = regions.find(r => r.regionCode === value);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-white/60 backdrop-blur-md border border-white/50 hover:border-emet-blue/30 hover:bg-white/80 transition-all cursor-pointer"
      >
        {loading ? <Loader2 className="h-4 w-4 text-emet-blue animate-spin" /> : <MapPin className="h-4 w-4 text-emet-blue" />}
        <span className="text-[13px] font-semibold text-foreground">{current?.regionName ?? 'Регіон'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 w-[220px] bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_8px_40px_rgba(6,42,61,0.18)] py-1.5 max-h-[320px] overflow-y-auto">
          {regions.map(r => {
            const sel = r.regionCode === value;
            return (
              <button
                key={r.regionCode}
                onClick={() => { onChange(r.regionCode); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-[13px] transition-colors cursor-pointer ${sel ? 'bg-emet-50 text-emet-blue font-semibold' : 'hover:bg-[#f4f7fb] text-foreground'}`}
              >
                <span className="truncate">{r.regionName}</span>
                {sel && <Check className="h-4 w-4 text-emet-blue shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Мітка «В ПЛАНІ / ВІДСТАВАННЯ» за темпом виконання (як статус-колір борду). */
function markOf(forecastPct: number): { label: string; cls: string } {
  return forecastPct >= 100
    ? { label: 'В ПЛАНІ', cls: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700' }
    : { label: 'ВІДСТАВАННЯ', cls: 'bg-rose-500/12 border-rose-300/50 text-rose-700' };
}

export default function WeeklyReportPage() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const allowed = !!user && (user.role === 'admin' || isStrategicKpiLogin(user.login) || user.canViewCompanyOverview === true);

  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);

  // Тиждень з фільтра — «накопичувально з 1-го станом на кінець вибраного тижня».
  // weekEnd з currentPeriod (той самий стор що у планінгу). asOfDate → 1С дає
  // факт до цієї дати включно; passedWD рахується до неї ж.
  const asOfIso = currentPeriod.weekEnd;
  const periodKey = currentPeriod.month.slice(0, 7); // 'YYYY-MM'

  // Action 5 — для admin/director проксується на директора (усі регіони).
  const { data: regionResp, loading } = useOneCData(
    'getRegionData',
    allowed && user ? { login: user.login, period: periodKey, asOfDate: asOfIso } : null,
  );
  const regions = useMemo(
    () => (regionResp ? adaptRegionData(regionResp).regions.filter(r => r.regionCode) : []),
    [regionResp],
  );

  // Регіон за замовчуванням — Дніпро.
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const defaultCode = useMemo(() => {
    const d = regions.find(r => /дніпро|днепр/i.test(r.regionName));
    return d?.regionCode ?? regions[0]?.regionCode ?? null;
  }, [regions]);
  const effectiveCode = selectedCode ?? defaultCode;
  const region = useMemo(
    () => regions.find(r => r.regionCode === effectiveCode) ?? null,
    [regions, effectiveCode],
  );

  const aggregate = useMemo(() => (region ? aggregateRegion(region) : null), [region]);
  const managers = useMemo(() => (region ? aggregateManagers(region) : []), [region]);
  const managerNames = useMemo(() => Object.fromEntries(managers.map(m => [m.login, m.name])), [managers]);
  const allLogins = useMemo(
    () => (region ? Array.from(new Set(region.managers.map(m => m.login).filter(Boolean))) : []),
    [region],
  );

  const { data: planAgg } = usePlanningAggregate(
    currentPeriod.id,
    allLogins.length > 0 ? allLogins : null,
    currentPeriod.month,
  );
  const { data: regionStats, loading: statsLoading } = useRegionStats(
    allLogins.length > 0 ? periodKey : null,
    asOfIso,
    allLogins.length > 0 ? allLogins : null,
    planAgg
      ? {
          forecastClientIds: planAgg.forecastClientIds,
          gapNewClientIds: planAgg.gapNewClientIds,
          gapActivationClientIds: planAgg.gapActivationClientIds,
        }
      : null,
  );

  // === №5 категорії: план + факт (як у RM-дашборді) ===
  const aggregatedPlan = useMemo(() => {
    if (!planAgg) return null;
    const empty = () => ({ plannedCount: 0, plannedSum: 0, plannedCountFinalized: 0, plannedSumFinalized: 0 });
    const out = { active: empty(), sleeping: empty(), lost: empty(), new: empty(), none: empty() };
    for (const seg of Object.values(planAgg.bySegment)) {
      for (const cat of ['active', 'sleeping', 'lost', 'new', 'none'] as const) {
        out[cat].plannedCount += seg.byCategory[cat].plannedCount;
        out[cat].plannedSum += seg.byCategory[cat].plannedSum;
        out[cat].plannedCountFinalized += seg.byCategory[cat].plannedCountFinalized ?? 0;
        out[cat].plannedSumFinalized += seg.byCategory[cat].plannedSumFinalized ?? 0;
      }
    }
    return out;
  }, [planAgg]);
  const aggregatedFact = useMemo(() => {
    if (!regionStats) return null;
    const out = {
      active: { factCount: 0, factSum: 0 }, sleeping: { factCount: 0, factSum: 0 },
      lost: { factCount: 0, factSum: 0 }, new: { factCount: 0, factSum: 0 }, none: { factCount: 0, factSum: 0 },
    };
    for (const seg of Object.values(regionStats.bySegment)) {
      for (const cat of ['active', 'sleeping', 'lost', 'new', 'none'] as const) {
        out[cat].factCount += seg.byCategory[cat].factCount;
        out[cat].factSum += seg.byCategory[cat].factSum;
      }
    }
    return out;
  }, [regionStats]);
  const aggregatedUnplanned = useMemo(() => {
    if (!regionStats) return null;
    let factCount = 0, factSum = 0;
    for (const seg of Object.values(regionStats.bySegment)) {
      factCount += seg.unplanned?.factCount ?? 0;
      factSum += seg.unplanned?.factSum ?? 0;
    }
    return { factCount, factSum };
  }, [regionStats]);

  // === Робочі дні (для темпу №3) ===
  const [py, pm] = periodKey.split('-').map(Number);
  const totalWD = getWorkingDaysInMonth(py, pm - 1);
  const passedWD = getPassedWorkingDays(py, pm - 1, new Date(asOfIso));

  // === Показники регіону ===
  const totalPlan = aggregate?.totalPlan ?? 0;
  const totalFact = aggregate?.totalFact ?? 0;
  const prevFact = aggregate?.totalPrevMonthFact ?? 0;
  const pct1 = pctOf(totalFact, totalPlan);                                   // №1
  const pct3 = calcForecastPercent(totalFact, totalPlan, passedWD, totalWD);  // №3
  const delta7 = totalFact - prevFact;                                        // №7 $(±)

  // === Розрив НА СЬОГОДНІ (а не за весь місяць) ===
  // Норма-на-дату = план × пройдені_роб.дні / усі_роб.дні. Розрив = норма − факт.
  // Якщо факт ≥ норми → розриву немає («в плані»); інакше відставання на різницю.
  const pace = totalWD > 0 ? passedWD / totalWD : 0;
  const regionNormToDate = totalPlan * pace;
  const regionGapNow = regionNormToDate - totalFact; // >0 = відставання від темпу

  // Заплановано (фіналізовані forecast+gap) — для №4 регіону
  const plannedFinalized = useMemo(() => {
    if (!aggregatedPlan) return 0;
    return (['active', 'sleeping', 'lost', 'new', 'none'] as const)
      .reduce((s, c) => s + aggregatedPlan[c].plannedSumFinalized, 0);
  }, [aggregatedPlan]);
  const plannedPct = pctOf(plannedFinalized, totalPlan); // №4 регіону

  // По брендах (№2 %+мітка): тільки сегменти з планом або фактом.
  // (без ручного useMemo — React Compiler мемоізує сам.)
  const brandRows = (aggregate?.segments ?? [])
    .filter(s => s.planAmount > 0 || s.factAmount > 0)
    .map(s => ({
      code: s.segmentCode,
      name: s.segmentName,
      plan: s.planAmount,
      fact: s.factAmount,
      pct: pctOf(s.factAmount, s.planAmount),
      forecastPct: calcForecastPercent(s.factAmount, s.planAmount, passedWD, totalWD),
      prevFact: s.prevMonthFactAmount,
      prevPct: pctOf(s.prevMonthFactAmount, s.prevMonthPlanAmount),
    }))
    .sort((a, b) => b.plan - a.plan);

  // Per-brand розбивка клієнтів по категоріях: заплановано (план) → купили (факт).
  // planAgg.bySegment keyed by raw segment_code → нормалізуємо через mapSegmentCode;
  // regionStats.bySegment уже нормалізований. Джойн по коду бренда.
  const planSegNorm: Record<string, NonNullable<typeof planAgg>['bySegment'][string]> = {};
  if (planAgg) for (const [k, v] of Object.entries(planAgg.bySegment)) planSegNorm[mapSegmentCode(k)] = v;
  // Групування як у таблиці борду (№5): Активні / Активізація (Сплячі+Втрачені+
  // БЗ) / Нові / Незаплановані. planned = ЗАПЛАНОВАНО (клієнтів), bought = ФАКТ (кл.).
  const brandCats = (code: string) => {
    const p = planSegNorm[code]?.byCategory;
    const f = regionStats?.bySegment[code]?.byCategory;
    const unpl = regionStats?.bySegment[code]?.unplanned;
    const sumP = (...keys: BrandCatKey[]) => keys.reduce((s, k) => s + (p?.[k]?.plannedCount ?? 0), 0);
    const sumF = (...keys: BrandCatKey[]) => keys.reduce((s, k) => s + (f?.[k]?.factCount ?? 0), 0);
    return [
      { label: 'Активні', planned: sumP('active'), bought: sumF('active') },
      { label: 'Активізація', planned: sumP('sleeping', 'lost', 'none'), bought: sumF('sleeping', 'lost', 'none') },
      { label: 'Нові', planned: sumP('new'), bought: sumF('new') },
      { label: 'Незапл.', planned: 0, bought: unpl?.factCount ?? 0 },
    ].filter(x => x.planned > 0 || x.bought > 0);
  };

  if (!user || !allowed) return null;

  const dataLoading = loading && !region;

  return (
    <>
      <AppHeader />
      <main className="p-4 md:p-6 max-w-5xl mx-auto w-full min-w-0 space-y-5">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> На головну
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-sky-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">Тижневий звіт регіону</h1>
            <p className="text-[12px] text-muted-foreground">
              Паспорт наради · накопичувально з 1-го · станом на {asOfIso}
            </p>
          </div>
          <PeriodFilter />
          <RegionDropdown
            regions={regions}
            value={effectiveCode}
            onChange={setSelectedCode}
            loading={statsLoading}
          />
        </div>

        {dataLoading && (
          <div className="glass-card p-8 text-center text-[13px] text-muted-foreground">Завантажую дані регіону…</div>
        )}

        {region && (
          <>
            {/* Верхній рівень: Паспорт регіону — hero-картки (стиль борду MetricCard) */}
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                <h2 className="text-[14px] font-bold">Паспорт регіону · {region.regionName}</h2>
                <p className="text-[11px] text-muted-foreground">
                  Пройдено {passedWD}/{totalWD} роб. днів ({Math.round(pace * 100)}%) · розрив <b>на сьогодні</b> · Заплановано (фінал.): <b className="text-foreground">{formatPct(plannedPct)}</b> · <Amt>{formatUSD(plannedFinalized)}</Amt>
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard
                  index={0} ambient={pct1 >= 100 ? 'good' : pct3 >= 100 ? 'warn' : 'bad'}
                  iconColor={pct1 >= 100 ? 'text-emerald-500' : pct3 >= 100 ? 'text-amber-500' : 'text-rose-500'}
                  label="Виконання" value={formatPct(pct1)}
                  caption={<span className="text-muted-foreground"><Amt>{formatUSD(totalFact)}</Amt> / <Amt>{formatUSD(totalPlan)}</Amt></span>}
                />
                <MetricCard
                  index={1} ambient={regionGapNow > 0.5 ? 'bad' : 'good'}
                  iconColor={regionGapNow > 0.5 ? 'text-rose-500' : 'text-emerald-500'}
                  label="Розрив на сьогодні" value={regionGapNow > 0.5 ? <Amt>−{formatUSD(regionGapNow)}</Amt> : 'В плані'}
                  caption={<span className="text-muted-foreground">має бути {Math.round(pace * 100)}% · норма <Amt>{formatUSD(regionNormToDate)}</Amt></span>}
                />
                <MetricCard
                  index={2} ambient={pct3 >= 100 ? 'good' : pct3 >= 80 ? 'warn' : 'bad'}
                  iconColor={pct3 >= 100 ? 'text-emerald-500' : pct3 >= 80 ? 'text-amber-500' : 'text-rose-500'}
                  label="Прогноз темпу" value={formatPct(pct3)}
                  caption={<span className="text-muted-foreground">факт на кінець міс. при темпі</span>}
                />
                <MetricCard
                  index={3} ambient={delta7 >= 0 ? 'good' : 'bad'}
                  iconColor={delta7 >= 0 ? 'text-emerald-500' : 'text-rose-500'}
                  label="Минулий місяць" value={<Amt>{delta7 >= 0 ? '+' : ''}{formatUSD(delta7)}</Amt>}
                  caption={<span className="text-muted-foreground">факт мин.: <Amt>{formatUSD(prevFact)}</Amt></span>}
                />
              </div>
            </div>

            {/* Розбивка клієнтів по 1С-категорії (унікальні): заплановано / база / купили */}
            <ClientCategoryUniqueTable
              data={regionStats?.clientCategory ?? null}
              managerNames={managerNames}
              title={`${region.regionName} (1С)`}
              loading={statsLoading}
            />

            {/* Розклад по категоріях — planning (сума plannedCount по брендах, «не унікальні») */}
            <CategoryStatsTable
              plan={aggregatedPlan}
              fact={aggregatedFact}
              unplanned={aggregatedUnplanned}
              plan1C={totalPlan}
              title={region.regionName}
              titleNote="планування"
              loading={statsLoading && !aggregatedFact}
            />

            {/* №2 По брендах: % + мітка */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e7ef]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-bold">По брендах · % + мітка</h2>
                  <span className="text-[11px] text-muted-foreground">{brandRows.length} брендів</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Під брендом — клієнти по категоріях: <b>заплановано → купили</b>.</p>
              </div>
              <div className="hidden md:grid grid-cols-[1fr_96px_96px_64px_116px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#f0f2f8]">
                <span>Бренд</span><span className="text-right">План</span><span className="text-right">Факт</span><span className="text-right">%</span><span className="text-right">Мітка</span>
              </div>
              {brandRows.map(b => {
                const mk = markOf(b.forecastPct);
                const cats = brandCats(b.code);
                const brandBuyers = cats.reduce((s, c) => s + c.bought, 0); // клієнтів купило бренд
                // «Запл.» — Σ фіналізованих forecast+gap по бренду / план 1С (як у планінгу).
                const pseg = planSegNorm[b.code];
                const plannedSum = (pseg?.forecastFinalized ?? 0) + (pseg?.gapFinalized ?? 0);
                const expectedPct = b.plan > 0 ? (plannedSum / b.plan) * 100 : 0;
                // Болванка з числами для діалогу «Причина за стандартом».
                const reasonDraft = [
                  ...cats.map(c => `${c.label} ${c.planned}→${c.bought}`),
                  `темп ${formatPct(b.forecastPct)}`,
                  b.forecastPct < 100 ? `відставання −${Math.max(0, pace * 100 - b.pct).toFixed(1)}%` : 'в плані',
                ].join(' · ');
                return (
                  <div key={b.code} className="px-4 py-2.5 border-b border-[#f0f2f8] last:border-b-0">
                    {/* Ряд 1 — жорсткий grid: Бренд | ПЛАН | ФАКТ | % | МІТКА (числа фікс. ширина, tabular-nums) */}
                    <div className="grid grid-cols-2 md:grid-cols-[1fr_96px_96px_64px_116px] gap-x-3 gap-y-1 items-center text-[13px]">
                      <span className="col-span-2 md:col-span-1 min-w-0">
                        <span className="font-bold text-[15px] leading-tight truncate block">{b.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{brandBuyers} клієнтів купили</span>
                      </span>
                      <span className="text-right font-mono amount tabular-nums text-[13px]">{formatUSD(b.plan)}</span>
                      <span className="text-right font-mono amount tabular-nums text-[13px] text-emerald-700">{formatUSD(b.fact)}</span>
                      <span className={`text-right font-bold tabular-nums text-[14px] ${b.pct >= 100 ? 'text-emerald-600' : b.pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{formatPct(b.pct)}</span>
                      <span className="text-right flex flex-col items-end gap-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${mk.cls}`}>{mk.label}</span>
                        {b.forecastPct < 100 && (
                          <span className="text-[10px] font-bold text-rose-600 tabular-nums" title="Відставання від норми на дату (у відсоткових пунктах плану)">
                            −{Math.max(0, pace * 100 - b.pct).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Ряд 2 — один компактний рядок: метрики зліва · чіпи + кнопки справа (h-6, ghost) */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10.5px] text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span><span className="text-amber-600">●</span> Прогноз (темп): <span className="font-bold text-amber-600">{formatPct(b.forecastPct)}</span></span>
                        {b.plan > 0 && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span><span className="text-emet-blue">●</span> Запл.: <span className="font-bold text-emet-blue">{formatPct(expectedPct)}</span> · <span className="amount font-semibold">{formatUSD(plannedSum)}</span></span>
                          </>
                        )}
                        <span className="text-muted-foreground/40">·</span>
                        <span>Мин. міс. <span className="amount font-semibold">{formatUSD(b.prevFact)}</span> / {b.prevPct.toFixed(1)}%</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                        {cats.map(c => (
                          <span key={c.label} className="inline-flex items-center h-6 gap-1 rounded-md bg-[#f5f7fb] border border-[#e8ecf5] px-2">
                            <span>{c.label}</span>
                            <span className="tabular-nums font-semibold text-foreground/80">
                              {c.planned}
                              <span className="mx-0.5 text-muted-foreground font-normal">→</span>
                              <span className={c.planned > 0 && c.bought >= c.planned ? 'text-emerald-600' : c.bought > 0 ? 'text-foreground' : 'text-rose-500'}>{c.bought}</span>
                            </span>
                            {c.planned > 0 && <span className="tabular-nums text-muted-foreground/70">· {pctOf(c.bought, c.planned).toFixed(0)}%</span>}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Кнопки — окремий рядок, вирівняні праворуч */}
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <BrandNote segmentName={b.name} label="Дія" placeholder="Дія на тиждень / фокус по цьому бренду: кого відвідати, що дотиснути, дедлайн…" />
                      <BrandNote segmentName={b.name} label="Причина" draft={reasonDraft} hint="категорія → N із M → факт → висновок (числа з борду, висновок словами)." placeholder="Напр.: Активні 8 запл., купили 2 (25%) — просів темп, 4 з 12 не відвантажили замовлення…" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* №6 Розріз по менеджерах (розрив = тригер подвійних візитів) */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e7ef]">
                <h2 className="text-[13px] font-bold">Розріз по менеджерах · розрив = тригер подвійних візитів</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">«Розрив зараз» = норма на дату ({Math.round(pace * 100)}% плану) − факт. «в плані» = факт ≥ норми.</p>
              </div>
              <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_80px_1fr] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#f0f2f8]">
                <span>Менеджер</span><span className="text-right">План міс.</span><span className="text-right">Факт</span><span className="text-right">%</span><span className="text-right">Розрив зараз</span>
              </div>
              {managers.map(m => {
                const gap = m.totalPlan * pace - m.totalFact; // норма на дату − факт
                return (
                  <div key={m.login} className="grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_80px_1fr] gap-x-3 gap-y-1 px-4 py-2.5 items-center text-[13px] border-b border-[#f0f2f8] last:border-b-0">
                    <span className="font-bold col-span-2 md:col-span-1">{m.name}</span>
                    <span className="text-right font-mono amount text-[12px]">{formatUSD(m.totalPlan)}</span>
                    <span className="text-right font-mono amount text-[12px] text-emerald-700">{formatUSD(m.totalFact)}</span>
                    <span className={`text-right font-bold tabular-nums ${m.factPercent >= 100 ? 'text-emerald-600' : m.factPercent >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{formatPct(m.factPercent)}</span>
                    <span className={`text-right font-mono text-[12px] font-semibold ${gap > 0.5 ? 'amount text-rose-600' : 'text-emerald-600'}`}>{gap > 0.5 ? `−${formatUSD(gap)}` : 'В плані'}</span>
                  </div>
                );
              })}
            </div>

            {/* Ручні поля (не авто) — вводить РМ */}
            <ManualFields />
          </>
        )}
      </main>
    </>
  );
}

/** Грошове значення, що ховається у режимі «Сховати суми» (клас .amount). */
function Amt({ children }: { children: React.ReactNode }) {
  return <span className="amount">{children}</span>;
}

/**
 * «Причина за стандартом» по бренду — кнопка → діалог (стиль як у
 * «Зауваження до планування»). ЛОКАЛЬНИЙ стан (тестова сторінка, без
 * збереження — зберігання додамо після виверки борду). `draft` — болванка
 * з числами для кнопки «Підставити числа».
 */
function BrandNote({ segmentName, label, placeholder, hint, draft, className = '' }: {
  segmentName: string; label: string; placeholder: string; hint?: string; draft?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const ta = 'w-full rounded-xl border border-[rgba(6,42,61,0.15)] bg-white/70 px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30';
  const openDialog = () => { setText(saved); setOpen(true); };
  return (
    <>
      <button
        onClick={openDialog}
        title={saved || label}
        className={`inline-flex items-center h-6 gap-1 max-w-[180px] px-2 rounded-md text-[10.5px] font-semibold border transition-colors ${saved ? 'text-emet-blue bg-emet-blue/10 border-emet-blue/25 hover:bg-emet-blue/15' : 'text-slate-600 bg-transparent border-[#e2e7ef] hover:bg-[#f5f7fb]'} ${className}`}
      >
        <PenLine className="h-3 w-3 shrink-0" />
        <span className="truncate">{saved ? `${label}: ${saved}` : label}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-[15px]">{label} · {segmentName}</DialogTitle>
          {hint && <p className="text-[12px] text-muted-foreground -mt-1">{hint}</p>}
          {draft !== undefined && (
            <button
              type="button"
              onClick={() => setText(t => (t.trim() ? t : `${draft}. Висновок: `))}
              className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emet-blue bg-emet-blue/10 border border-emet-blue/25 hover:bg-emet-blue/15 transition-colors"
            >
              Підставити числа
            </button>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={4}
            maxLength={2000}
            placeholder={placeholder}
            className={ta}
          />
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => { setSaved(text.trim()); setOpen(false); }}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-emet-blue text-white font-semibold text-[13px] active:scale-[0.98] transition-transform"
            >
              <Check className="h-4 w-4" /> Зберегти
            </button>
            <button onClick={() => setOpen(false)} className="h-10 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Скасувати
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Ручні поля звіту — вводить РМ під час наради. Локальний стан (тестова
 * сторінка, без збереження на бекенд). Три поля за пунктами регламенту +
 * загальний «Висновок».
 */
function ManualFields() {
  const [promise, setPromise] = useState('');
  const [conclusion, setConclusion] = useState('');
  const ta = 'w-full rounded-xl border border-[rgba(6,42,61,0.15)] bg-white/70 px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30';
  return (
    <div className="glass-card p-4 md:p-5 space-y-4">
      <h2 className="text-[13px] font-bold">Заповнюється РМ вручну (не з борду)</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">«Дія» і «Причина за стандартом» — під кожним брендом вище (по кнопках).</p>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold">Обіцяв минулого тижня → факт</label>
        <p className="text-[11px] text-muted-foreground -mt-0.5">виконано / ні, чому</p>
        <textarea value={promise} onChange={e => setPromise(e.target.value)} rows={3} maxLength={2000} placeholder="Що обіцяв минулого тижня і що з того по факту сталося…" className={ta} />
      </div>

      <div className="space-y-1.5 pt-2 border-t border-[#eef1f7]">
        <label className="text-[12px] font-bold">Висновок</label>
        <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} rows={4} maxLength={3000} placeholder="Загальний висновок по регіону за тиждень…" className={ta} />
      </div>

      <p className="text-[11px] text-amber-700">
        Заборонені формулювання без цифр: «немає потреби», «є тенденція», «запаси стоять», «літо/відпустки», «це процес», «мають купити» без переліку і дат.
      </p>
    </div>
  );
}
