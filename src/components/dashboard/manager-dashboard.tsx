'use client';

import { useState } from 'react';
import { getMockTMSummaries, getMockClientStatsManager } from '@/lib/mock-data';
import { formatUSD, formatPct, formatDateShort, pctOf } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import { BrandRow } from './brand-row';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import {
  DollarSign, Target, TrendingUp, TrendingDown, ChevronRight,
  ClipboardCheck,
} from 'lucide-react';

export function ManagerDashboard() {
  const [view, setView] = useState<'dashboard' | 'plan' | 'control'>('dashboard');
  const [selectedSegment, setSelectedSegment] = useState('');

  const { currentPeriod, liveMode } = useAppStore();
  // Зріз даних: live → сьогодні, інакше → кінець обраного фільтру
  const asOfDate = liveMode ? new Date() : new Date(currentPeriod.weekEnd);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);

  const summaries = getMockTMSummaries(asOfDate);
  const totalPlan = summaries.reduce((s, t) => s + t.planAmount, 0);
  const totalFact = summaries.reduce((s, t) => s + t.factAmount, 0);
  const totalPct = pctOf(totalFact, totalPlan);
  const totalPrevFact = summaries.reduce((s, t) => s + (t.prevMonthFactAmount ?? 0), 0);
  const totalPrevPlan = summaries.reduce((s, t) => s + (t.prevMonthPlanAmount ?? 0), 0);
  const totalPrevPct = pctOf(totalPrevFact, totalPrevPlan);

  // Зважена сума по всіх сегментах для трьох процентів "Виконання"
  const totalCalcPct = summaries.length > 0
    ? summaries.reduce((s, t) => s + t.calcPercent * t.planAmount, 0) / Math.max(totalPlan, 1)
    : 0;
  const totalForecastPct = summaries.length > 0
    ? summaries.reduce((s, t) => s + t.forecastPercent * t.planAmount, 0) / Math.max(totalPlan, 1)
    : 0;
  const totalExpectedPct = summaries.length > 0
    ? summaries.reduce((s, t) => s + t.expectedPercent * t.planAmount, 0) / Math.max(totalPlan, 1)
    : 0;

  if (view === 'plan' && selectedSegment) return <PlanningForm segmentCode={selectedSegment} onBack={() => setView('dashboard')} readOnly={liveMode} />;
  if (view === 'control') return <ClientControlView onBack={() => setView('dashboard')} />;

  return (
    <div className="space-y-8">
      {/* Hero metrics — компактні картки */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Target className="h-5 w-5" />}
          iconGradient="from-[#066aab] to-[#0880cc]"
          label="План місяця"
          value={formatUSD(totalPlan)}
          isAmount
        />
        <MetricCard
          icon={<DollarSign className="h-5 w-5" />}
          iconGradient="from-emerald-500 to-teal-600"
          label="Факт"
          value={formatUSD(totalFact)}
          isAmount
          caption={totalPrevFact > 0 && (() => {
            const dyn = totalFact - totalPrevFact;
            const dynPct = totalPct - totalPrevPct;
            const better = dyn >= 0;
            const Arrow = better ? TrendingUp : TrendingDown;
            return (
              <span className={`font-semibold ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                <Arrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                vs мин. міс.: <span className="amount whitespace-nowrap">{better ? '+' : ''}{formatUSD(dyn)}</span>
                <span className="whitespace-nowrap"> ({better ? '+' : ''}{dynPct.toFixed(1)}%)</span>
              </span>
            );
          })()}
        />
        <MetricCard
          icon={totalPct >= totalCalcPct ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          iconGradient={totalPct >= totalCalcPct ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'}
          label="Виконання"
          value={(
            <span className="flex items-baseline gap-2">
              <span>{formatPct(totalPct)}</span>
              <span className={`text-[12px] font-bold ${totalPct >= totalCalcPct ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalPct - totalCalcPct >= 0 ? '+' : ''}{(totalPct - totalCalcPct).toFixed(1)}%
              </span>
            </span>
          )}
          caption={(
            <div className="space-y-0.5">
              <p className="text-muted-foreground">Норма на {asOfLabel}: <span className="font-semibold text-foreground">{formatPct(totalCalcPct)}</span></p>
              <p className="text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(totalExpectedPct)}</span></p>
            </div>
          )}
        />
        <ClientStatsCard stats={getMockClientStatsManager()} />
      </div>

      {/* Control banner */}
      <button
        onClick={() => setView('control')}
        className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="text-left flex-1">
          <p className="text-[15px] font-bold text-foreground">Контроль виконання</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Понедільний план → факт по клієнтах за місяць</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
      </button>

      {/* Бренди — горизонтальні строки через переиспользуемый BrandRow */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Торгові марки</h3>
        <div className="space-y-2">
          {summaries.map((tm) => (
            <BrandRow
              key={tm.segmentCode}
              segmentName={tm.segmentName}
              planAmount={tm.planAmount}
              factAmount={tm.factAmount}
              calcPct={tm.calcPercent}
              asOfDate={asOfDate}
              expectedPercent={tm.expectedPercent}
              hasManagerPlan={tm.hasManagerPlan}
              clientCount={tm.clientCount}
              prevMonthFactAmount={tm.prevMonthFactAmount}
              prevMonthFactPercent={tm.prevMonthFactPercent}
              onClick={() => { setSelectedSegment(tm.segmentCode); setView('plan'); }}
              readOnly={liveMode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
