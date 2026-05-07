'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { aggregateCompany } from '@/lib/region-aggregates';
import { formatUSD, formatPct, pctOf, calcForecastPercent } from '@/lib/format';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays, getMonthProgressPct } from '@/lib/working-days';
import { RMDashboard } from './rm-dashboard';
import { ManagerDashboard } from './manager-dashboard';
import { BrandRow } from './brand-row';
import { MetricCard } from './metric-card';
import { DashboardSkeleton } from './dashboard-skeleton';
import {
  ChevronRight, MapPin, ClipboardList, RefreshCw,
  DollarSign, Target, TrendingUp, TrendingDown, Users, Eye,
} from 'lucide-react';

type DirView = 'dashboard' | 'myPlanning' | 'viewRegion';

/**
 * Дашборд Директора — зведення по всій компанії через Action 5.
 *
 * Структура:
 *  - Hero metrics: total компанії
 *  - 9 BrandRow (агрегат по сегменту через ВСІ регіони)
 *  - Список регіонів з підсумками (клік → drill-down у RMDashboard)
 *  - «Моє планування» (директор як менеджер)
 */
export function DirectorDashboard() {
  const [view, setView] = useState<DirView>('dashboard');
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>('');

  const { user, currentPeriod, liveMode } = useAppStore();
  const periodKey = currentPeriod.month.slice(0, 7);
  const asOfIso = liveMode ? new Date().toISOString().slice(0, 10) : undefined;

  const { data: regionResp, loading, error, refetch } = useOneCData(
    'getRegionData',
    user ? { login: user.login, period: periodKey, asOfDate: asOfIso } : null,
  );
  const adapted = useMemo(() => regionResp ? adaptRegionData(regionResp) : null, [regionResp]);
  const company = useMemo(() => adapted ? aggregateCompany(adapted.regions) : null, [adapted]);

  // === Робочі дні / asOfDate для прогресу ===
  const monthParts = currentPeriod.month.split('-').map(Number);
  const py = Number.isFinite(monthParts[0]) && monthParts[0] > 0 ? monthParts[0] : new Date().getFullYear();
  const pm = Number.isFinite(monthParts[1]) && monthParts[1] > 0 ? monthParts[1] : new Date().getMonth() + 1;
  const asOfDate = useMemo(
    () => liveMode ? new Date() : new Date(py, pm - 1, new Date(py, pm, 0).getDate()),
    [liveMode, py, pm],
  );
  const totalWD = getWorkingDaysInMonth(py, pm - 1);
  const passedWD = getPassedWorkingDays(py, pm - 1, asOfDate);
  const calcPctValue = getMonthProgressPct(py, pm - 1, asOfDate);
  const periodLabel = getMonthName(py, pm - 1);

  // === Sub-views ===
  if (view === 'myPlanning') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        <ManagerDashboard />
      </div>
    );
  }
  if (view === 'viewRegion') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        <RMDashboard regionCode={selectedRegionCode} />
      </div>
    );
  }

  // === Loading skeleton ===
  if (loading && !regionResp) return <DashboardSkeleton role="director" />;

  const errorBanner = error ? (
    <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700 flex items-center gap-2">
      <span>Помилка 1С (getRegionData): {error}</span>
      <button onClick={refetch} className="ml-auto font-semibold underline hover:no-underline">
        Спробувати ще
      </button>
    </div>
  ) : null;

  const noData = !loading && !error && (!company || company.regionAggregates.length === 0);

  const totalPlan = company?.totalPlan ?? 0;
  const totalFact = company?.totalFact ?? 0;
  const totalPct = pctOf(totalFact, totalPlan);
  const totalPrevFact = company?.totalPrevMonthFact ?? 0;
  const totalPrevPlan = company?.totalPrevMonthPlan ?? 0;
  const totalPrevPct = pctOf(totalPrevFact, totalPrevPlan);
  const dynAmount = totalFact - totalPrevFact;
  const dynBetter = dynAmount >= 0;
  const DynArrow = dynBetter ? TrendingUp : TrendingDown;
  const totalForecastPct = calcForecastPercent(totalFact, totalPlan, passedWD, totalWD);
  const totalManagers = company?.regionAggregates.reduce((a, r) => a + r.managerCount, 0) ?? 0;

  return (
    <div className="space-y-8">
      {errorBanner}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Огляд по компанії</h2>
          <p className="text-[12px] text-muted-foreground">
            {company?.regionAggregates.length ?? 0} {(company?.regionAggregates.length ?? 0) === 1 ? 'регіон' : 'регіонів'}
            {' · '}{totalManagers} менеджерів · {periodLabel}
          </p>
        </div>
        {!loading && (
          <button
            onClick={refetch}
            title="Оновити з 1С"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#066aab] transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Оновити
          </button>
        )}
      </div>

      {noData && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-8 text-center space-y-2">
          <p className="text-[15px] font-bold">Дані по компанії не знайдено</p>
          <p className="text-[13px] text-muted-foreground">
            1С не повернула жодного регіону для логіну <span className="font-mono">{user?.login}</span>.
          </p>
        </div>
      )}

      {company && company.regionAggregates.length > 0 && (
        <>
          {/* Hero metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<Target />}
              iconColor="text-[#066aab]"
              label="План компанії"
              value={formatUSD(totalPlan)}
              isAmount
              caption={<span className="text-muted-foreground">{periodLabel}</span>}
            />
            <MetricCard
              icon={<DollarSign />}
              iconColor="text-emerald-500"
              label="Факт"
              value={formatUSD(totalFact)}
              isAmount
              caption={totalPrevFact > 0 ? (
                <span className="space-y-0.5 block">
                  <span className="text-muted-foreground block">
                    Мин. міс.: <span className="amount font-semibold text-foreground whitespace-nowrap">{formatUSD(totalPrevFact)}</span>
                    {' / '}<span className="font-semibold text-foreground">{totalPrevPct.toFixed(1)}%</span>
                  </span>
                  <span className={`font-semibold block ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <DynArrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                    <span className="amount whitespace-nowrap">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                  </span>
                </span>
              ) : null}
            />
            <MetricCard
              icon={totalPct >= calcPctValue ? <TrendingUp /> : <TrendingDown />}
              iconColor={totalPct >= calcPctValue ? 'text-emerald-500' : 'text-rose-500'}
              label="Виконання"
              value={(
                <span className="flex items-baseline gap-2">
                  <span>{formatPct(totalPct)}</span>
                  <span className={`text-[12px] font-bold ${totalPct >= calcPctValue ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totalPct - calcPctValue >= 0 ? '+' : ''}{(totalPct - calcPctValue).toFixed(1)}%
                  </span>
                </span>
              )}
              caption={(
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(calcPctValue)}</span></p>
                  <p className="text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span></p>
                </div>
              )}
            />
            <MetricCard
              icon={<Users />}
              iconColor="text-[#066aab]"
              label="Активні регіони"
              value={String(company.regionAggregates.filter(r => r.totalPlan > 0).length)}
              caption={<span className="text-muted-foreground">з {company.regionAggregates.length} підконтрольних</span>}
            />
          </div>

          {/* Brand cards (агрегат по компанії) */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">Торгові марки компанії</h3>
            <div className="space-y-2">
              {company.segments.map(seg => (
                <BrandRow
                  key={seg.segmentCode}
                  segmentName={seg.segmentName}
                  planAmount={seg.planAmount}
                  factAmount={seg.factAmount}
                  calcPct={calcPctValue}
                  asOfDate={asOfDate}
                  hasManagerPlan={false}
                  prevMonthFactAmount={seg.prevMonthFactAmount}
                  prevMonthFactPercent={seg.prevMonthPlanAmount > 0
                    ? (seg.prevMonthFactAmount / seg.prevMonthPlanAmount) * 100
                    : 0}
                  readOnly
                />
              ))}
            </div>
          </div>

          {/* My planning */}
          <button
            onClick={() => setView('myPlanning')}
            className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="text-left flex-1">
              <p className="text-[15px] font-bold text-foreground">Моє планування</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">Особистий прогноз по ТМ як у менеджера</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
          </button>

          {/* Region list */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">Регіони</h3>
            <div className="space-y-2">
              {company.regionAggregates.map(r => {
                const rPct = pctOf(r.totalFact, r.totalPlan);
                const rDyn = r.totalFact - r.totalPrevMonthFact;
                return (
                  <button
                    key={r.regionCode || r.regionName}
                    onClick={() => { setSelectedRegionCode(r.regionCode); setView('viewRegion'); }}
                    className="w-full grid grid-cols-[36px_1fr_120px_120px_80px_24px] gap-3 items-center px-4 py-3 rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 cursor-pointer group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-[#066aab]" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-[13px] font-semibold truncate">{r.regionName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {r.managerCount} {r.managerCount === 1 ? 'менеджер' : 'менеджерів'}
                        {r.regionCode && ` · ${r.regionCode}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                      <p className="text-[13px] font-bold amount">{formatUSD(r.totalPlan)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                      <p className="text-[13px] font-bold text-emerald-600 amount">{formatUSD(r.totalFact)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">%</p>
                      <p className={`text-[13px] font-bold ${rPct >= calcPctValue ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {rPct.toFixed(1)}%
                      </p>
                      {r.totalPrevMonthFact > 0 && (
                        <p className={`text-[10px] font-semibold ${rDyn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {rDyn >= 0 ? '+' : ''}{formatUSD(rDyn)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Eye className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#066aab] transition-colors" />
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
