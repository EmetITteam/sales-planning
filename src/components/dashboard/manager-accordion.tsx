'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatUSD, getTrafficLight, pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import { useAppStore } from '@/lib/store';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { isTrialManager } from '@/lib/trial-manager';
import type { ManagerRegionData } from '@/lib/types';

interface Props {
  manager: ManagerRegionData;
  calcPct: number;
  asOfDate: Date;
  /** Drill-down у ManagerDashboard цього менеджера. */
  onDrillDown: () => void;
  /**
   * Click на BrandRow всередині розгорнутої картки → відкрити планування
   * для конкретної пари (manager × brand). Якщо не передано — рядки бренду
   * залишаються інформативними без кліку.
   */
  onPlanBrand?: (segmentCode: string) => void;
  /**
   * Зведення planning по логіну (з parent /api/planning/aggregate).
   * Потрібно для «заплановане vs мин. факт» dyn та правильного % виконання.
   * Без нього fallback на totalFact-prevFact (старий неправильний).
   */
  planByLogin?: Record<string, Record<string, { forecast: number; gap: number; finalized: boolean }>> | null;
}

function initials(fullName: string, login: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || '').join('') || login[0]?.toUpperCase() || '?';
  }
  return login[0]?.toUpperCase() || '?';
}

/**
 * Картка менеджера на РМ-дашборді з expand → 9 BrandRow всередині.
 * Drill-down у ManagerDashboard — окрема ChevronRight кнопка справа з stopPropagation.
 *
 * Дзеркало RegionAccordion але рівнем нижче (manager × segment замість region × segment).
 */
export function ManagerAccordion({ manager, calcPct, asOfDate, onDrillDown, onPlanBrand, planByLogin }: Props) {
  const [expanded, setExpanded] = useState(false);
  // Lazy: тільки коли expanded — тягнемо план цього менеджера з Supabase.
  // Потрібно для синьої насічки «Запланований» на progress bar кожного бренду.
  // Якщо parent передав planByLogin (rm-dashboard / director-dashboard) — викоремо
  // звідти, додатковий fetch не робимо.
  const { currentPeriod } = useAppStore();
  const skipLazyFetch = !!planByLogin;
  const { data: planAgg } = usePlanningAggregate(
    currentPeriod.id,
    !skipLazyFetch && expanded && manager.login ? [manager.login] : null,
    currentPeriod.month,
  );
  const effectiveByLogin = planByLogin ?? planAgg?.byLogin ?? null;
  const totalPlan = manager.segments.reduce((a, s) => a + s.planAmount, 0);
  const totalFact = manager.segments.reduce((a, s) => a + s.factAmount, 0);
  const totalPrevFact = manager.totalPrevMonthFact ?? 0;

  // Trial-новачок: 1С виставила $1 sentinel на КОЖЕН сегмент.
  // Без обробки: $1143 / $9 = 12702% — Кравченко К. червоніє у списку.
  const isTrial = isTrialManager(manager.segments.map(s => s.planAmount).filter(p => p > 0));
  const pct = isTrial ? 0 : pctOf(totalFact, totalPlan);
  const tl = getTrafficLight(pct, calcPct);
  const dev = pct - calcPct;

  // Заплановане (ТІЛЬКИ finalized forecast + gap) — для порівняння vs мин. факт.
  // Без planByLogin → fallback на totalFact (старий патерн, не показуємо стрілку).
  const managerSegs = effectiveByLogin?.[manager.login] ?? {};
  const totalExpected = Object.values(managerSegs).reduce((acc, s) => {
    if (!s.finalized) return acc;
    return acc + (s.forecast ?? 0) + (s.gap ?? 0);
  }, 0);
  const expectedForCompare = totalExpected > 0 ? totalExpected : totalFact;
  const dynAmount = expectedForCompare - totalPrevFact;
  const dynBetter = dynAmount >= 0;

  // % від плану що заплановано (тільки finalized). Trial → не показуємо.
  const expectedPct = !isTrial && totalPlan > 0 ? (totalExpected / totalPlan) * 100 : 0;
  const hasExpected = !isTrial && totalExpected > 0;

  return (
    <div className="glass-card row-accent overflow-hidden transition-all hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]">
      {/* === DESKTOP === */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="hidden md:flex w-full items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/40 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/50"
      >
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emet-50 flex items-center justify-center text-[12px] font-bold text-emet-blue shrink-0">
            {initials(manager.name, manager.login)}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold truncate">{manager.name || manager.login}</p>
            <p className="text-[11px] text-muted-foreground truncate">{manager.login}</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-start gap-4 justify-end shrink-0 min-h-[56px]">
          {/* Фіксовані min-width на колонках для вертикального вирівнювання різних рядів. */}
          <div className="text-right min-w-[180px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Факт / План</p>
            <p className="text-[14px] font-bold font-mono leading-none mt-1.5 whitespace-nowrap">
              <span className="amount">{formatUSD(totalFact)}</span>
              <span className="text-muted-foreground/50 font-normal"> / </span>
              <span className="amount text-muted-foreground/70">{formatUSD(totalPlan)}</span>
            </p>
          </div>
          <div className="text-right min-w-[130px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Заплановано</p>
            {hasExpected ? (
              <>
                <p className="text-[14px] font-bold font-mono leading-none mt-1.5 whitespace-nowrap">
                  <span className="amount text-emet-blue">{formatUSD(totalExpected)}</span>
                </p>
                <p className="text-[11px] font-bold leading-none mt-1 text-emet-blue">
                  {expectedPct.toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground/40 leading-none mt-1.5">—</p>
            )}
          </div>
          <div className="text-right min-w-[120px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Мин. міс.</p>
            {totalPrevFact > 0 ? (
              <>
                <p className="text-[12px] font-bold leading-none mt-1.5 whitespace-nowrap">
                  <span className="amount">{formatUSD(totalPrevFact)}</span>
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
            {isTrial ? (
              <>
                <div className="w-14 h-2 rounded-full bg-slate-100" />
                <span className="text-[11px] font-bold leading-none text-slate-500">—</span>
              </>
            ) : (
              <>
                <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= calcPct ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <span className={`text-[11px] font-bold leading-none ${tl.color}`}>{pct.toFixed(1)}%</span>
                <span className={`text-[10px] font-bold leading-none ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
                </span>
              </>
            )}
          </div>
          <div className="w-[100px]">
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            {isTrial ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-slate-400/12 border border-slate-300/50 text-slate-600 backdrop-blur-sm" title="1С виставила $1 sentinel — менеджер на випробувальному">Новачок</span>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
            )}
          </div>
          <div>
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Перейти у дашборд менеджера"
            className="mt-[16px] p-1.5 rounded-lg hover:bg-emet-50 text-muted-foreground/40 hover:text-emet-blue transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </button>

      {/* === MOBILE === */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex w-full items-start gap-2.5 px-3 py-3 cursor-pointer active:bg-[#f4f7fb] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/50"
        >
          <div className="w-9 h-9 rounded-xl bg-emet-50 flex items-center justify-center text-[11px] font-bold text-emet-blue shrink-0 mt-0.5">
            {initials(manager.name, manager.login)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[14px] font-bold truncate flex-1">{manager.name || manager.login}</p>
              {isTrial ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap bg-slate-400/12 border border-slate-300/50 text-slate-600 backdrop-blur-sm">Новачок</span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              <button
                onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
                className="p-1 rounded-lg text-muted-foreground/40 hover:text-emet-blue hover:bg-emet-50 transition-colors cursor-pointer shrink-0"
                title="Дашборд менеджера"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-1.5 text-[11px]">
              <span className="text-muted-foreground truncate">{manager.login}</span>
              {!isTrial && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className={`font-bold ${tl.color}`}>{pct.toFixed(1)}%</span>
                  <span className={`font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
                  </span>
                </>
              )}
            </div>
            {!isTrial && (
              <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mb-2">
                <div className={`h-full rounded-full ${pct >= calcPct ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Факт <span className="font-bold text-foreground amount">{formatUSD(totalFact)}</span>
                <span className="text-muted-foreground/50"> / </span>
                <span className="amount text-muted-foreground/70">{formatUSD(totalPlan)}</span>
              </span>
              {totalPrevFact > 0 && (
                <span className={`flex items-center gap-0.5 font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                </span>
              )}
            </div>
            {hasExpected && (
              <div className="text-[11px] mt-1">
                <span className="text-muted-foreground">Запл. </span>
                <span className="font-bold text-emet-blue amount">{formatUSD(totalExpected)}</span>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-bold text-emet-blue">{expectedPct.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Розгорнутий список 9 BrandRow — клік на бренд → планування manager × brand */}
      {expanded && (
        <div className="px-3 md:px-5 pb-4 space-y-1.5 bg-white/30 backdrop-blur-md border-t border-white/40">
          {manager.segments.map(seg => {
            // ТІЛЬКИ фіналізовані плани цього менеджера у цьому бренді.
            const segPlan = planAgg?.byLogin[manager.login]?.[seg.segmentCode];
            const isFinalized = !!segPlan?.finalized;
            const managerForecast = isFinalized ? (segPlan?.forecast ?? 0) : 0;
            const managerGap = isFinalized ? (segPlan?.gap ?? 0) : 0;
            // hasManagerPlan тільки після того як planAgg догрузилось.
            // Уникає blink «Запл.: 0%» → реальний % коли SWR fetch-ить.
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
                prevMonthFactPercent={pctOf(seg.prevMonthFactAmount ?? 0, seg.prevMonthPlanAmount ?? 0)}
                onClick={onPlanBrand ? () => onPlanBrand(seg.segmentCode) : undefined}
                readOnly={!onPlanBrand}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
