'use client';

import { useState } from 'react';
import { formatUSD, formatPct, formatDateShort, getTrafficLight } from '@/lib/format';
import { getMonthProgressPct } from '@/lib/working-days';
import { MOCK_ALL_REGIONS, SEGMENTS, getFactScaleRatio } from '@/lib/mock-data';
import { useAppStore } from '@/lib/store';
import { RMDashboard } from './rm-dashboard';
import { Target, DollarSign, TrendingUp, TrendingDown, MapPin, Users, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

type DirView = 'dashboard' | 'region';

export function DirectorDashboard() {
  const [view, setView] = useState<DirView>('dashboard');
  const [selectedRegion, setSelectedRegion] = useState('');
  const { currentPeriod, liveMode } = useAppStore();
  const asOfDate = liveMode ? new Date() : new Date(currentPeriod.weekEnd);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);
  const factScale = getFactScaleRatio(asOfDate);

  const regions = MOCK_ALL_REGIONS;

  const calcPct = getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);

  const regionSummaries = regions.map(region => {
    let totalPlan = 0, totalFact = 0, totalPrevFact = 0, totalPrevPlan = 0;
    const segTotals: Record<string, { plan: number; fact: number; prevFact: number; prevPlan: number }> = {};
    SEGMENTS.forEach(seg => { segTotals[seg.code] = { plan: 0, fact: 0, prevFact: 0, prevPlan: 0 }; });
    region.managers.forEach(m => {
      m.segments.forEach(s => {
        // Масштабуємо факт пропорційно даті зрізу — імітація getSalesFact(asOfDate)
        const factAmount = Math.round(s.factAmount * factScale);
        const prevMonthFactAmount = Math.round((s.prevMonthFactAmount ?? 0) * factScale);
        totalPlan += s.planAmount;
        totalFact += factAmount;
        totalPrevFact += prevMonthFactAmount;
        totalPrevPlan += s.prevMonthPlanAmount ?? 0;
        if (segTotals[s.segmentCode]) {
          segTotals[s.segmentCode].plan += s.planAmount;
          segTotals[s.segmentCode].fact += factAmount;
          segTotals[s.segmentCode].prevFact += prevMonthFactAmount;
          segTotals[s.segmentCode].prevPlan += s.prevMonthPlanAmount ?? 0;
        }
      });
    });
    return {
      ...region, totalPlan, totalFact,
      totalPrevFact, totalPrevPlan,
      pct: totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0,
      prevPct: totalPrevPlan > 0 ? (totalPrevFact / totalPrevPlan) * 100 : 0,
      segTotals,
    };
  });

  const grandPlan = regionSummaries.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionSummaries.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = grandPlan > 0 ? (grandFact / grandPlan) * 100 : 0;
  const grandPrevFact = regionSummaries.reduce((s, r) => s + r.totalPrevFact, 0);
  const grandPrevPlan = regionSummaries.reduce((s, r) => s + r.totalPrevPlan, 0);
  const grandPrevPct = grandPrevPlan > 0 ? (grandPrevFact / grandPrevPlan) * 100 : 0;
  const totalManagers = regions.reduce((s, r) => s + r.managers.length, 0);

  // Drill-down в регіон — показуємо дашборд РМ
  if (view === 'region') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Всі регіони
        </button>
        <RMDashboard regionCode={selectedRegion} />
      </div>
    );
  }

  const segGrandTotals = SEGMENTS.map(seg => {
    let plan = 0, fact = 0, prevFact = 0, prevPlan = 0;
    regionSummaries.forEach(r => {
      plan += r.segTotals[seg.code]?.plan ?? 0;
      fact += r.segTotals[seg.code]?.fact ?? 0;
      prevFact += r.segTotals[seg.code]?.prevFact ?? 0;
      prevPlan += r.segTotals[seg.code]?.prevPlan ?? 0;
    });
    const pct = plan > 0 ? (fact / plan) * 100 : 0;
    return {
      code: seg.code, name: seg.name,
      plan, fact, pct,
      prevFact, prevPlan,
      deviation: pct - calcPct,
    };
  });

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold">Зведена по компанії</h2>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg"><Target className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium mt-3">Загальний план</p>
          <p className="text-2xl font-extrabold tracking-tight amount">{formatUSD(grandPlan)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg"><DollarSign className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium mt-3">Факт</p>
          <p className="text-2xl font-extrabold tracking-tight amount">{formatUSD(grandFact)}</p>
          {grandPrevFact > 0 && (() => {
            const dyn = grandFact - grandPrevFact;
            const dynPct = grandPct - grandPrevPct;
            const better = dyn >= 0;
            const Arrow = better ? TrendingUp : TrendingDown;
            return (
              <p className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                <Arrow className="h-3 w-3" /> vs мин. міс.: <span className="amount">{better ? '+' : ''}{formatUSD(dyn)}</span>
                <span>({better ? '+' : ''}{dynPct.toFixed(1)}%)</span>
              </p>
            );
          })()}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${grandPct >= calcPct ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'} text-white shadow-lg`}>
            {grandPct >= calcPct ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <p className="text-[12px] text-muted-foreground font-medium mt-3">Виконання</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold tracking-tight">{grandPct.toFixed(1)}%</p>
            <span className={`text-[12px] font-bold ${grandPct >= calcPct ? 'text-emerald-600' : 'text-rose-600'}`}>
              {grandPct - calcPct >= 0 ? '+' : ''}{(grandPct - calcPct).toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Норма на {asOfLabel}: <span className="font-semibold text-foreground">{formatPct(calcPct)}</span></p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg"><MapPin className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium mt-3">Регіонів</p>
          <p className="text-2xl font-extrabold tracking-tight">{regions.length}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg"><Users className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium mt-3">Менеджерів</p>
          <p className="text-2xl font-extrabold tracking-tight">{totalManagers}</p>
        </div>
      </div>

      {/* Region cards — клікабельні */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Регіони</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {regionSummaries.map(region => {
            const tl = getTrafficLight(region.pct, calcPct);
            const regionDeviation = region.pct - calcPct;
            // Усі бренди регіону у таблиці (не топ-4 чипи)
            const allSegs = SEGMENTS.map(seg => ({
              ...seg,
              fact: region.segTotals[seg.code]?.fact ?? 0,
              plan: region.segTotals[seg.code]?.plan ?? 0,
              prevFact: region.segTotals[seg.code]?.prevFact ?? 0,
              prevPlan: region.segTotals[seg.code]?.prevPlan ?? 0,
            }));

            return (
              <div key={region.regionCode}
                onClick={() => { setSelectedRegion(region.regionCode); setView('region'); }}
                className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer group"
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-[#066aab]" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold">{region.regionName}</p>
                      <p className="text-[11px] text-muted-foreground">{region.managers.length} менеджерів</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт / План</p>
                      <p className="text-[14px] font-bold font-mono"><span className="amount">{formatUSD(region.totalFact)}</span> <span className="text-muted-foreground/50 font-normal amount">/ {formatUSD(region.totalPlan)}</span></p>
                    </div>
                    {region.totalPrevFact > 0 && (() => {
                      const dynAmount = region.totalFact - region.totalPrevFact;
                      const dynPct = region.pct - region.prevPct;
                      const dynBetter = dynAmount >= 0;
                      return (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">vs мин. міс.</p>
                          <p className={`text-[12px] font-bold flex items-center justify-end gap-0.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                          </p>
                          <p className={`text-[10px] font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {dynBetter ? '+' : ''}{dynPct.toFixed(1)}%
                          </p>
                        </div>
                      );
                    })()}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                        <div className={`h-full rounded-full ${region.pct >= calcPct ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                          style={{ width: `${Math.min(region.pct * 2, 100)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold ${tl.color}`}>{region.pct.toFixed(1)}%</span>
                      <span className={`text-[10px] font-bold ${regionDeviation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {regionDeviation >= 0 ? '+' : ''}{regionDeviation.toFixed(1)}%
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${tl.bg} ${tl.color}`}>{tl.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] transition-colors" />
                  </div>
                </div>
                {/* Таблиця всіх 9 брендів регіону */}
                <div className="px-5 pb-4">
                  <div className="rounded-xl bg-[#f4f7fb] overflow-hidden">
                    {/* Заголовок таблиці */}
                    <div className="grid grid-cols-[16px_1fr_60px_70px_90px_140px] gap-2 px-3 py-2 border-b border-[#e2e7ef] text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div />
                      <div>Бренд</div>
                      <div className="text-right">%</div>
                      <div className="text-right">vs Норма</div>
                      <div className="text-right">Факт</div>
                      <div className="text-right">vs Мин. міс.</div>
                    </div>
                    {allSegs.map(seg => {
                      const segPct = seg.plan > 0 ? (seg.fact / seg.plan) * 100 : 0;
                      const segPrevPct = seg.prevPlan > 0 ? (seg.prevFact / seg.prevPlan) * 100 : 0;
                      const segTl = getTrafficLight(segPct, calcPct);
                      const segDev = segPct - calcPct;
                      const dyn = seg.fact - seg.prevFact;
                      const dynPct = segPct - segPrevPct;
                      const dynBetter = dyn >= 0;
                      const Arrow = dynBetter ? TrendingUp : TrendingDown;
                      const isInactive = seg.plan === 0 && seg.fact === 0;
                      return (
                        <div
                          key={seg.code}
                          className={`grid grid-cols-[16px_1fr_60px_70px_90px_140px] gap-2 px-3 py-2 items-center text-[11px] border-b border-[#e8ebf4] last:border-b-0 ${isInactive ? 'opacity-40' : ''}`}
                        >
                          <div className={`w-2 h-2 rounded-full ${segTl.dot}`} />
                          <span className="font-semibold text-foreground/80 truncate">{seg.name}</span>
                          <span className={`text-right font-bold ${segTl.color}`}>{segPct.toFixed(0)}%</span>
                          <span className={`text-right font-bold ${segDev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {segDev >= 0 ? '+' : ''}{segDev.toFixed(1)}%
                          </span>
                          <span className="text-right text-muted-foreground font-mono amount">{formatUSD(seg.fact)}</span>
                          <div className="text-right">
                            {seg.prevFact > 0 ? (
                              <span className={`inline-flex items-center gap-0.5 font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <Arrow className="h-2.5 w-2.5" />
                                <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dyn)}</span>
                                <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TM summary — з відхиленням від норми + динамікою vs минулий місяць */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Зведена по ТМ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {segGrandTotals.map(seg => {
            const tl = getTrafficLight(seg.pct, calcPct);
            const dyn = seg.fact - seg.prevFact;
            const segPrevPct = seg.prevPlan > 0 ? (seg.prevFact / seg.prevPlan) * 100 : 0;
            const dynPct = seg.pct - segPrevPct;
            const dynBetter = dyn >= 0;
            const Arrow = dynBetter ? TrendingUp : TrendingDown;
            return (
              <div key={seg.code} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${tl.dot}`} />
                  <span className="text-[13px] font-bold">{seg.name}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${tl.bg} ${tl.color}`}>{tl.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-extrabold">{seg.pct.toFixed(1)}%</span>
                  <span className={`text-[12px] font-bold ${seg.deviation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {seg.deviation >= 0 ? '+' : ''}{seg.deviation.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mt-2 mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                    style={{ width: `${Math.min(seg.pct * 2, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
                  <span className="amount">{formatUSD(seg.fact)}</span>
                  <span className="amount">{formatUSD(seg.plan)}</span>
                </div>
                {seg.prevFact > 0 && (
                  <p className={`text-[10px] font-semibold flex items-center gap-1 pt-1.5 border-t border-[#f0f2f8] ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <Arrow className="h-3 w-3" />
                    vs мин. міс.: <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dyn)}</span>
                    <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
