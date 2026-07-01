'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import { CategoryStatsTable } from './category-stats-table';
import { SEGMENTS } from '@/lib/mock-data';
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
  planByLogin?: Record<string, Record<string, { forecast: number; gap: number; finalized: boolean }>> | null;
  /** Set-коди брендів у режимі «Динамічний план» (plan=fact дзеркально). */
  dynamicSegments?: Set<string>;
}

/**
 * Бренд як header + expand → список менеджерів цього бренду (як BrandRow).
 * Менеджери клікабельні → drill-down у ManagerDashboard.
 *
 * Cross-grouping `brand × manager` — дзеркало BrandRegionGroup на РМ-дашборді.
 */
export function BrandManagerGroup({ brand, calcPct, asOfDate, onManagerClick, planCategoriesForBrand, factCategoriesForBrand, unplannedForBrand, categoriesLoading, planByLogin, dynamicSegments }: Props) {
  const [expanded, setExpanded] = useState(false);
  const totalPrevPct = pctOf(brand.totalPrevMonthFact, brand.totalPrevMonthPlan);
  const isDynamicPlan = !!dynamicSegments?.has(brand.segmentCode);

  // «Запл. %» для бренду в цілому = Σ finalized forecast+gap по менеджерам цього
  // бренду. ТІЛЬКИ фіналізовані плани (не чернетки).
  let brandPlannedSum = 0;
  if (planByLogin) {
    for (const m of brand.managers) {
      const mp = planByLogin[m.login]?.[brand.segmentCode];
      if (mp?.finalized) brandPlannedSum += mp.forecast + mp.gap;
    }
  }
  const brandExpectedPct = brand.totalPlan > 0 && planByLogin
    ? (brandPlannedSum / brand.totalPlan) * 100
    : 0;
  const hasBrandPlan = !!planByLogin && brand.totalPlan > 0;

  return (
    <div className="glass-card overflow-hidden">
      <BrandRow
        segmentName={brand.segmentName}
        planAmount={isDynamicPlan ? brand.totalFact : brand.totalPlan}
        factAmount={brand.totalFact}
        calcPct={calcPct}
        asOfDate={asOfDate}
        prevMonthFactAmount={brand.totalPrevMonthFact}
        prevMonthFactPercent={totalPrevPct}
        expectedPercent={isDynamicPlan ? 100 : brandExpectedPct}
        expectedAmount={isDynamicPlan ? brand.totalFact : brandPlannedSum}
        hasManagerPlan={isDynamicPlan ? false : hasBrandPlan}
        isDynamicPlan={isDynamicPlan}
        onClick={() => setExpanded(!expanded)}
        expandable
        expanded={expanded}
      />
      {expanded && (
        <div className="px-3 md:px-5 py-3 space-y-3 bg-white/30 backdrop-blur-md border-t border-white/40">
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
            // Per-manager «Запл. %» — ТІЛЬКИ фіналізовані плани цього менеджера
            // по цьому бренду. Якщо у нього лише чернетка — 0% (ще не зафіксував).
            const mgrPlan = planByLogin?.[m.login]?.[brand.segmentCode];
            const isFinalized = !!mgrPlan?.finalized;
            const mgrForecast = isFinalized ? (mgrPlan?.forecast ?? 0) : 0;
            const mgrGap = isFinalized ? (mgrPlan?.gap ?? 0) : 0;
            const mgrExpectedPct = m.plan > 0
              ? ((mgrForecast + mgrGap) / m.plan) * 100
              : 0;
            const hasMgrPlan = !!planByLogin && m.plan > 0;
            return (
              <BrandRow
                key={m.login}
                segmentName={m.name || m.login}
                planAmount={isDynamicPlan ? m.fact : m.plan}
                factAmount={m.fact}
                calcPct={calcPct}
                asOfDate={asOfDate}
                prevMonthFactAmount={m.prevFact}
                prevMonthFactPercent={pctOf(m.prevFact, m.prevPlan)}
                expectedPercent={isDynamicPlan ? 100 : mgrExpectedPct}
                expectedAmount={isDynamicPlan ? m.fact : mgrForecast + mgrGap}
                hasManagerPlan={isDynamicPlan ? false : hasMgrPlan}
                isDynamicPlan={isDynamicPlan}
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
  // Сортуємо у канонічному порядку SEGMENTS (Petaran, Ellanse, EXOXE, ESSE,
  // Neuramis, Neuronox, Vitaran, IUSE, Інші ТМ) — інакше Map insertion order
  // залежить від того менеджера якого опрацювали першим, у різних регіонах
  // вийде різний sort.
  const orderIndex = new Map(SEGMENTS.map((s, i) => [s.code, i]));
  const segCodes = Array.from(segMap.keys()).sort((a, b) => {
    const ia = orderIndex.get(a) ?? 999;
    const ib = orderIndex.get(b) ?? 999;
    return ia - ib;
  });

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
