'use client';

import { useState } from 'react';
import { formatUSD, getTrafficLight } from '@/lib/format';
import { MOCK_REGION_DATA, SEGMENTS } from '@/lib/mock-data';
import { PlanningForm } from '../planning/planning-form';
import { ManagerDashboard } from './manager-dashboard';
import { Target, DollarSign, TrendingUp, TrendingDown, Users, MapPin, ChevronRight, ClipboardList, Eye } from 'lucide-react';

interface RMDashboardProps {
  regionCode?: string;
}

type RMView = 'dashboard' | 'myPlanning' | 'viewManager';

export function RMDashboard({ regionCode }: RMDashboardProps = {}) {
  const [view, setView] = useState<RMView>('dashboard');
  const [selectedManager, setSelectedManager] = useState<string>('');

  const region = MOCK_REGION_DATA;

  const regionTotals = SEGMENTS.map(seg => {
    let totalPlan = 0, totalFact = 0;
    region.managers.forEach(m => {
      const s = m.segments.find(ms => ms.segmentCode === seg.code);
      if (s) { totalPlan += s.planAmount; totalFact += s.factAmount; }
    });
    return { code: seg.code, name: seg.name, totalPlan, totalFact, pct: totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0 };
  });

  const grandPlan = regionTotals.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionTotals.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = grandPlan > 0 ? (grandFact / grandPlan) * 100 : 0;

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
        {[
          { label: 'План регіону', value: formatUSD(grandPlan), icon: <Target className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Факт', value: formatUSD(grandFact), icon: <DollarSign className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600' },
          { label: 'Виконання', value: `${grandPct.toFixed(1)}%`, icon: <TrendingUp className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Менеджерів', value: String(region.managers.length), icon: <Users className="h-5 w-5" />, grad: 'from-amber-500 to-orange-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${m.grad} text-white shadow-lg mb-3`}>{m.icon}</div>
            <p className="text-[12px] text-muted-foreground font-medium">{m.label}</p>
            <p className={`text-2xl font-extrabold tracking-tight ${m.label === 'План регіону' || m.label === 'Факт' ? 'amount' : ''}`}>{m.value}</p>
            <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br ${m.grad} opacity-[0.06] blur-2xl`} />
          </div>
        ))}
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
          {region.managers.map(manager => {
            const mTotal = manager.segments.reduce((s, seg) => s + seg.factAmount, 0);
            const mPlan = manager.segments.reduce((s, seg) => s + seg.planAmount, 0);
            const mPct = mPlan > 0 ? (mTotal / mPlan) * 100 : 0;
            const mTl = getTrafficLight(mPct, 22.73);

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
                {/* Manager header */}
                <div className="flex items-center justify-between px-6 py-4">
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

                {/* TM breakdown */}
                <div className="px-6 pb-4">
                  <div className="flex gap-2 flex-wrap">
                    {manager.segments.map(seg => {
                      const tl = getTrafficLight(seg.factPercent, 22.73);
                      return (
                        <div key={seg.segmentCode} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f7fb] min-w-[120px]">
                          <div className={`w-2 h-2 rounded-full ${tl.dot}`} />
                          <div>
                            <p className="text-[11px] font-semibold text-foreground/80">{seg.segmentName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              <span className="amount">{formatUSD(seg.factAmount)}</span> <span className="text-muted-foreground/50 amount">/ {formatUSD(seg.planAmount)}</span>
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold ml-auto ${tl.color}`}>{seg.factPercent.toFixed(0)}%</span>
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

      {/* Region TM summary */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Зведена по ТМ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {regionTotals.map(rt => {
            const tl = getTrafficLight(rt.pct, 22.73);
            return (
              <div key={rt.code} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${tl.dot}`} />
                  <span className="text-[13px] font-bold">{rt.name}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${tl.bg} ${tl.color}`}>{tl.label}</span>
                </div>
                <span className="text-xl font-extrabold">{rt.pct.toFixed(1)}%</span>
                <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mt-2 mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                    style={{ width: `${Math.min(rt.pct * 2, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="amount">{formatUSD(rt.totalFact)}</span>
                  <span className="amount">{formatUSD(rt.totalPlan)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
