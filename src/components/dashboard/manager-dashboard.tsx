'use client';

import { useState } from 'react';
import { getMockTMSummaries } from '@/lib/mock-data';
import { formatUSD, formatPct, formatDateShort, getTrafficLight } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import {
  DollarSign, Target, TrendingUp, TrendingDown, ChevronRight,
  ClipboardCheck, Users, UserPlus, RefreshCw,
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
  const totalPct = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;
  const totalPrevFact = summaries.reduce((s, t) => s + (t.prevMonthFactAmount ?? 0), 0);
  const totalPrevPlan = summaries.reduce((s, t) => s + (t.prevMonthPlanAmount ?? 0), 0);
  const totalPrevPct = totalPrevPlan > 0 ? (totalPrevFact / totalPrevPlan) * 100 : 0;

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
              const dynPct = totalPct - totalPrevPct;
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
            <p>Норма на {asOfLabel}: <span className="font-semibold text-foreground">{formatPct(totalCalcPct)}</span></p>
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

      {/* Бренди — горизонтальні строки-чипи (зберігають всі дані карточок) */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Торгові марки</h3>
        <div className="space-y-2">
          {summaries.map((tm) => {
            const tl = getTrafficLight(tm.factPercent, tm.calcPercent);
            const factBarWidth = Math.min(tm.factPercent, 100);
            const dev = tm.factPercent - tm.calcPercent;
            const prev = tm.prevMonthFactAmount ?? 0;
            const dynAmount = tm.factAmount - prev;
            const dynPct = tm.factPercent - (tm.prevMonthFactPercent ?? 0);
            const dynBetter = dynAmount >= 0;
            const DynArrow = dynBetter ? TrendingUp : TrendingDown;
            return (
              <button
                key={tm.segmentCode}
                onClick={() => { setSelectedSegment(tm.segmentCode); setView('plan'); }}
                className="group w-full text-left bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 cursor-pointer hover:-translate-y-px"
              >
                {/* Верхня смуга: бренд / бейдж / факт% (-dev%) / очікуваний / план / факт / клиенти / vs мин.міс. / chevron */}
                <div className="grid grid-cols-[150px_100px_120px_1fr_90px_90px_70px_180px_20px] gap-3 items-center">
                  {/* 1. Бренд + точка */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${tl.dot} shadow-sm shrink-0`} />
                    <span className="text-[14px] font-bold truncate">{tm.segmentName}</span>
                  </div>

                  {/* 2. Бейдж статусу */}
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-center ${tl.bg} ${tl.color}`}>
                    {tl.label}
                  </span>

                  {/* 3. Великий факт % + відхилення */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold tracking-tight">{formatPct(tm.factPercent)}</span>
                    <span className={`text-[11px] font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
                    </span>
                  </div>

                  {/* 4. Прогрес-бар з насічкою очікуваного + підпис очікуваного */}
                  <div className="min-w-0">
                    <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc] transition-all duration-500"
                        style={{ width: `${factBarWidth}%` }}
                      />
                      {tm.hasManagerPlan && (
                        <div
                          className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full"
                          style={{ left: `calc(${Math.min(tm.expectedPercent, 100)}% - 1px)` }}
                          title={`Очікуваний (план менеджера): ${formatPct(tm.expectedPercent)}`}
                        />
                      )}
                    </div>
                    <p className="text-[10px] mt-1 truncate">
                      <span className="text-muted-foreground">Очік.: </span>
                      <span className="font-bold text-[#066aab]">{formatPct(tm.expectedPercent)}</span>
                      {!tm.hasManagerPlan && (
                        <span className="ml-1 text-amber-600 font-semibold">· план не заповнено</span>
                      )}
                    </p>
                  </div>

                  {/* 5. План */}
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">План</p>
                    <p className="text-[12px] font-bold amount">{formatUSD(tm.planAmount)}</p>
                  </div>

                  {/* 6. Факт */}
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Факт</p>
                    <p className="text-[12px] font-bold amount">{formatUSD(tm.factAmount)}</p>
                  </div>

                  {/* 7. Клієнти */}
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Клієнти</p>
                    <p className="text-[12px] font-bold">{tm.clientCount}</p>
                  </div>

                  {/* 8. vs мин. міс. */}
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">vs мин. міс.</p>
                    {prev > 0 ? (
                      <p className={`text-[11px] font-semibold flex items-center justify-end gap-0.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <DynArrow className="h-3 w-3" />
                        <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                        <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/40">—</p>
                    )}
                  </div>

                  {/* 9. Chevron */}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
