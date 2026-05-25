'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, TrendingUp, TrendingDown } from 'lucide-react';
import { formatUSD, formatPct, getTrafficLight, pctOf, calcForecastPercent } from '@/lib/format';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { BrandRow } from './brand-row';
import { CategoryStatsTable } from './category-stats-table';
import { useAppStore } from '@/lib/store';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import type { RegionAggregate } from '@/lib/region-aggregates';

interface Props {
  aggregate: RegionAggregate;
  /** managers brief — для mini-list (per-manager %). */
  managersBrief: Array<{ name: string; login: string; pct: number; dev: number; onPlan: boolean; isTrial?: boolean }>;
  calcPct: number;
  asOfDate: Date;
  /** Логіни менеджерів цього регіону — для lazy-load category-stats при expand. */
  regionLogins: string[];
  /** Сума запланованого (forecast + gap) по всіх менеджерах регіону.
   *  Передається з parent щоб не fetch-ити planAgg per region у header
   *  (поки expand не відкритий). Для progress-лінії з насічкою «Запл.». */
  regionExpectedAmount?: number;
  /** Drill-down у RMDashboard цього регіону. */
  onDrillDown: () => void;
  /**
   * Швидкий drill-down напряму у конкретного менеджера (з mini-list).
   * Якщо не передано — імена в mini-list НЕ клікабельні.
   */
  onManagerClick?: (login: string) => void;
}

/** Прізвище І. — наприклад "Сірик Наталія" → "Сірик Н." */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

/**
 * Відновлено з 0767809^ — картка регіону на Director-дашборді.
 *
 * Click на header = expand вниз (9 BrandRow по сегментам регіону).
 * Drill-down у RMDashboard — окрема <ChevronRight> кнопка справа з
 * stopPropagation. Mini-list менеджерів між назвою і Факт/План.
 */
export function RegionAccordion({ aggregate, managersBrief, calcPct, asOfDate, regionLogins, regionExpectedAmount = 0, onDrillDown, onManagerClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const pct = pctOf(aggregate.totalFact, aggregate.totalPlan);
  const tl = getTrafficLight(pct, calcPct);
  const dev = pct - calcPct;
  // Б.2: динаміка vs минулий = заплановане vs минулий факт (forward-looking).
  // Fallback на totalFact якщо нема плану.
  const compareForDyn = regionExpectedAmount > 0 ? regionExpectedAmount : aggregate.totalFact;
  const dynAmount = compareForDyn - aggregate.totalPrevMonthFact;
  const dynBetter = dynAmount >= 0;
  const prevPct = pctOf(aggregate.totalPrevMonthFact, aggregate.totalPrevMonthPlan);

  // Б.3: насічки прогрес-лінії — forecast (run-rate) + expected (planning).
  const totalWD = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());
  const passedWD = getPassedWorkingDays(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
  const regionForecastPct = calcForecastPercent(aggregate.totalFact, aggregate.totalPlan, passedWD, totalWD);
  const regionExpectedPct = aggregate.totalPlan > 0
    ? (regionExpectedAmount / aggregate.totalPlan) * 100
    : 0;
  const hasRegionPlan = regionExpectedAmount > 0;

  // Lazy-load: тягнемо план + факт по категоріях ТІЛЬКИ коли expanded.
  // Чому lazy: 8 регіонів × 2 запити одразу = багато викликів 1С. Користувач
  // зазвичай розгортає 1-2 регіони. SWR кешує між повторними розгортаннями.
  const { currentPeriod, liveMode } = useAppStore();
  const periodKeyForStats = currentPeriod.month.slice(0, 7);
  const asOfIso = liveMode ? new Date().toISOString().slice(0, 10) : currentPeriod.weekEnd;
  const fetchLogins = expanded && regionLogins.length > 0 ? regionLogins : null;
  const { data: planAgg } = usePlanningAggregate(currentPeriod.id, fetchLogins, currentPeriod.month);
  const { data: regionStatsData, loading: statsLoading } = useRegionStats(
    fetchLogins ? periodKeyForStats : null,
    asOfIso,
    fetchLogins,
    planAgg ? {
      forecastClientIds: planAgg.forecastClientIds,
      gapNewClientIds: planAgg.gapNewClientIds,
      gapActivationClientIds: planAgg.gapActivationClientIds,
    } : null,
  );
  const aggregatedPlan = useMemo(() => {
    if (!planAgg) return null;
    const empty = () => ({ plannedCount: 0, plannedSum: 0, plannedCountFinalized: 0, plannedSumFinalized: 0 });
    const out = { active: empty(), sleeping: empty(), lost: empty(), new: empty(), none: empty() };
    for (const seg of Object.values(planAgg.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].plannedCount += seg.byCategory[cat].plannedCount;
        out[cat].plannedSum   += seg.byCategory[cat].plannedSum;
        out[cat].plannedCountFinalized += seg.byCategory[cat].plannedCountFinalized ?? 0;
        out[cat].plannedSumFinalized   += seg.byCategory[cat].plannedSumFinalized ?? 0;
      }
    }
    return out;
  }, [planAgg]);
  const aggregatedFact = useMemo(() => {
    if (!regionStatsData) return null;
    const out = {
      active: { factCount: 0, factSum: 0 },
      sleeping: { factCount: 0, factSum: 0 },
      lost: { factCount: 0, factSum: 0 },
      new: { factCount: 0, factSum: 0 },
      none: { factCount: 0, factSum: 0 },
    };
    for (const seg of Object.values(regionStatsData.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].factCount += seg.byCategory[cat].factCount;
        out[cat].factSum   += seg.byCategory[cat].factSum;
      }
    }
    return out;
  }, [regionStatsData]);
  const aggregatedUnplanned = useMemo(() => {
    if (!regionStatsData) return null;
    let factCount = 0, factSum = 0;
    for (const seg of Object.values(regionStatsData.bySegment)) {
      factCount += seg.unplanned?.factCount ?? 0;
      factSum   += seg.unplanned?.factSum   ?? 0;
    }
    return { factCount, factSum };
  }, [regionStatsData]);

  // Render mini-list менеджерів — використовуємо у row 2 під основним grid.
  const miniList = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1">
      {managersBrief.map(m => {
        // Trial-новачок (1С виставила $1 sentinel замість плану) — не показуємо
        // % бо безглуздо. Сіра точка + badge «Новачок» замість червоного «0%».
        const inner = m.isTrial ? (
          <>
            <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
            <span className="font-semibold text-slate-600 truncate flex-1 min-w-0">{shortName(m.name)}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 shrink-0">Новачок</span>
          </>
        ) : (
          <>
            <span className={`w-2 h-2 rounded-full shrink-0 ${m.onPlan ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="font-semibold text-foreground/80 truncate flex-1 min-w-0">{shortName(m.name)}</span>
            <span className={`font-bold shrink-0 ${m.onPlan ? 'text-emerald-600' : 'text-rose-600'}`}>
              {m.pct.toFixed(0)}%
            </span>
            <span className={`text-[10px] shrink-0 ${m.dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ({m.dev >= 0 ? '+' : ''}{m.dev.toFixed(1)}%)
            </span>
          </>
        );
        const tip = m.isTrial
          ? `${m.name}: новачок на випробувальному (1С виставила $1 sentinel)${onManagerClick ? ' · клік для drill-down' : ''}`
          : `${m.name}: ${m.pct.toFixed(1)}% (${m.dev >= 0 ? '+' : ''}${m.dev.toFixed(1)}% vs норма)${onManagerClick ? ' · клік для drill-down' : ''}`;
        if (onManagerClick) {
          return (
            <button
              key={m.login}
              onClick={(e) => { e.stopPropagation(); onManagerClick(m.login); }}
              title={tip}
              className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap rounded px-1 -mx-1 hover:bg-[#e8f4fc] cursor-pointer text-left min-w-0"
            >
              {inner}
            </button>
          );
        }
        return (
          <span key={m.login} className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap min-w-0" title={tip}>
            {inner}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="glass-card overflow-hidden transition-all hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]">
      {/* === DESKTOP/TABLET (md+): grid layout як у BrandRow, з drill-down chevron === */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="hidden xl:block px-3 md:px-4 py-3 md:py-4 cursor-pointer hover:bg-[#fafbfe] transition-colors"
      >
        {/* Row 1: name+icon | badge | factPct+dev | progress | plan | fact | menagers | мин.міс | chevron | drill-down */}
        <div className="grid grid-cols-[180px_95px_115px_minmax(160px,1fr)_85px_85px_70px_170px_20px_28px] gap-3 items-center">
          {/* 1. Region name + MapPin */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-[#066aab]" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold truncate">{aggregate.regionName}</p>
              <p className="text-[10px] text-muted-foreground">{managersBrief.length} менеджерів</p>
            </div>
          </div>

          {/* 2. Бейдж traffic-light */}
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-center ${tl.bg} ${tl.color}`}>
            {tl.label}
          </span>

          {/* 3. Факт% + dev */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold tracking-tight">{pct.toFixed(1)}%</span>
            <span className={`text-[11px] font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
            </span>
          </div>

          {/* 4. Progress bar з насічками + легенда нижче (BrandRow pattern) */}
          <div className="min-w-0">
            <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc] transition-all duration-500"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
              {regionForecastPct > 0 && regionForecastPct <= 100 && (
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-amber-500 rounded-full"
                  style={{ left: `calc(${Math.min(regionForecastPct, 100)}% - 1px)` }}
                  title={`Прогноз (темп): ${formatPct(regionForecastPct)}`}
                />
              )}
              {hasRegionPlan && (
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full"
                  style={{ left: `calc(${Math.min(regionExpectedPct, 100)}% - 1px)` }}
                  title={`Запланований: ${formatPct(regionExpectedPct)}`}
                />
              )}
            </div>
            <p className="text-[10px] mt-1 truncate flex items-center gap-2">
              <span>
                <span className="text-amber-600">●</span> Прогноз (темп):{' '}
                <span className="font-bold text-amber-600">{formatPct(regionForecastPct)}</span>
              </span>
              {/* «Запл.» показуємо ЗАВЖДИ коли регіон має план з 1С — навіть
                  «Запл.: 0% · $0» якщо менеджери ще не finalized. Раніше
                  блок зникав і user не розумів чи це не планували, чи рендер
                  забув показати. */}
              {aggregate.totalPlan > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    <span className="text-[#066aab]">●</span> Запл.:{' '}
                    <span className="font-bold text-[#066aab]">{formatPct(regionExpectedPct)}</span>
                    <span className="text-muted-foreground"> · <span className="amount font-semibold">{formatUSD(regionExpectedAmount)}</span></span>
                  </span>
                </>
              )}
            </p>
          </div>

          {/* 5. План */}
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">План</p>
            <p className="text-[12px] font-bold amount">{formatUSD(aggregate.totalPlan)}</p>
          </div>

          {/* 6. Факт */}
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Факт</p>
            <p className="text-[12px] font-bold amount">{formatUSD(aggregate.totalFact)}</p>
          </div>

          {/* 7. Менеджерів */}
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Менедж.</p>
            <p className="text-[12px] font-bold">{managersBrief.length}</p>
          </div>

          {/* 8. Минулий місяць */}
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Мин. міс.</p>
            {aggregate.totalPrevMonthFact > 0 ? (
              <>
                <p className="text-[11px] font-semibold leading-tight">
                  <span className="amount">{formatUSD(aggregate.totalPrevMonthFact)}</span>
                  <span className="text-muted-foreground"> / {prevPct.toFixed(1)}%</span>
                </p>
                <p className={`text-[10px] font-bold flex items-center justify-end gap-0.5 leading-tight ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground/40">—</p>
            )}
          </div>

          {/* 9. Accordion chevron */}
          <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />

          {/* 10. Drill-down */}
          <button
            onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Перейти у дашборд регіону"
            className="p-1 rounded-md hover:bg-[#e8f4fc] text-muted-foreground/40 hover:text-[#066aab] transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2: mini-list менеджерів */}
        {managersBrief.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#f0f2f8]">{miniList}</div>
        )}
      </div>

      {/* === MID-TABLET (md..lg-xl): спрощений stacked layout, без grid === */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="hidden md:block xl:hidden px-4 py-3 cursor-pointer hover:bg-[#fafbfe] transition-colors"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
            <MapPin className="h-4 w-4 text-[#066aab]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-bold truncate flex-1">{aggregate.regionName}</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{managersBrief.length} менеджерів</p>
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-lg font-extrabold tracking-tight">{pct.toFixed(1)}%</span>
            <span className={`text-[11px] font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <button
            onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Перейти у дашборд регіону"
            className="p-1 rounded-md hover:bg-[#e8f4fc] text-muted-foreground/40 hover:text-[#066aab] transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar з насічками */}
        <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible mb-1.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]" style={{ width: `${Math.min(pct, 100)}%` }} />
          {regionForecastPct > 0 && regionForecastPct <= 100 && (
            <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-amber-500 rounded-full" style={{ left: `calc(${Math.min(regionForecastPct, 100)}% - 1px)` }} />
          )}
          {hasRegionPlan && (
            <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full" style={{ left: `calc(${Math.min(regionExpectedPct, 100)}% - 1px)` }} />
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] flex-wrap mb-2">
          <span><span className="text-amber-600">●</span> Прогноз (темп) <span className="font-bold text-amber-600">{formatPct(regionForecastPct)}</span></span>
          {aggregate.totalPlan > 0 && (
            <span>
              <span className="text-[#066aab]">●</span> Запл. <span className="font-bold text-[#066aab]">{formatPct(regionExpectedPct)}</span>
              <span className="text-muted-foreground"> · <span className="amount font-semibold">{formatUSD(regionExpectedAmount)}</span></span>
            </span>
          )}
          <span className="text-muted-foreground">|</span>
          <span>План <span className="font-bold amount">{formatUSD(aggregate.totalPlan)}</span></span>
          <span>Факт <span className="font-bold amount">{formatUSD(aggregate.totalFact)}</span></span>
          {aggregate.totalPrevMonthFact > 0 && (
            <>
              <span className="text-muted-foreground">Мин. <span className="font-bold amount">{formatUSD(aggregate.totalPrevMonthFact)}</span> / {prevPct.toFixed(1)}%</span>
              <span className={`flex items-center gap-0.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'} font-semibold`}>
                {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
              </span>
            </>
          )}
        </div>

        {managersBrief.length > 0 && (
          <div className="pt-2 border-t border-[#f0f2f8]">{miniList}</div>
        )}
      </div>

      {/* === MOBILE === */}
      <div className="md:hidden">
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-start gap-2.5 px-3 py-3 cursor-pointer active:bg-[#f4f7fb]"
        >
          <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="h-4 w-4 text-[#066aab]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[14px] font-bold truncate flex-1">{aggregate.regionName}</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              <button
                onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
                className="p-1 rounded-lg text-muted-foreground/40 hover:text-[#066aab] hover:bg-[#e8f4fc] transition-colors cursor-pointer shrink-0"
                title="Дашборд регіону"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-1.5 text-[11px] text-muted-foreground">
              <span>{managersBrief.length} менеджерів</span>
              <span className="text-muted-foreground/40">·</span>
              <span className={`font-bold ${tl.color}`}>{pct.toFixed(1)}%</span>
              <span className={`font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mb-2">
              <div className={`h-full rounded-full ${pct >= calcPct ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Факт <span className="font-bold text-foreground amount">{formatUSD(aggregate.totalFact)}</span>
                <span className="text-muted-foreground/50"> / </span>
                <span className="amount text-muted-foreground/70">{formatUSD(aggregate.totalPlan)}</span>
              </span>
              {aggregate.totalPrevMonthFact > 0 && (
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    Мин. <span className="font-bold text-foreground amount">{formatUSD(aggregate.totalPrevMonthFact)}</span> / {prevPct.toFixed(1)}%
                  </span>
                  <span className={`flex items-center gap-0.5 font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Розгорнутий блок: спочатку зведена таблиця по категоріях клієнтів,
          потім список брендів цього регіону */}
      {expanded && (
        <div className="px-3 md:px-5 pb-4 pt-3 space-y-3 bg-[#fafbfe] border-t border-[#f0f2f8]">
          <CategoryStatsTable
            plan={aggregatedPlan}
            fact={aggregatedFact}
            unplanned={aggregatedUnplanned}
            title={`${aggregate.regionName} · ${managersBrief.length} ${managersBrief.length === 1 ? 'менеджер' : 'менеджерів'}`}
            loading={statsLoading && !aggregatedFact}
          />
          <div className="space-y-1.5">
            {aggregate.segments.map(seg => {
              // hasManagerPlan тільки коли planAgg догрузилось (без blink).
              // ТІЛЬКИ фіналізовані плани (чернетки у звітність не йдуть).
              const segPlan = planAgg?.bySegment[seg.segmentCode];
              const managerForecast = segPlan?.forecastFinalized ?? 0;
              const managerGap = segPlan?.gapFinalized ?? 0;
              const hasManagerPlan = !!planAgg && seg.planAmount > 0;
              const expectedPercent = seg.planAmount > 0
                ? ((managerForecast + managerGap) / seg.planAmount) * 100
                : 0;
              return (
                <BrandRow
                  key={seg.segmentCode}
                  segmentName={seg.segmentName}
                  planAmount={seg.planAmount}
                  factAmount={seg.factAmount}
                  calcPct={calcPct}
                  asOfDate={asOfDate}
                  hasManagerPlan={hasManagerPlan}
                  expectedPercent={expectedPercent}
                  expectedAmount={managerForecast + managerGap}
                  prevMonthFactAmount={seg.prevMonthFactAmount}
                  prevMonthFactPercent={pctOf(seg.prevMonthFactAmount, seg.prevMonthPlanAmount)}
                  readOnly
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
