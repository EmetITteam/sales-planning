'use client';

import { useState } from 'react';
import { formatUSD, formatPct, formatDateShort, getTrafficLight } from '@/lib/format';
import { getMonthProgressPct } from '@/lib/working-days';
import { MOCK_REGION_DATA, SEGMENTS, getFactScaleRatio } from '@/lib/mock-data';
import { useAppStore } from '@/lib/store';
import { PlanningForm } from '../planning/planning-form';
import { ManagerDashboard } from './manager-dashboard';
import { BrandRow } from './brand-row';
import { Target, DollarSign, TrendingUp, TrendingDown, Users, MapPin, ChevronRight, ClipboardList, Eye } from 'lucide-react';

interface RMDashboardProps {
  regionCode?: string;
}

type RMView = 'dashboard' | 'myPlanning' | 'viewManager';

export function RMDashboard({ regionCode }: RMDashboardProps = {}) {
  const [view, setView] = useState<RMView>('dashboard');
  const [selectedManager, setSelectedManager] = useState<string>('');

  const { currentPeriod, liveMode } = useAppStore();
  const asOfDate = liveMode ? new Date() : new Date(currentPeriod.weekEnd);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);
  const factScale = getFactScaleRatio(asOfDate);

  const region = MOCK_REGION_DATA;

  // Норма календаря — % робочих днів пройдено на дату зрізу
  const calcPct = getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);

  // Масштабуємо mock-факт пропорційно дати зрізу (імітуємо getSalesFact(asOfDate))
  const scaledManagers = region.managers.map(m => ({
    ...m,
    segments: m.segments.map(s => ({
      ...s,
      factAmount: Math.round(s.factAmount * factScale),
      prevMonthFactAmount: s.prevMonthFactAmount !== undefined
        ? Math.round(s.prevMonthFactAmount * factScale)
        : undefined,
    })),
    totalPrevMonthFact: m.totalPrevMonthFact !== undefined
      ? Math.round(m.totalPrevMonthFact * factScale)
      : undefined,
  }));

  const regionTotals = SEGMENTS.map(seg => {
    let totalPlan = 0, totalFact = 0, prevFact = 0, prevPlan = 0;
    scaledManagers.forEach(m => {
      const s = m.segments.find(ms => ms.segmentCode === seg.code);
      if (s) {
        totalPlan += s.planAmount;
        totalFact += s.factAmount;
        prevFact += s.prevMonthFactAmount ?? 0;
        prevPlan += s.prevMonthPlanAmount ?? 0;
      }
    });
    const pct = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;
    const prevPct = prevPlan > 0 ? (prevFact / prevPlan) * 100 : 0;
    return {
      code: seg.code, name: seg.name,
      totalPlan, totalFact, pct,
      prevFact, prevPlan, prevPct,
      deviation: pct - calcPct,
    };
  });

  const grandPlan = regionTotals.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionTotals.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = grandPlan > 0 ? (grandFact / grandPlan) * 100 : 0;
  const grandPrevFact = regionTotals.reduce((s, r) => s + r.prevFact, 0);
  const grandPrevPlan = regionTotals.reduce((s, r) => s + r.prevPlan, 0);
  const grandPrevPct = grandPrevPlan > 0 ? (grandPrevFact / grandPrevPlan) * 100 : 0;

  // Моє планування — показує дашборд менеджера
  if (view === 'myPlanning') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до регіону
        </button>
        <ManagerDashboard />
      </div>
    );
  }

  // Перегляд менеджера — read-only
  if (view === 'viewManager') {
    const manager = region.managers.find(m => m.login === selectedManager);
    const firstSegment = manager?.segments[0]?.segmentCode ?? 'PETARAN';
    return (
      <PlanningForm
        segmentCode={firstSegment}
        onBack={() => setView('dashboard')}
        readOnly
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Регіон: {region.regionName}</h2>
          <p className="text-[12px] text-muted-foreground">{region.managers.length} менеджерів</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* План регіону */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg mb-3"><Target className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium">План регіону</p>
          <p className="text-2xl font-extrabold tracking-tight amount">{formatUSD(grandPlan)}</p>
        </div>

        {/* Факт + vs мин.міс. */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg mb-3"><DollarSign className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium">Факт</p>
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

        {/* Виконання + відхилення від норми */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${grandPct >= calcPct ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'} text-white shadow-lg mb-3`}>
            {grandPct >= calcPct ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <p className="text-[12px] text-muted-foreground font-medium">Виконання</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold tracking-tight">{grandPct.toFixed(1)}%</p>
            <span className={`text-[12px] font-bold ${grandPct >= calcPct ? 'text-emerald-600' : 'text-rose-600'}`}>
              {grandPct - calcPct >= 0 ? '+' : ''}{(grandPct - calcPct).toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Норма на {asOfLabel}: <span className="font-semibold text-foreground">{formatPct(calcPct)}</span></p>
        </div>

        {/* Менеджерів */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg mb-3"><Users className="h-5 w-5" /></div>
          <p className="text-[12px] text-muted-foreground font-medium">Менеджерів</p>
          <p className="text-2xl font-extrabold tracking-tight">{region.managers.length}</p>
        </div>
      </div>

      {/* Моє планування */}
      <button
        onClick={() => setView('myPlanning')}
        className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="text-left flex-1">
          <p className="text-[15px] font-bold text-foreground">Моє планування</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Заповнити власний прогноз по ТМ</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
      </button>

      {/* Manager cards */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Менеджери</h3>
        <div className="space-y-4">
          {scaledManagers.map(manager => {
            const mTotal = manager.segments.reduce((s, seg) => s + seg.factAmount, 0);
            const mPlan = manager.segments.reduce((s, seg) => s + seg.planAmount, 0);
            const mPct = mPlan > 0 ? (mTotal / mPlan) * 100 : 0;
            const mTl = getTrafficLight(mPct, calcPct);

            // v2.1: динаміка vs минулий місяць на той же N-й робочий день
            const prevTotal = manager.totalPrevMonthFact ?? manager.segments.reduce((s, seg) => s + (seg.prevMonthFactAmount ?? 0), 0);
            const prevPlan = manager.segments.reduce((s, seg) => s + (seg.prevMonthPlanAmount ?? 0), 0);
            const prevPct = prevPlan > 0 ? (prevTotal / prevPlan) * 100 : 0;
            const dynAmount = mTotal - prevTotal;
            const dynPct = mPct - prevPct;
            const dynBetter = dynAmount >= 0;

            return (
              <div key={manager.login}
                onClick={() => { setSelectedManager(manager.login); setView('viewManager'); }}
                className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer group"
              >
                {/* === DESKTOP (md+): один рядок === */}
                <div className="hidden md:flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center text-[14px] font-bold text-[#066aab]">
                      {manager.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold">{manager.name}</p>
                      <span className={`text-[11px] font-semibold ${mTl.color}`}>{mTl.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                      <p className="text-[15px] font-bold font-mono amount">{formatUSD(mPlan)}</p>
                    </div>
                    <div className="w-px h-8 bg-[#e2e7ef]" />
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                      <p className="text-[15px] font-extrabold font-mono amount">{formatUSD(mTotal)}</p>
                    </div>
                    {prevTotal > 0 && (
                      <>
                        <div className="w-px h-8 bg-[#e2e7ef]" />
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
                      </>
                    )}
                    <div className="w-16">
                      <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                          style={{ width: `${Math.min(mPct, 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-center text-muted-foreground mt-0.5 font-semibold">{mPct.toFixed(1)}%</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground/40 group-hover:text-[#066aab] transition-colors">
                      <Eye className="h-4 w-4" />
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {/* === MOBILE (<md): stacked === */}
                <div className="md:hidden flex items-start gap-2.5 px-3 py-3">
                  <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center text-[13px] font-bold text-[#066aab] shrink-0 mt-0.5">
                    {manager.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[14px] font-bold truncate flex-1">{manager.name}</p>
                      <span className={`text-[10px] font-bold ${mTl.color}`}>{mTl.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mb-1.5">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                        style={{ width: `${Math.min(mPct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] flex-wrap gap-1.5">
                      <span className="text-muted-foreground">
                        Факт <span className="font-bold text-foreground amount">{formatUSD(mTotal)}</span>
                        <span className="text-muted-foreground/50"> / </span>
                        <span className="amount text-muted-foreground/70">{formatUSD(mPlan)}</span>
                      </span>
                      <span className="font-bold">{mPct.toFixed(1)}%</span>
                      {prevTotal > 0 && (
                        <span className={`flex items-center gap-0.5 font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                          <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Бренди менеджера — список BrandRow */}
                <div className="px-3 md:px-6 pb-4 space-y-1.5 bg-[#fafbfe]">
                  {manager.segments.map(seg => (
                    <BrandRow
                      key={seg.segmentCode}
                      segmentName={seg.segmentName}
                      planAmount={seg.planAmount}
                      factAmount={seg.factAmount}
                      calcPct={calcPct}
                      asOfDate={asOfDate}
                      prevMonthFactAmount={seg.prevMonthFactAmount}
                      prevMonthFactPercent={seg.prevMonthFactPercent}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Зведена по ТМ — рядки бренд за регіоном */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Зведена по ТМ — регіон {region.regionName}</h3>
        <div className="space-y-2">
          {regionTotals.map(rt => (
            <BrandRow
              key={rt.code}
              segmentName={rt.name}
              planAmount={rt.totalPlan}
              factAmount={rt.totalFact}
              calcPct={calcPct}
              asOfDate={asOfDate}
              prevMonthFactAmount={rt.prevFact}
              prevMonthFactPercent={rt.prevPct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
