'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import { CategoryStatsTable } from './category-stats-table';
import type { ManagerRegionData } from '@/lib/types';
import type { CategoryStat, PlanCategoryKey } from '@/lib/use-planning-aggregate';
import type { RegionStatsCategoryStat, RegionStatsCategory } from '@/lib/use-region-stats';

interface BrandWithManagers {
  segmentCode: string;
  segmentName: string;
  totalPlan: number;
  totalFact: number;
  totalPrevMonthFact: number;
  totalPrevMonthPlan: number;
  managers: Array<{
    login: string;
    name: string;
    plan: number;
    fact: number;
    prevFact: number;
    prevPlan: number;
  }>;
}

interface Props {
  brand: BrandWithManagers;
  calcPct: number;
  asOfDate: Date;
  /**
   * Click на менеджеру всередині — drill-down у PlanningForm для цього (manager × brand).
   * Логіка: ми вже у контексті конкретного бренду, тому йдемо одразу у форму планування
   * саме цього бренду для цього менеджера, а не у весь manager dashboard.
   */
  onManagerClick: (login: string, segmentCode: string) => void;
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
   * Використовуємо щоб рахувати real «Запл. %» per (manager, brand) замість
   * mock-формули у brand-row.
   */
  planByLogin?: Record<string, Record<string, { forecast: number; gap: number }>> | null;
}

/**
 * Бренд як header + expand → список менеджерів цього бренду (як BrandRow).
 * Менеджери клікабельні → drill-down у ManagerDashboard.
 *
 * Cross-grouping `brand × manager` — дзеркало BrandRegionGroup на РМ-дашборді.
 */
export function BrandManagerGroup({ brand, calcPct, asOfDate, onManagerClick, planCategoriesForBrand, factCategoriesForBrand, unplannedForBrand, categoriesLoading, planByLogin }: Props) {
  const [expanded, setExpanded] = useState(false);
  const totalPrevPct = pctOf(brand.totalPrevMonthFact, brand.totalPrevMonthPlan);

  // «Запл. %» для бренду в цілому = Σ planSum (всі категорії plan) / brand.totalPlan.
  // hasBrandPlan тільки коли planCategoriesForBrand уже догрузився (без blink
  // 0% → real коли SWR fetch-ить).
  const brandPlannedSum = planCategoriesForBrand
    ? planCategoriesForBrand.active.plannedSum
      + planCategoriesForBrand.sleeping.plannedSum
      + planCategoriesForBrand.lost.plannedSum
      + planCategoriesForBrand.none.plannedSum
      + planCategoriesForBrand.new.plannedSum
    : 0;
  const brandExpectedPct = brand.totalPlan > 0 && planCategoriesForBrand
    ? (brandPlannedSum / brand.totalPlan) * 100
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
        expectedAmount={brandPlannedSum}
        hasManagerPlan={hasBrandPlan}
        onClick={() => setExpanded(!expanded)}
        expandable
        expanded={expanded}
      />
      {expanded && (
        <div className="px-3 md:px-5 py-3 space-y-3 bg-[#fafbfe] border-t border-[#f0f2f8]">
          {/* Розклад по категоріях клієнтів — перед списком менеджерів */}
          {(planCategoriesForBrand || factCategoriesForBrand || categoriesLoading) && (
            <CategoryStatsTable
              plan={planCategoriesForBrand ?? null}
              fact={factCategoriesForBrand ?? null}
              unplanned={unplannedForBrand ?? null}
              title={`${brand.segmentName} · ${brand.managers.length} ${brand.managers.length === 1 ? 'менеджер' : 'менеджерів'}`}
              loading={!!categoriesLoading && !factCategoriesForBrand}
            />
          )}
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 ml-1">
            <ChevronDown className="inline h-3 w-3 mr-1" />Менеджери
          </p>
          {brand.managers.map(m => {
            // Per-manager «Запл. %» — тільки коли planByLogin догрузився.
            const mgrPlan = planByLogin?.[m.login]?.[brand.segmentCode];
            const mgrForecast = mgrPlan?.forecast ?? 0;
            const mgrGap = mgrPlan?.gap ?? 0;
            const mgrExpectedPct = m.plan > 0
              ? ((mgrForecast + mgrGap) / m.plan) * 100
              : 0;
            const hasMgrPlan = !!planByLogin && m.plan > 0;
            return (
              <BrandRow
                key={m.login}
                segmentName={m.name || m.login}
                planAmount={m.plan}
                factAmount={m.fact}
                calcPct={calcPct}
                asOfDate={asOfDate}
                prevMonthFactAmount={m.prevFact}
                prevMonthFactPercent={pctOf(m.prevFact, m.prevPlan)}
                expectedPercent={mgrExpectedPct}
                expectedAmount={mgrForecast + mgrGap}
                hasManagerPlan={hasMgrPlan}
                onClick={() => onManagerClick(m.login, brand.segmentCode)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Helper: побудувати pivot brand × manager з ManagerRegionData[]. */
export function pivotBrandsByManager(managers: ManagerRegionData[]): BrandWithManagers[] {
  if (managers.length === 0) return [];
  // Знаходимо унікальні segments з усіх менеджерів (на випадок різного набору).
  const segMap = new Map<string, string>();
  for (const m of managers) {
    for (const s of m.segments) {
      if (!segMap.has(s.segmentCode)) segMap.set(s.segmentCode, s.segmentName);
    }
  }
  const segCodes = Array.from(segMap.keys());

  return segCodes.map(segCode => {
    const segName = segMap.get(segCode) ?? segCode;
    const perManager = managers.map(m => {
      const seg = m.segments.find(s => s.segmentCode === segCode);
      return {
        login: m.login,
        name: m.name,
        plan: seg?.planAmount ?? 0,
        fact: seg?.factAmount ?? 0,
        prevFact: seg?.prevMonthFactAmount ?? 0,
        prevPlan: seg?.prevMonthPlanAmount ?? 0,
      };
    });
    return {
      segmentCode: segCode,
      segmentName: segName,
      totalPlan: perManager.reduce((a, x) => a + x.plan, 0),
      totalFact: perManager.reduce((a, x) => a + x.fact, 0),
      totalPrevMonthFact: perManager.reduce((a, x) => a + x.prevFact, 0),
      totalPrevMonthPlan: perManager.reduce((a, x) => a + x.prevPlan, 0),
      managers: perManager,
    };
  });
}
