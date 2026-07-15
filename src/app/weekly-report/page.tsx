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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData, mapSegmentCode } from '@/lib/onec-adapters';
import { aggregateRegion, aggregateManagers, aggregateRegionClientStats } from '@/lib/region-aggregates';
import { ClientStatsCard } from '@/components/dashboard/client-stats-card';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import { CategoryStatsTable } from '@/components/dashboard/category-stats-table';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { pctOf, calcForecastPercent, formatUSD, formatPct } from '@/lib/format';
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import { ArrowLeft, ClipboardList } from 'lucide-react';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Ключі категорій клієнтів (як у planAgg/regionStats byCategory). */
type BrandCatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

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

  const asOfIso = todayIso();
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
  const clientStats = useMemo(() => (region ? aggregateRegionClientStats(region) : null), [region]);
  const managers = useMemo(() => (region ? aggregateManagers(region) : []), [region]);
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
  // Якщо факт ≥ норми → розриву немає («в темпі»); інакше відставання на різницю.
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
          <select
            value={effectiveCode ?? ''}
            onChange={e => setSelectedCode(e.target.value)}
            className="h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
          >
            {regions.map(r => (
              <option key={r.regionCode} value={r.regionCode}>{r.regionName}</option>
            ))}
          </select>
        </div>

        {dataLoading && (
          <div className="glass-card p-8 text-center text-[13px] text-muted-foreground">Завантажую дані регіону…</div>
        )}

        {region && (
          <>
            {/* Hero-ряд: паспорт (4 показники + №4) + 5-та картка «Клієнти — факт купівель» */}
            <div className="grid lg:grid-cols-[2fr_1fr] gap-4 items-start">
              {/* Паспорт регіону — №1 / розрив-зараз / №3 / №7 (+ №4 нижче) */}
              <div className="glass-card p-4 md:p-5">
                <h2 className="text-[13px] font-bold mb-1">Паспорт регіону · {region.regionName}</h2>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Пройдено {passedWD} з {totalWD} роб. днів місяця ({Math.round(pace * 100)}%). Розрив рахується <b>на сьогодні</b> (норма на дату), а не за весь місяць.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <PassportCell label="№1 Виконання" value={formatPct(pct1)} sub={<><Amt>{formatUSD(totalFact)}</Amt> / <Amt>{formatUSD(totalPlan)}</Amt></>} color={pct1 >= 100 ? 'good' : pct3 >= 100 ? 'warn' : 'bad'} />
                  <PassportCell
                    label="Розрив на сьогодні"
                    value={regionGapNow > 0.5 ? <Amt>−{formatUSD(regionGapNow)}</Amt> : 'в темпі'}
                    sub={<>має бути {Math.round(pace * 100)}% · норма <Amt>{formatUSD(regionNormToDate)}</Amt></>}
                    color={regionGapNow > 0.5 ? 'bad' : 'good'}
                  />
                  <PassportCell label="№3 Прогноз темпу" value={formatPct(pct3)} sub="факт на кінець міс. при темпі" color={pct3 >= 100 ? 'good' : pct3 >= 80 ? 'warn' : 'bad'} />
                  <PassportCell label="№7 Минулий місяць" value={<Amt>{delta7 >= 0 ? '+' : ''}{formatUSD(delta7)}</Amt>} sub={<>факт мин.: <Amt>{formatUSD(prevFact)}</Amt></>} color={delta7 >= 0 ? 'good' : 'bad'} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  №4 Заплановано (фіналізовано): <b className="text-foreground">{formatPct(plannedPct)}</b> · <Amt>{formatUSD(plannedFinalized)}</Amt>
                </p>
              </div>

              {/* 5-та hero-картка — клієнти по категоріях (факт купівель / усього), як у планінгу */}
              <ClientStatsCard
                stats={clientStats ?? {
                  active: { total: 0, bought: 0 },
                  sleeping: { total: 0, bought: 0 },
                  lost: { total: 0, bought: 0 },
                  newClients: { total: 0, bought: 0 },
                  totalBought: 0,
                  totalClients: 0,
                }}
                loading={loading && !clientStats}
                index={1}
              />
            </div>

            {/* №5 Розклад по категоріях (Активні/Активізація/Незаплановані/Нові) */}
            <CategoryStatsTable
              plan={aggregatedPlan}
              fact={aggregatedFact}
              unplanned={aggregatedUnplanned}
              plan1C={totalPlan}
              title={`№5 · ${region.regionName}`}
              loading={statsLoading && !aggregatedFact}
            />

            {/* №2 По брендах: % + мітка */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e7ef]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-bold">№2 По брендах · % + мітка</h2>
                  <span className="text-[11px] text-muted-foreground">{brandRows.length} брендів</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Під брендом — клієнти по категоріях: <b>заплановано → купили</b>.</p>
              </div>
              <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_80px_140px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#f0f2f8]">
                <span>Бренд</span><span className="text-right">План</span><span className="text-right">Факт</span><span className="text-right">%</span><span className="text-right">Мітка</span>
              </div>
              {brandRows.map(b => {
                const mk = markOf(b.forecastPct);
                const cats = brandCats(b.code);
                return (
                  <div key={b.code} className="px-4 py-2.5 border-b border-[#f0f2f8] last:border-b-0">
                    <div className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_80px_140px] gap-x-3 gap-y-1 items-center text-[13px]">
                      <span className="font-bold col-span-2 md:col-span-1">{b.name}</span>
                      <span className="text-right font-mono amount text-[12px]">{formatUSD(b.plan)}</span>
                      <span className="text-right font-mono amount text-[12px] text-emerald-700">{formatUSD(b.fact)}</span>
                      <span className={`text-right font-bold tabular-nums ${b.pct >= 100 ? 'text-emerald-600' : b.pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{formatPct(b.pct)}</span>
                      <span className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${mk.cls}`}>{mk.label}</span>
                      </span>
                    </div>
                    {cats.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {cats.map(c => (
                          <span key={c.label} className="inline-flex items-center gap-1 rounded-md bg-[#f5f7fb] border border-[#e8ecf5] px-1.5 py-0.5 text-[10.5px]">
                            <span className="text-muted-foreground">{c.label}</span>
                            <span className="tabular-nums font-semibold text-foreground/80">
                              {c.planned}
                              <span className="mx-0.5 text-muted-foreground font-normal">→</span>
                              <span className={c.planned > 0 && c.bought >= c.planned ? 'text-emerald-600' : c.bought > 0 ? 'text-foreground' : 'text-rose-500'}>{c.bought}</span>
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* №6 Розріз по менеджерах (розрив = тригер подвійних візитів) */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e7ef]">
                <h2 className="text-[13px] font-bold">№6 Розріз по менеджерах · розрив = тригер подвійних візитів</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">«Розрив зараз» = норма на дату ({Math.round(pace * 100)}% плану) − факт. «в темпі» = факт ≥ норми.</p>
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
                    <span className={`text-right font-mono amount text-[12px] font-semibold ${gap > 0.5 ? 'text-rose-600' : 'text-emerald-600'}`}>{gap > 0.5 ? `−${formatUSD(gap)}` : 'в темпі'}</span>
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

function PassportCell({ label, value, sub, color }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; color: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const c = {
    good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600', neutral: 'text-foreground',
  }[color];
  return (
    <div className="rounded-xl border border-[#eef1f7] bg-[#fafbfe] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums leading-tight mt-0.5 ${c}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

/** Грошове значення, що ховається у режимі «Сховати суми» (клас .amount). */
function Amt({ children }: { children: React.ReactNode }) {
  return <span className="amount">{children}</span>;
}

/**
 * Ручні поля звіту — вводить РМ під час наради. Локальний стан (тестова
 * сторінка, без збереження на бекенд). Три поля за пунктами регламенту +
 * загальний «Висновок».
 */
function ManualFields() {
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');
  const [promise, setPromise] = useState('');
  const [conclusion, setConclusion] = useState('');
  const ta = 'w-full rounded-xl border border-[rgba(6,42,61,0.15)] bg-white/70 px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30';
  return (
    <div className="glass-card p-4 md:p-5 space-y-4">
      <h2 className="text-[13px] font-bold">Заповнюється РМ вручну (не з борду)</h2>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold">Причина за стандартом</label>
        <p className="text-[11px] text-muted-foreground -mt-0.5">категорія → N із M → факт → <i>висновок</i> (числа вище, висновок словами)</p>
        <textarea value={cause} onChange={e => setCause(e.target.value)} rows={3} maxLength={2000} placeholder="Напр.: Активні 78 запл., купили 32 (36%) — просів Petaran, 4 з 12 не відвантажили замовлення…" className={ta} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold">Дія на тиждень / фокус</label>
        <textarea value={action} onChange={e => setAction(e.target.value)} rows={3} maxLength={2000} placeholder="Рішення РМ: кого відвідати, який бренд дотиснути, дедлайни…" className={ta} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold">№8 Обіцяв минулого тижня → факт</label>
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
