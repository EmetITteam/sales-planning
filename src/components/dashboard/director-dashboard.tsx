'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { aggregateCompany, aggregateManagers, aggregateCompanyClientStats } from '@/lib/region-aggregates';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import { formatUSD, formatPct, formatDateShort, pctOf, calcForecastPercent, workingDaysLabel } from '@/lib/format';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays, getMonthProgressPct } from '@/lib/working-days';
import { RMDashboard } from './rm-dashboard';
import { ManagerDashboard } from './manager-dashboard';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import { DashboardSkeleton } from './dashboard-skeleton';
import { RegionAccordion } from './region-accordion';
import { BrandRegionGroup, pivotBrandsByRegion } from './brand-region-group';
import {
  ChevronRight, RefreshCw,
  DollarSign, Target, TrendingUp, TrendingDown, Users,
} from 'lucide-react';

type DirView = 'dashboard' | 'viewRegion' | 'viewManager';

/**
 * Дашборд Директора — зведення по всій компанії через Action 5.
 *
 * Структура:
 *  - Hero metrics: total компанії
 *  - 9 BrandRow (агрегат по сегменту через ВСІ регіони)
 *  - Список регіонів з підсумками (клік → drill-down у RMDashboard)
 *
 * Власного планування у Директора немає — у неї нема свого регіону клієнтів,
 * вона дивиться зведення по всій компанії і drill-down у регіонах.
 */
export function DirectorDashboard() {
  const [view, setView] = useState<DirView>('dashboard');
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>('');
  const [selectedManagerLogin, setSelectedManagerLogin] = useState<string>('');
  // Якщо клік був на конкретному бренді у контексті менеджера (BrandRegionGroup
  // expand → manager) — одразу відкриваємо планування brand×manager.
  const [selectedSegmentForManager, setSelectedSegmentForManager] = useState<string>('');

  const { user, currentPeriod, liveMode } = useAppStore();
  const periodKey = currentPeriod.month.slice(0, 7);
  // ⚠️ asOfIso ЗАВЖДИ передаємо щоб 1С повертала факт по обраному діапазону
  const asOfIso = liveMode
    ? new Date().toISOString().slice(0, 10)
    : currentPeriod.weekEnd;

  const { data: regionResp, loading, error, refetch } = useOneCData(
    'getRegionData',
    user ? { login: user.login, period: periodKey, asOfDate: asOfIso } : null,
  );
  const adapted = useMemo(() => regionResp ? adaptRegionData(regionResp) : null, [regionResp]);
  const company = useMemo(() => adapted ? aggregateCompany(adapted.regions) : null, [adapted]);

  // Auto-retry: до 3 спроб з backoff (1.2с / 2.5с / 5с) якщо 1С повертає
  // порожньо. На першому запиті після login Action 5 іноді не встигає.
  // Поки йдуть retries (autoRetryAttempt < 3) — показуємо loader, не noData.
  const [autoRetryAttempt, setAutoRetryAttempt] = useState(0);
  const isAutoRetrying = !!regionResp && !!adapted && adapted.regions.length === 0 && !error && autoRetryAttempt < 3;
  useEffect(() => {
    if (regionResp && adapted && adapted.regions.length === 0 && !error && !loading && autoRetryAttempt < 3) {
      const delay = autoRetryAttempt === 0 ? 1200 : autoRetryAttempt === 1 ? 2500 : 5000;
      const t = setTimeout(() => {
        setAutoRetryAttempt(n => n + 1);
        refetch();
      }, delay);
      return () => clearTimeout(t);
    }
  }, [regionResp, adapted, error, loading, refetch, autoRetryAttempt]);
  useEffect(() => {
    if (regionResp && adapted && adapted.regions.length > 0 && autoRetryAttempt > 0) {
      setAutoRetryAttempt(0);
    }
  }, [regionResp, adapted, autoRetryAttempt]);
  const handleManualRetry = () => { setAutoRetryAttempt(0); refetch(); };

  // Агрегат клієнтів по компанії — береться з Action 5 (v2.5 clientStats per manager).
  const clientStats = useMemo(() => adapted ? aggregateCompanyClientStats(adapted.regions) : null, [adapted]);
  const clientStatsLoading = loading && !clientStats;

  // === Робочі дні / asOfDate для прогресу ===
  // asOfDate = currentPeriod.weekEnd (фільтр) або today (live).
  const monthParts = currentPeriod.month.split('-').map(Number);
  const py = Number.isFinite(monthParts[0]) && monthParts[0] > 0 ? monthParts[0] : new Date().getFullYear();
  const pm = Number.isFinite(monthParts[1]) && monthParts[1] > 0 ? monthParts[1] : new Date().getMonth() + 1;
  const asOfDate = useMemo(() => {
    if (liveMode) return new Date();
    const [y, m, d] = currentPeriod.weekEnd.split('-').map(Number);
    return new Date(y || py, (m || pm) - 1, d || 1);
  }, [liveMode, currentPeriod.weekEnd, py, pm]);
  const totalWD = getWorkingDaysInMonth(py, pm - 1);
  const passedWD = getPassedWorkingDays(py, pm - 1, asOfDate);
  const calcPctValue = getMonthProgressPct(py, pm - 1, asOfDate);
  // «Норма на ранок» = % робочих днів пройдено станом на вчора (asOfDate − 1).
  // Дає baseline: «що було на початку дня vs що зараз». Показуємо завжди — навіть
  // якщо вчора був вихідний (значення збігається з today, що теж інформативно).
  const morningPctValue = useMemo(() => {
    const yest = new Date(asOfDate);
    yest.setDate(yest.getDate() - 1);
    return getMonthProgressPct(py, pm - 1, yest);
  }, [asOfDate, py, pm]);
  const periodLabel = getMonthName(py, pm - 1);

  // ⚠️ ВСІ хуки мають бути ВИЩЕ early returns. usePlanningAggregate +
  // useRegionStats + allCompanyLogins тут — інакше при перемиканні view
  // (viewRegion / viewManager) кількість хуків змінюється → React error #310.
  const allCompanyLogins = useMemo(() => adapted?.regions.flatMap(r => r.managers.map(m => m.login)).filter(Boolean) ?? [], [adapted]);
  const { data: planAgg } = usePlanningAggregate(currentPeriod.id, allCompanyLogins.length > 0 ? allCompanyLogins : null);
  const periodKeyForStats = currentPeriod.month.slice(0, 7);
  const { data: companyStats, loading: companyStatsLoading } = useRegionStats(
    allCompanyLogins.length > 0 ? periodKeyForStats : null,
    asOfIso,
    allCompanyLogins.length > 0 ? allCompanyLogins : null,
  );

  // === Sub-views ===
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
  if (view === 'viewManager') {
    // Швидкий drill-down напряму у менеджера (з manager-mini-list у RegionAccordion).
    // Знаходимо ім'я для шапки.
    let managerName = selectedManagerLogin;
    if (adapted) {
      for (const r of adapted.regions) {
        const m = r.managers.find(x => x.login === selectedManagerLogin);
        if (m) { managerName = m.name; break; }
      }
    }
    return (
      <div className="space-y-4">
        <button onClick={() => { setView('dashboard'); setSelectedSegmentForManager(''); }} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        <ManagerDashboard
          targetUserLogin={selectedManagerLogin}
          targetUserName={managerName}
          initialSegmentCode={selectedSegmentForManager || undefined}
        />
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

  const noData = !loading && !error && (!company || company.regionAggregates.length === 0) && !isAutoRetrying;

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
  // Очікуваний % компанії (Variant B aggregate-endpoint).
  const totalExpectedPct = planAgg && totalPlan > 0
    ? ((totalFact + planAgg.totalForecast + planAgg.totalGapPotential) / totalPlan) * 100
    : null;
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

      {isAutoRetrying && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-12 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-[#066aab]" />
            <p className="text-[13px] font-medium text-muted-foreground">Завантажуємо дані компанії…</p>
          </div>
        </div>
      )}
      {noData && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-8 text-center space-y-3">
          <p className="text-[15px] font-bold">Дані по компанії не знайдено</p>
          <p className="text-[13px] text-muted-foreground">
            1С не повернула жодного регіону для логіну <span className="font-mono">{user?.login}</span>.
            <br />Якщо це постійно — зверніться до IT.
          </p>
          <button
            onClick={handleManualRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white text-[13px] font-semibold shadow-md shadow-[#066aab]/15 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Спробувати ще
          </button>
        </div>
      )}

      {company && company.regionAggregates.length > 0 && (
        <>
          {/* Hero metrics — 4 картки (4-та = ClientStatsCard через Action 2 агрегат) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<Target />}
              iconColor="text-[#066aab]"
              label="План компанії"
              value={formatUSD(totalPlan)}
              isAmount
              caption={<span className="text-muted-foreground">{periodLabel} · {workingDaysLabel(totalWD)}</span>}
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
                  <p className="text-muted-foreground">Норма на {liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd)}: <span className="font-semibold text-foreground">{formatPct(calcPctValue)}</span></p>
                  <p className="text-muted-foreground">Норма на ранок: <span className="font-semibold text-foreground">{formatPct(morningPctValue)}</span></p>
                  <p className="text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span></p>
                  {totalExpectedPct !== null && (
                    <p className="text-muted-foreground">Очікуваний: <span className="font-semibold text-[#066aab]">{formatPct(totalExpectedPct)}</span></p>
                  )}
                </div>
              )}
            />
            <ClientStatsCard
              stats={clientStats ?? {
                active: { total: 0, bought: 0 },
                sleeping: { total: 0, bought: 0 },
                newClients: { total: 0, bought: 0 },
                totalBought: 0,
                totalClients: 0,
              }}
              loading={clientStatsLoading}
            />
          </div>

          {/* Регіони — RegionAccordion (тап = expand → 9 BrandRow усередині, drill-down іконка справа) */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">Регіони</h3>
            <div className="space-y-3">
              {company.regionAggregates.map((r, idx) => {
                const region = adapted!.regions[idx];
                // Показуємо у mini-list тільки тих хто РЕАЛЬНО продав (totalFact > 0).
                // Менеджери з планом але БЕЗ факту (типу Хамуляк у відпустці)
                // вилучаються — їх дані все одно у regional агрегаті.
                // Fallback: якщо у регіоні ніхто ще не продав (1-2 числа місяця) —
                // показуємо тих хто має план (щоб блок не був пустий).
                const allManagers = aggregateManagers(region);
                const withFact = allManagers.filter(m => m.totalFact > 0);
                const managersBrief = (withFact.length > 0 ? withFact : allManagers.filter(m => m.totalPlan > 0))
                  .map(m => ({
                    name: m.name,
                    login: m.login,
                    pct: m.factPercent,
                    dev: m.factPercent - calcPctValue,
                    onPlan: m.factPercent >= calcPctValue,
                  }));
                return (
                  <RegionAccordion
                    key={r.regionCode || r.regionName}
                    aggregate={r}
                    managersBrief={managersBrief}
                    calcPct={calcPctValue}
                    asOfDate={asOfDate}
                    onDrillDown={() => { setSelectedRegionCode(r.regionCode); setView('viewRegion'); }}
                    onManagerClick={(login) => { setSelectedManagerLogin(login); setView('viewManager'); }}
                  />
                );
              })}
            </div>
          </div>

          {/* По брендах з розбивкою по регіонах — BrandRegionGroup */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">По брендах — з розбивкою по регіонах</h3>
            <div className="space-y-3">
              {pivotBrandsByRegion(company.regionAggregates, adapted!.regions).map(brand => (
                <BrandRegionGroup
                  key={brand.segmentCode}
                  brand={brand}
                  calcPct={calcPctValue}
                  asOfDate={asOfDate}
                  planCategoriesForBrand={planAgg?.bySegment[brand.segmentCode]?.byCategory ?? null}
                  factCategoriesForBrand={companyStats?.bySegment[brand.segmentCode]?.byCategory ?? null}
                  categoriesLoading={companyStatsLoading}
                  onRegionClick={(code) => { setSelectedRegionCode(code); setView('viewRegion'); }}
                  onManagerClick={(login, segCode) => {
                    setSelectedManagerLogin(login);
                    setSelectedSegmentForManager(segCode);
                    setView('viewManager');
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
