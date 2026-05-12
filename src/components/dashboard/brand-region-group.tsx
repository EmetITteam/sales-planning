'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import { CategoryStatsTable } from './category-stats-table';
import type { RegionAggregate } from '@/lib/region-aggregates';
import type { CategoryStat, PlanCategoryKey } from '@/lib/use-planning-aggregate';
import type { RegionStatsCategoryStat, RegionStatsCategory } from '@/lib/use-region-stats';

interface BrandWithRegions {
  segmentCode: string;
  segmentName: string;
  totalPlan: number;
  totalFact: number;
  totalPrevMonthFact: number;
  totalPrevMonthPlan: number;
  /** План/факт цього бренду по кожному регіону. */
  regions: Array<{
    regionCode: string;
    regionName: string;
    plan: number;
    fact: number;
    prevFact: number;
    prevPlan: number;
    /** Менеджери регіону з їх внеском у цей бренд (для додаткового рівня drill-down). */
    managers: Array<{
      login: string;
      name: string;
      plan: number;
      fact: number;
    }>;
  }>;
}

interface Props {
  brand: BrandWithRegions;
  calcPct: number;
  asOfDate: Date;
  /** Click на регіоні всередині — drill-down у RMDashboard цього регіону. */
  onRegionClick: (regionCode: string) => void;
  /**
   * Click на менеджеру всередині regional sub-list — drill-down у PlanningForm
   * для (manager × brand). Якщо не передано — менеджери НЕ показуються.
   */
  onManagerClick?: (login: string, segmentCode: string) => void;
  /** Plan-частина для цього бренду (з /api/planning/aggregate, segment-зріз). */
  planCategoriesForBrand?: Record<PlanCategoryKey, CategoryStat> | null;
  /** Fact-частина для цього бренду (з /api/onec/region-stats, segment-зріз). */
  factCategoriesForBrand?: Record<RegionStatsCategory, RegionStatsCategoryStat> | null;
  /** «Незаплановані» для цього бренду (купили без плану). */
  unplannedForBrand?: { factCount: number; factSum: number } | null;
  /** Loading-стан для CategoryStatsTable. */
  categoriesLoading?: boolean;
  /**
   * Per-manager × segment breakdown від /api/planning/aggregate.
   * Використовуємо щоб рахувати real «Запл. %» per (region, brand) sum-over-managers.
   */
  planByLogin?: Record<string, Record<string, { forecast: number; gap: number }>> | null;
}

/**
 * Бренд як header + expand → список регіонів цього бренду (як BrandRow).
 * Регіони клікабельні → drill-down у RMDashboard.
 *
 * Cross-grouping `brand × region` — друга проекція даних (перша — RegionAccordion
 * `region × brand`). Дозволяє Sales Director швидко побачити «Petaran просідає
 * у Києві, але виконує план в Одесі».
 */
export function BrandRegionGroup({ brand, calcPct, asOfDate, onRegionClick, onManagerClick, planCategoriesForBrand, factCategoriesForBrand, unplannedForBrand, categoriesLoading, planByLogin }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const totalPrevPct = pctOf(brand.totalPrevMonthFact, brand.totalPrevMonthPlan);

  // «Запл. %» для бренду в цілому: Σ planSum / brand.totalPlan.
  // hasBrandPlan тільки після того як planCategoriesForBrand догрузився.
  const brandExpectedPct = brand.totalPlan > 0 && planCategoriesForBrand
    ? ((planCategoriesForBrand.active.plannedSum
        + planCategoriesForBrand.sleeping.plannedSum
        + planCategoriesForBrand.lost.plannedSum
        + planCategoriesForBrand.none.plannedSum
        + planCategoriesForBrand.new.plannedSum) / brand.totalPlan) * 100
    : 0;
  const hasBrandPlan = !!planCategoriesForBrand && brand.totalPlan > 0;

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <BrandRow
        segmentName={brand.segmentName}
        planAmount={brand.totalPlan}
        factAmount={brand.totalFact}
        calcPct={calcPct}
        asOfDate={asOfDate}
        prevMonthFactAmount={brand.totalPrevMonthFact}
        prevMonthFactPercent={totalPrevPct}
        expectedPercent={brandExpectedPct}
        hasManagerPlan={hasBrandPlan}
        onClick={() => setExpanded(!expanded)}
        expandable
        expanded={expanded}
      />
      {expanded && (
        <div className="px-3 md:px-5 py-3 space-y-3 bg-[#fafbfe] border-t border-[#f0f2f8]">
          {/* Розклад по категоріях клієнтів — перед списком регіонів */}
          {(planCategoriesForBrand || factCategoriesForBrand || categoriesLoading) && (
            <CategoryStatsTable
              plan={planCategoriesForBrand ?? null}
              fact={factCategoriesForBrand ?? null}
              unplanned={unplannedForBrand ?? null}
              title={`${brand.segmentName} · ${brand.regions.length} ${brand.regions.length === 1 ? 'регіон' : 'регіонів'}`}
              loading={!!categoriesLoading && !factCategoriesForBrand}
            />
          )}
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 ml-1">
            <ChevronDown className="inline h-3 w-3 mr-1" />Регіони
          </p>
          {brand.regions.map(r => {
            const isRegionExpanded = expandedRegion === r.regionCode;
            // Per-region «Запл. %» = Σ менеджерів регіону (forecast+gap) / r.plan.
            // hasRegionPlan тільки коли planByLogin догрузився (без blink).
            let regionForecastPlusGap = 0;
            if (planByLogin) {
              for (const m of r.managers) {
                const mp = planByLogin[m.login]?.[brand.segmentCode];
                if (mp) regionForecastPlusGap += mp.forecast + mp.gap;
              }
            }
            const regionExpectedPct = r.plan > 0
              ? (regionForecastPlusGap / r.plan) * 100
              : 0;
            const hasRegionPlan = !!planByLogin && r.plan > 0;
            return (
              <div key={r.regionCode}>
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <BrandRow
                      segmentName={r.regionName}
                      planAmount={r.plan}
                      factAmount={r.fact}
                      calcPct={calcPct}
                      asOfDate={asOfDate}
                      prevMonthFactAmount={r.prevFact}
                      prevMonthFactPercent={pctOf(r.prevFact, r.prevPlan)}
                      expectedPercent={regionExpectedPct}
                      hasManagerPlan={hasRegionPlan}
                      onClick={() => onRegionClick(r.regionCode)}
                    />
                  </div>
                  {/* Маленький button «розкрити менеджерів» — окремо від клік-у на регіон */}
                  {onManagerClick && r.managers.length > 0 && (
                    <button
                      onClick={() => setExpandedRegion(isRegionExpanded ? null : r.regionCode)}
                      className="p-2 rounded-lg hover:bg-[#e8f4fc] text-muted-foreground/40 hover:text-[#066aab] transition-colors cursor-pointer shrink-0"
                      title={isRegionExpanded ? 'Сховати менеджерів' : 'Показати менеджерів регіону'}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isRegionExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                {isRegionExpanded && onManagerClick && (
                  <div className="ml-6 mt-1 mb-2 space-y-1">
                    {r.managers.map(m => (
                      <button
                        key={m.login}
                        onClick={() => onManagerClick(m.login, brand.segmentCode)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white hover:bg-[#e8f4fc] border border-[#f0f2f8] text-[12px] text-left transition-colors cursor-pointer"
                      >
                        <span className="font-medium truncate flex-1">{m.name || m.login}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          <span className="text-emerald-600 font-bold">${m.fact.toLocaleString('en-US')}</span>
                          <span className="mx-1">/</span>
                          <span>${m.plan.toLocaleString('en-US')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Helper: побудувати pivot brand × region з масиву RegionAggregate + raw RegionData.
 * Raw регіони потрібні щоб дістатись до managers[].segments[] для per-manager
 * підсумків бренду.
 */
export function pivotBrandsByRegion(
  regionAggs: RegionAggregate[],
  rawRegions: import('@/lib/types').RegionData[],
): BrandWithRegions[] {
  if (regionAggs.length === 0) return [];
  const segmentCodes = regionAggs[0].segments.map(s => s.segmentCode);

  return segmentCodes.map(segCode => {
    const segName = regionAggs[0].segments.find(s => s.segmentCode === segCode)?.segmentName ?? segCode;
    const perRegion = regionAggs.map((r, idx) => {
      const seg = r.segments.find(s => s.segmentCode === segCode);
      const raw = rawRegions[idx];
      const managers = raw
        ? raw.managers.map(m => {
            const mSeg = m.segments.find(s => s.segmentCode === segCode);
            return {
              login: m.login,
              name: m.name,
              plan: mSeg?.planAmount ?? 0,
              fact: mSeg?.factAmount ?? 0,
            };
          }).filter(m => m.plan > 0 || m.fact > 0)
          : [];
      return {
        regionCode: r.regionCode,
        regionName: r.regionName,
        plan: seg?.planAmount ?? 0,
        fact: seg?.factAmount ?? 0,
        prevFact: seg?.prevMonthFactAmount ?? 0,
        prevPlan: seg?.prevMonthPlanAmount ?? 0,
        managers,
      };
    });
    return {
      segmentCode: segCode,
      segmentName: segName,
      totalPlan: perRegion.reduce((a, x) => a + x.plan, 0),
      totalFact: perRegion.reduce((a, x) => a + x.fact, 0),
      totalPrevMonthFact: perRegion.reduce((a, x) => a + x.prevFact, 0),
      totalPrevMonthPlan: perRegion.reduce((a, x) => a + x.prevPlan, 0),
      regions: perRegion,
    };
  });
}
