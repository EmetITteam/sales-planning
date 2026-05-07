'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import { BrandRow } from './brand-row';
import type { RegionAggregate } from '@/lib/region-aggregates';

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
  }>;
}

interface Props {
  brand: BrandWithRegions;
  calcPct: number;
  asOfDate: Date;
  /** Click на регіоні всередині — drill-down у RMDashboard цього регіону. */
  onRegionClick: (regionCode: string) => void;
}

/**
 * Бренд як header + expand → список регіонів цього бренду (як BrandRow).
 * Регіони клікабельні → drill-down у RMDashboard.
 *
 * Cross-grouping `brand × region` — друга проекція даних (перша — RegionAccordion
 * `region × brand`). Дозволяє Sales Director швидко побачити «Petaran просідає
 * у Києві, але виконує план в Одесі».
 */
export function BrandRegionGroup({ brand, calcPct, asOfDate, onRegionClick }: Props) {
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
            <ChevronDown className="inline h-3 w-3 mr-1" />Регіони
          </p>
          {brand.regions.map(r => (
            <BrandRow
              key={r.regionCode}
              segmentName={r.regionName}
              planAmount={r.plan}
              factAmount={r.fact}
              calcPct={calcPct}
              asOfDate={asOfDate}
              prevMonthFactAmount={r.prevFact}
              prevMonthFactPercent={pctOf(r.prevFact, r.prevPlan)}
              onClick={() => onRegionClick(r.regionCode)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Helper: побудувати pivot brand × region з масиву RegionAggregate. */
export function pivotBrandsByRegion(regions: RegionAggregate[]): BrandWithRegions[] {
  if (regions.length === 0) return [];
  const segmentCodes = regions[0].segments.map(s => s.segmentCode);

  return segmentCodes.map(segCode => {
    const segName = regions[0].segments.find(s => s.segmentCode === segCode)?.segmentName ?? segCode;
    const perRegion = regions.map(r => {
      const seg = r.segments.find(s => s.segmentCode === segCode);
      return {
        regionCode: r.regionCode,
        regionName: r.regionName,
        plan: seg?.planAmount ?? 0,
        fact: seg?.factAmount ?? 0,
        prevFact: seg?.prevMonthFactAmount ?? 0,
        prevPlan: seg?.prevMonthPlanAmount ?? 0,
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
