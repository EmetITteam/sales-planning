'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import type { ManagerRegionData } from '@/lib/types';

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
  /** Click на менеджеру всередині — drill-down у ManagerDashboard. */
  onManagerClick: (login: string) => void;
}

/**
 * Бренд як header + expand → список менеджерів цього бренду (як BrandRow).
 * Менеджери клікабельні → drill-down у ManagerDashboard.
 *
 * Cross-grouping `brand × manager` — дзеркало BrandRegionGroup на РМ-дашборді.
 */
export function BrandManagerGroup({ brand, calcPct, asOfDate, onManagerClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const totalPrevPct = pctOf(brand.totalPrevMonthFact, brand.totalPrevMonthPlan);

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
        onClick={() => setExpanded(!expanded)}
        expandable
        expanded={expanded}
      />
      {expanded && (
        <div className="px-3 md:px-5 py-3 space-y-1.5 bg-[#fafbfe] border-t border-[#f0f2f8]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 ml-1">
            <ChevronDown className="inline h-3 w-3 mr-1" />Менеджери
          </p>
          {brand.managers.map(m => (
            <BrandRow
              key={m.login}
              segmentName={m.name || m.login}
              planAmount={m.plan}
              factAmount={m.fact}
              calcPct={calcPct}
              asOfDate={asOfDate}
              prevMonthFactAmount={m.prevFact}
              prevMonthFactPercent={pctOf(m.prevFact, m.prevPlan)}
              onClick={() => onManagerClick(m.login)}
            />
          ))}
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
