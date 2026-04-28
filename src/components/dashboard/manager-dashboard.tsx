'use client';

import { useState } from 'react';
import { getMockTMSummaries } from '@/lib/mock-data';
import { formatUSD, formatPct, getTrafficLight } from '@/lib/format';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import {
  DollarSign, Target, TrendingUp, TrendingDown, ChevronRight,
  ClipboardCheck, Users, UserPlus, RefreshCw,
} from 'lucide-react';

export function ManagerDashboard() {
  const [view, setView] = useState<'dashboard' | 'plan' | 'control'>('dashboard');
  const [selectedSegment, setSelectedSegment] = useState('');

  const summaries = getMockTMSummaries();
  const totalPlan = summaries.reduce((s, t) => s + t.planAmount, 0);
  const totalFact = summaries.reduce((s, t) => s + t.factAmount, 0);
  const totalPct = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;
  const totalPrevFact = summaries.reduce((s, t) => s + (t.prevMonthFactAmount ?? 0), 0);

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

  if (view === 'plan' && selectedSegment) return <PlanningForm segmentCode={selectedSegment} onBack={() => setView('dashboard')} />;
  if (view === 'control') return <ClientControlView onBack={() => setView('dashboard')} />;

  // Мок: факт по категоріях клієнтів (буде з 1С)
  const clientStats = {
    active: { total: 131, bought: 28, amount: 12450 },
    sleeping: { total: 45, bought: 5, amount: 1890 },
    newClients: { total: 8, bought: 2, amount: 680 },
  };

  return (
    <div className="space-y-8">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* План місяця */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg"><Target className="h-5 w-5" /></div>
          <div className="mt-4">
            <p className="text-[13px] font-medium text-muted-foreground">План місяця</p>
            <p className="text-2xl font-extrabold tracking-tight mt-0.5 amount">{formatUSD(totalPlan)}</p>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br from-[#066aab] to-[#0880cc] opacity-[0.06] blur-2xl" />
        </div>

        {/* Факт + vs минулий місяць */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg"><DollarSign className="h-5 w-5" /></div>
          <div className="mt-4">
            <p className="text-[13px] font-medium text-muted-foreground">Факт</p>
            <p className="text-2xl font-extrabold tracking-tight mt-0.5 amount">{formatUSD(totalFact)}</p>
            {totalPrevFact > 0 && (() => {
              const dyn = totalFact - totalPrevFact;
              const better = dyn >= 0;
              const Arrow = better ? TrendingUp : TrendingDown;
              return (
                <p className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <Arrow className="h-3 w-3" /> vs мин. міс.: <span className="amount">{better ? '+' : ''}{formatUSD(dyn)}</span>
                </p>
              );
            })()}
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 opacity-[0.06] blur-2xl" />
        </div>

        {/* Виконання — поточний факт + норма календаря + прогноз run-rate + очікуваний (план менеджера) */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between mb-3">
            <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${totalPct >= totalCalcPct ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'} text-white shadow-lg`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[13px] font-medium text-muted-foreground">Виконання</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="text-2xl font-extrabold tracking-tight">{formatPct(totalPct)}</p>
            <span className={`text-[12px] font-bold ${totalPct >= totalCalcPct ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totalPct - totalCalcPct >= 0 ? '+' : ''}{(totalPct - totalCalcPct).toFixed(1)}%
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
            <p>Норма на сьогодні: <span className="font-semibold text-foreground">{formatPct(totalCalcPct)}</span></p>
            <p>Прогноз (темп): <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span> · Очік. (план): <span className="font-semibold text-[#066aab]">{formatPct(totalExpectedPct)}</span></p>
          </div>
        </div>

        {/* Клієнти по категоріях — факт купівель */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] font-medium text-muted-foreground mb-3">Клієнти — факт купівель</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#066aab]" />
                <span className="text-[12px] font-medium">Активні</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.active.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.active.total}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                <span className="text-[12px] font-medium">Сплячі</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.sleeping.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.sleeping.total}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-500" />
                <span className="text-[12px] font-medium">Нові</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.newClients.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.newClients.total}</span>
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-[#f0f2f8]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Всього купили</span>
              <span className="text-[14px] font-extrabold text-emerald-600">
                {clientStats.active.bought + clientStats.sleeping.bought + clientStats.newClients.bought}
              </span>
            </div>
          </div>
        </div>
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

      {/* TM Cards Grid */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Торгові марки</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaries.map((tm) => {
            // Світлофор: факт vs норма (calc) — чи в темпі плану
            const tl = getTrafficLight(tm.factPercent, tm.calcPercent);
            // Прогрес-бар нормалізуємо до 100% плану
            const factBarWidth = Math.min(tm.factPercent, 100);
            return (
              <button
                key={tm.segmentCode}
                onClick={() => { setSelectedSegment(tm.segmentCode); setView('plan'); }}
                className="group text-left bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer hover:-translate-y-0.5 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-3 h-3 rounded-full ${tl.dot} shadow-sm`} />
                    <span className="text-[15px] font-bold">{tm.segmentName}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tl.bg} ${tl.color}`}>
                    {tl.label}
                  </span>
                </div>

                {/* Великий факт + відставання/перевиконання vs норма (з шапки) */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-extrabold tracking-tight">{formatPct(tm.factPercent)}</span>
                    <span className={`text-[14px] font-bold ${tm.factPercent >= tm.calcPercent ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tm.factPercent - tm.calcPercent >= 0 ? '+' : ''}{(tm.factPercent - tm.calcPercent).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    {tm.factPercent >= tm.calcPercent ? 'перевиконання' : 'відставання'} від норми
                  </p>

                  {/* Прогрес-бар: заливка факту + насічка очікуваного (план менеджера) */}
                  <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc] transition-all duration-500"
                      style={{ width: `${factBarWidth}%` }}
                    />
                    {/* Насічка очікуваного (план менеджера) — EMET-синя */}
                    {tm.hasManagerPlan && (
                      <div
                        className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full"
                        style={{ left: `calc(${Math.min(tm.expectedPercent, 100)}% - 1px)` }}
                        title={`Очікуваний (план менеджера): ${formatPct(tm.expectedPercent)}`}
                      />
                    )}
                  </div>
                  <p className="text-[11px] mt-1.5">
                    <span className="text-muted-foreground">Очікуваний: </span>
                    <span className="font-bold text-[#066aab]">{formatPct(tm.expectedPercent)}</span>
                    {!tm.hasManagerPlan && (
                      <span className="ml-1 text-[10px] text-amber-600 font-semibold">· план не заповнено</span>
                    )}
                  </p>
                </div>

                {/* vs Минулий місяць — динаміка */}
                {tm.prevMonthFactAmount !== undefined && tm.prevMonthFactAmount > 0 && (() => {
                  const dynAmount = tm.factAmount - (tm.prevMonthFactAmount ?? 0);
                  const dynPct = tm.factPercent - (tm.prevMonthFactPercent ?? 0);
                  const better = dynAmount >= 0;
                  const Arrow = better ? TrendingUp : TrendingDown;
                  return (
                    <div className={`mb-3 flex items-center gap-1.5 text-[11px] ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                      <Arrow className="h-3 w-3" />
                      <span className="font-semibold">vs мин. міс.:</span>
                      <span className="amount font-bold">{better ? '+' : ''}{formatUSD(dynAmount)}</span>
                      <span className="font-semibold">({better ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                    <p className="text-[14px] font-bold mt-0.5 amount">{formatUSD(tm.planAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                    <p className="text-[14px] font-bold mt-0.5 amount">{formatUSD(tm.factAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Клієнти</p>
                    <p className="text-[14px] font-bold mt-0.5">{tm.clientCount}</p>
                  </div>
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-5 w-5 text-[#066aab]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
