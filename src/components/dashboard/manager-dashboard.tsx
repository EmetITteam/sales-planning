'use client';

import { useState, useMemo } from 'react';
import { getMockTMSummaries, getMockClientStatsManager } from '@/lib/mock-data';
import { formatUSD, formatPct, formatDateShort, pctOf, workingDaysLabel } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth } from '@/lib/working-days';
import { useOneCData } from '@/lib/use-onec-data';
import { useClientsForPlanning } from '@/lib/use-clients-for-planning';
import { adaptSalesFact } from '@/lib/onec-adapters';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import { BrandRow } from './brand-row';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import {
  DollarSign, Target, TrendingUp, TrendingDown, ChevronRight,
  ClipboardCheck, RefreshCw,
} from 'lucide-react';

interface ManagerDashboardProps {
  /** Якщо передано — режим «перегляд менеджера X» (для РМ або Директора).
   *  Заголовок показує ПІБ цільового менеджера, drill-down у форму = read-only. */
  targetUserLogin?: string;
  targetUserName?: string;
}

export function ManagerDashboard({ targetUserLogin, targetUserName }: ManagerDashboardProps = {}) {
  const [view, setView] = useState<'dashboard' | 'plan' | 'control'>('dashboard');
  const [selectedSegment, setSelectedSegment] = useState('');
  const isViewing = !!targetUserLogin;

  const { currentPeriod, liveMode, user } = useAppStore();
  const effectiveLogin = targetUserLogin || user?.login || 'anonymous';
  // Зріз даних: live → сьогодні, інакше → кінець обраного фільтру
  const asOfDate = liveMode ? new Date() : new Date(currentPeriod.weekEnd);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);
  const periodMonthLabel = getMonthName(asOfDate.getFullYear(), asOfDate.getMonth());
  const totalWorkingDaysInMonth = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());

  // Реальний факт продажів з 1С — без clientIds (загальна картина по сегментах).
  // Period — YYYY-MM, asOfDate тільки в liveMode (інакше — повний місяць за дефолтом).
  const periodKey = currentPeriod.month.slice(0, 7); // "2026-05"
  const asOfIso = liveMode ? new Date().toISOString().slice(0, 10) : undefined;
  const { data: factResponse, loading: factLoading, error: factError } = useOneCData(
    'getSalesFact',
    effectiveLogin !== 'anonymous'
      ? { login: effectiveLogin, period: periodKey, clientIds: [], asOfDate: asOfIso }
      : null,
  );

  // Клієнти з 1С — кешовано в Zustand. Один виклик при заході менеджера, передаємо
  // у PlanningForm через prop (форма миттєво відкривається без власного fetch'у).
  const {
    data: clientsResponse,
    loading: clientsLoading,
    error: clientsError,
    refetch: refetchClients,
  } = useClientsForPlanning(effectiveLogin !== 'anonymous' ? effectiveLogin : null);

  // Беремо mock-сводки як основу (план + prevMonth + інше — поки моки),
  // а fact заміняємо реальним з 1С коли є відповідь.
  const summaries = useMemo(() => {
    const base = getMockTMSummaries(asOfDate);
    if (!factResponse) return base;
    const realFacts = adaptSalesFact(factResponse).facts;
    return base.map(b => {
      const real = realFacts.find(f => f.segmentCode === b.segmentCode);
      if (!real) return { ...b, factAmount: 0, factPercent: 0 };
      const factAmount = real.totalAmount;
      const factPercent = pctOf(factAmount, b.planAmount);
      return {
        ...b,
        factAmount,
        factPercent: Math.round(factPercent * 100) / 100,
        clientCount: real.totalClientCount,
      };
    });
  }, [asOfDate, factResponse]);
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

  if (view === 'plan' && selectedSegment) return (
    <PlanningForm
      segmentCode={selectedSegment}
      onBack={() => setView('dashboard')}
      readOnly={liveMode || isViewing}
      targetUserLogin={targetUserLogin}
      clientsResponse={clientsResponse ?? null}
      clientsLoading={clientsLoading}
      clientsError={clientsError}
    />
  );
  if (view === 'control') return <ClientControlView onBack={() => setView('dashboard')} />;

  return (
    <div className="space-y-8">
      {isViewing && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
          <span className="font-semibold">👁 Перегляд менеджера:</span>
          <span className="font-bold">{targetUserName || targetUserLogin}</span>
          <span className="ml-auto text-[11px] text-amber-700">режим тільки для читання</span>
        </div>
      )}
      {(factLoading || clientsLoading) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {factLoading && clientsLoading ? 'Завантаження факту і клієнтів з 1С...'
            : factLoading ? 'Завантаження факту з 1С...'
            : 'Завантаження клієнтів з 1С...'}
        </div>
      )}
      {factError && (
        <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700">
          Не вдалось отримати факт з 1С: {factError}. Показано mock-дані.
        </div>
      )}
      {clientsError && (
        <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-800 flex items-center gap-2">
          <span>Клієнти з 1С недоступні: {clientsError}.</span>
          <button onClick={refetchClients} className="ml-auto text-[11px] font-semibold underline hover:no-underline">
            Спробувати ще раз
          </button>
        </div>
      )}

      {/* Hero metrics — компактні картки у стилі watermark */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Target />}
          iconColor="text-[#066aab]"
          label="План місяця"
          value={formatUSD(totalPlan)}
          isAmount
          caption={<span className="text-muted-foreground">{periodMonthLabel} · {workingDaysLabel(totalWorkingDaysInMonth)}</span>}
        />
        <MetricCard
          icon={<DollarSign />}
          iconColor="text-emerald-500"
          label="Факт"
          value={formatUSD(totalFact)}
          isAmount
          caption={totalPrevFact > 0 && (() => {
            const dyn = totalFact - totalPrevFact;
            const better = dyn >= 0;
            const Arrow = better ? TrendingUp : TrendingDown;
            return (
              <span className="space-y-0.5 block">
                <span className="text-muted-foreground block">
                  Мин. міс.: <span className="amount font-semibold text-foreground whitespace-nowrap">{formatUSD(totalPrevFact)}</span>
                  <span className="whitespace-nowrap"> / <span className="font-semibold text-foreground">{totalPrevPct.toFixed(1)}%</span></span>
                </span>
                <span className={`font-semibold block ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <Arrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                  <span className="amount whitespace-nowrap">{better ? '+' : ''}{formatUSD(dyn)}</span>
                </span>
              </span>
            );
          })()}
        />
        <MetricCard
          icon={totalPct >= totalCalcPct ? <TrendingUp /> : <TrendingDown />}
          iconColor={totalPct >= totalCalcPct ? 'text-emerald-500' : 'text-rose-500'}
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold">Торгові марки</h3>
          {!clientsLoading && clientsResponse && (
            <button
              onClick={refetchClients}
              title="Перезавантажити клієнтів з 1С (якщо щойно додав/змінив у 1С)"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#066aab] transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Оновити з 1С
            </button>
          )}
        </div>
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
