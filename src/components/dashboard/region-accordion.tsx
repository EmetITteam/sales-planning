'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, TrendingUp, TrendingDown } from 'lucide-react';
import { formatUSD, getTrafficLight, pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import { CategoryStatsTable } from './category-stats-table';
import { useAppStore } from '@/lib/store';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import type { RegionAggregate } from '@/lib/region-aggregates';

interface Props {
  aggregate: RegionAggregate;
  /** managers brief — для mini-list (per-manager %). */
  managersBrief: Array<{ name: string; login: string; pct: number; dev: number; onPlan: boolean }>;
  calcPct: number;
  asOfDate: Date;
  /** Логіни менеджерів цього регіону — для lazy-load category-stats при expand. */
  regionLogins: string[];
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
export function RegionAccordion({ aggregate, managersBrief, calcPct, asOfDate, regionLogins, onDrillDown, onManagerClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const pct = pctOf(aggregate.totalFact, aggregate.totalPlan);
  const tl = getTrafficLight(pct, calcPct);
  const dev = pct - calcPct;
  const dynAmount = aggregate.totalFact - aggregate.totalPrevMonthFact;
  const dynBetter = dynAmount >= 0;
  const prevPct = pctOf(aggregate.totalPrevMonthFact, aggregate.totalPrevMonthPlan);

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
    const out = {
      active: { plannedCount: 0, plannedSum: 0 },
      sleeping: { plannedCount: 0, plannedSum: 0 },
      lost: { plannedCount: 0, plannedSum: 0 },
      new: { plannedCount: 0, plannedSum: 0 },
      none: { plannedCount: 0, plannedSum: 0 },
    };
    for (const seg of Object.values(planAgg.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].plannedCount += seg.byCategory[cat].plannedCount;
        out[cat].plannedSum   += seg.byCategory[cat].plannedSum;
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

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* === DESKTOP === */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="hidden md:flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#fafbfe] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-[#066aab]" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold truncate">{aggregate.regionName}</p>
            <p className="text-[11px] text-muted-foreground">{managersBrief.length} менеджерів</p>
          </div>
        </div>

        {/* Mini-list менеджерів — 2 колонки. Клікабельні якщо onManagerClick передано
            (drill-down напряму у конкретного менеджера, skip RMDashboard). */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1 px-2">
          {managersBrief.map(m => {
            const inner = (
              <>
                <span className={`w-2 h-2 rounded-full shrink-0 ${m.onPlan ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-semibold text-foreground/80 truncate">{shortName(m.name)}</span>
                <span className={`font-bold shrink-0 ${m.onPlan ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {m.pct.toFixed(0)}%
                </span>
                <span className={`text-[10px] shrink-0 ${m.dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ({m.dev >= 0 ? '+' : ''}{m.dev.toFixed(1)}%)
                </span>
              </>
            );
            const tip = `${m.name}: ${m.pct.toFixed(1)}% (${m.dev >= 0 ? '+' : ''}${m.dev.toFixed(1)}% vs норма)${onManagerClick ? ' · клік для drill-down' : ''}`;
            if (onManagerClick) {
              return (
                <button
                  key={m.login}
                  onClick={(e) => { e.stopPropagation(); onManagerClick(m.login); }}
                  title={tip}
                  className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap rounded px-1 -mx-1 hover:bg-[#e8f4fc] cursor-pointer text-left"
                >
                  {inner}
                </button>
              );
            }
            return (
              <span key={m.login} className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap" title={tip}>
                {inner}
              </span>
            );
          })}
        </div>

        <div className="flex items-start gap-4 justify-end shrink-0 min-h-[56px]">
          {/* Фіксовані min-width на колонках щоб ряди різних регіонів вирівнювались
              вертикально незалежно від довжини сум. */}
          <div className="text-right min-w-[180px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Факт / План</p>
            <p className="text-[14px] font-bold font-mono leading-none mt-1.5 whitespace-nowrap">
              <span className="amount">{formatUSD(aggregate.totalFact)}</span>
              <span className="text-muted-foreground/50 font-normal"> / </span>
              <span className="amount text-muted-foreground/70">{formatUSD(aggregate.totalPlan)}</span>
            </p>
          </div>
          <div className="text-right min-w-[150px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Мин. міс.</p>
            {aggregate.totalPrevMonthFact > 0 ? (
              <>
                <p className="text-[12px] font-bold leading-none mt-1.5 whitespace-nowrap">
                  <span className="amount">{formatUSD(aggregate.totalPrevMonthFact)}</span>
                  <span className="text-muted-foreground"> / {prevPct.toFixed(1)}%</span>
                </p>
                <p className={`text-[11px] font-bold leading-none mt-1 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {dynBetter ? <TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 -mt-0.5 mr-0.5" />}
                  <span className="amount whitespace-nowrap">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                </p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground/40 leading-none mt-1.5">—</p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 w-14">
            <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
              <div className={`h-full rounded-full ${pct >= calcPct ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className={`text-[11px] font-bold leading-none ${tl.color}`}>{pct.toFixed(1)}%</span>
            <span className={`text-[10px] font-bold leading-none ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
            </span>
          </div>
          <div className="w-[100px]">
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
          </div>
          <div>
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Перейти у дашборд регіону"
            className="mt-[16px] p-1.5 rounded-lg hover:bg-[#e8f4fc] text-muted-foreground/40 hover:text-[#066aab] transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
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
              // Показуємо «Запл.: X%» ЗАВЖДИ коли бренд має target з 1С.
              // Якщо менеджери регіону не планували — Запл.: 0% (а не сховано).
              const segPlan = planAgg?.bySegment[seg.segmentCode];
              const managerForecast = segPlan?.forecast ?? 0;
              const managerGap = segPlan?.gap ?? 0;
              const hasManagerPlan = seg.planAmount > 0;
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
