'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { aggregateRegion, aggregateManagers, aggregateRegionClientStats } from '@/lib/region-aggregates';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { formatUSD, formatPct, formatDateShort, pctOf, calcForecastPercent, workingDaysLabel } from '@/lib/format';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays, getMonthProgressPct } from '@/lib/working-days';
import { ManagerDashboard } from './manager-dashboard';
import { ManagerAccordion } from './manager-accordion';
import { BrandManagerGroup, pivotBrandsByManager } from './brand-manager-group';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import { DashboardSkeleton } from './dashboard-skeleton';
import {
  ChevronRight, MapPin, ClipboardList, RefreshCw,
  DollarSign, Target, TrendingUp, TrendingDown,
} from 'lucide-react';

interface RMDashboardProps {
  /** Якщо передано (drill-down з директора) — фільтруємо regions[] по цьому коду. */
  regionCode?: string;
}

type RMView = 'dashboard' | 'myPlanning' | 'viewManager';

/**
 * Дашборд РМ — показує зведення по регіону через Action 5 (getRegionData).
 *
 * Структура:
 *  - Hero metrics: total план/факт/виконання + порівняння з минулим місяцем
 *  - 9 BrandRow (агрегати по регіону, по сегменту)
 *  - Список менеджерів регіону з власними цифрами
 *  - Кнопки: «Моє планування» (РМ як менеджер) + drill-down у конкретного менеджера
 */
export function RMDashboard({ regionCode }: RMDashboardProps = {}) {
  const [view, setView] = useState<RMView>('dashboard');
  const [selectedManager, setSelectedManager] = useState<string>('');
  // Якщо клік був на конкретному бренді (з ManagerAccordion expand) — одразу
  // відкриваємо планування за тим брендом у нащадковій ManagerDashboard.
  const [selectedSegmentForManager, setSelectedSegmentForManager] = useState<string>('');

  const { user, currentPeriod, liveMode } = useAppStore();
  const periodKey = currentPeriod.month.slice(0, 7); // YYYY-MM
  // ⚠️ asOfIso ЗАВЖДИ передаємо: live → today, інакше → дата з фільтра
  // (currentPeriod.weekEnd). Якщо не передавати — 1С повертає весь місяць,
  // а норма виконання й факт мають бути узгоджені з обраним періодом.
  const asOfIso = liveMode
    ? new Date().toISOString().slice(0, 10)
    : currentPeriod.weekEnd;

  // === Action 5 ===
  const { data: regionResp, loading, error, refetch } = useOneCData(
    'getRegionData',
    user ? { login: user.login, period: periodKey, asOfDate: asOfIso } : null,
  );
  const adapted = useMemo(() => regionResp ? adaptRegionData(regionResp) : null, [regionResp]);
  const region = useMemo(() => {
    if (!adapted) return null;
    if (regionCode) return adapted.regions.find(r => r.regionCode === regionCode) ?? adapted.regions[0] ?? null;
    return adapted.regions[0] ?? null; // РМ — тільки 1 регіон
  }, [adapted, regionCode]);

  const aggregate = useMemo(() => region ? aggregateRegion(region) : null, [region]);
  // managerList: тільки ті хто РЕАЛЬНО продав (totalFact > 0).
  // Fallback на тих з планом, якщо ніхто ще не продав (1-2 числа місяця).
  const managerList = useMemo(() => {
    if (!region) return [];
    const all = aggregateManagers(region);
    const withFact = all.filter(m => m.totalFact > 0);
    return withFact.length > 0 ? withFact : all.filter(m => m.totalPlan > 0);
  }, [region]);

  // Auto-retry: до 3 спроб з backoff (1.2с / 2.5с / 5с) якщо 1С повертає
  // порожньо. На першому запиті після login Action 5 іноді не встигає —
  // короткий retry зазвичай дає валідну відповідь. Поки йдуть retries
  // (autoRetryAttempt < 3) — показуємо loader, не noData.
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
  // Якщо у форкомі стан скинутий через нову повну сесію (нова відповідь з даними) — нуль на attempt
  useEffect(() => {
    if (regionResp && adapted && adapted.regions.length > 0 && autoRetryAttempt > 0) {
      setAutoRetryAttempt(0);
    }
  }, [regionResp, adapted, autoRetryAttempt]);
  const handleManualRetry = () => { setAutoRetryAttempt(0); refetch(); };

  // Aggregate planning по всіх менеджерах регіону → для розрахунку «Очікуваного %»
  const allLogins = useMemo(() => region?.managers.map(m => m.login).filter(Boolean) ?? [], [region]);
  const { data: planAgg } = usePlanningAggregate(currentPeriod.id, allLogins.length > 0 ? allLogins : null);

  // Агрегат клієнтів по регіону — береться з Action 5 (v2.5 clientStats per manager).
  const clientStats = useMemo(() => region ? aggregateRegionClientStats(region) : null, [region]);
  const clientStatsLoading = loading && !clientStats;

  // === Зріз дат для прогресу місяця ===
  // asOfDate = currentPeriod.weekEnd (фільтр) або today (live).
  // НЕ кінець місяця! Інакше норма завжди 100%.
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
  // «Норма на ранок» = % робочих днів станом на вчора. Показуємо завжди.
  const morningPctValue = useMemo(() => {
    const yest = new Date(asOfDate);
    yest.setDate(yest.getDate() - 1);
    return getMonthProgressPct(py, pm - 1, yest);
  }, [asOfDate, py, pm]);
  const periodLabel = getMonthName(py, pm - 1);

  // === Sub-views ===
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
  if (view === 'viewManager') {
    const target = managerList.find(m => m.login === selectedManager);
    return (
      <div className="space-y-4">
        <button onClick={() => { setView('dashboard'); setSelectedSegmentForManager(''); }} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до регіону
        </button>
        <ManagerDashboard
          targetUserLogin={selectedManager}
          targetUserName={target?.name || selectedManager}
          initialSegmentCode={selectedSegmentForManager || undefined}
        />
      </div>
    );
  }

  // === Loading skeleton ===
  if (loading && !regionResp) return <DashboardSkeleton role="rm" />;

  // === Error state ===
  const errorBanner = error ? (
    <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700 flex items-center gap-2">
      <span>Помилка 1С (getRegionData): {error}</span>
      <button onClick={refetch} className="ml-auto font-semibold underline hover:no-underline">
        Спробувати ще
      </button>
    </div>
  ) : null;

  // === Empty state ===
  // Показуємо noData ТІЛЬКИ якщо retry-петля вичерпала всі 3 спроби.
  // Поки йдуть retries — рендеримо інший стан (loader-фідбек).
  const noRegion = !loading && !error && !region && !isAutoRetrying;

  // === Dashboard ===
  const totalPlan = aggregate?.totalPlan ?? 0;
  const totalFact = aggregate?.totalFact ?? 0;
  const totalPct = pctOf(totalFact, totalPlan);
  const totalPrevFact = aggregate?.totalPrevMonthFact ?? 0;
  const totalPrevPlan = aggregate?.totalPrevMonthPlan ?? 0;
  const totalPrevPct = pctOf(totalPrevFact, totalPrevPlan);
  const dynAmount = totalFact - totalPrevFact;
  const dynBetter = dynAmount >= 0;
  const DynArrow = dynBetter ? TrendingUp : TrendingDown;
  const totalForecastPct = calcForecastPercent(totalFact, totalPlan, passedWD, totalWD);
  // Очікуваний % = (факт + Σ прогноз менеджерів + Σ потенціал закриття розриву) / план
  // Дані з aggregate-endpoint (Variant B). Якщо ще не догружено — null.
  const totalExpectedPct = planAgg && totalPlan > 0
    ? ((totalFact + planAgg.totalForecast + planAgg.totalGapPotential) / totalPlan) * 100
    : null;

  return (
    <div className="space-y-8">
      {errorBanner}

      {/* Region header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Регіон: {region?.regionName || user?.region || '—'}</h2>
          <p className="text-[12px] text-muted-foreground">
            {managerList.length} {managerList.length === 1 ? 'менеджер' : 'менеджерів'} · {periodLabel}
          </p>
        </div>
        <button
          onClick={() => setView('myPlanning')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e8f4fc] hover:bg-[#c5e3f6] text-[#066aab] text-[12px] font-semibold transition-colors"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Моє планування
        </button>
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

      {/* Mobile fallback for 'Моє планування' (sm:hidden, header has hidden sm:flex) */}
      <button
        onClick={() => setView('myPlanning')}
        className="sm:hidden flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-[#e8f4fc] text-[#066aab] text-[13px] font-semibold"
      >
        <ClipboardList className="h-4 w-4" /> Моє планування
        <ChevronRight className="h-4 w-4 ml-auto" />
      </button>

      {isAutoRetrying && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-12 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-[#066aab]" />
            <p className="text-[13px] font-medium text-muted-foreground">Завантажуємо дані регіону…</p>
          </div>
        </div>
      )}
      {noRegion && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-8 text-center space-y-3">
          <p className="text-[15px] font-bold">Дані регіону не знайдено</p>
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

      {region && aggregate && (
        <>
          {/* Hero metrics — 4 картки (4-та = ClientStatsCard через Action 2 агрегат) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<Target />}
              iconColor="text-[#066aab]"
              label="План регіону"
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
                  <p className="text-muted-foreground">Прогноз (темп): <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span></p>
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

          {/* Менеджери регіону — ManagerAccordion (тап = expand → 9 BrandRow усередині) */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">Менеджери регіону</h3>
            <div className="space-y-3">
              {region.managers.map(m => (
                <ManagerAccordion
                  key={m.login}
                  manager={m}
                  calcPct={calcPctValue}
                  asOfDate={asOfDate}
                  onDrillDown={() => { setSelectedManager(m.login); setView('viewManager'); }}
                  onPlanBrand={(segCode) => {
                    setSelectedManager(m.login);
                    setSelectedSegmentForManager(segCode);
                    setView('viewManager');
                  }}
                />
              ))}
            </div>
          </div>

          {/* По брендах з розбивкою по менеджерах — BrandManagerGroup */}
          <div>
            <h3 className="text-[15px] font-bold mb-4">По брендах — з розбивкою по менеджерах</h3>
            <div className="space-y-3">
              {pivotBrandsByManager(region.managers).map(brand => (
                <BrandManagerGroup
                  key={brand.segmentCode}
                  brand={brand}
                  calcPct={calcPctValue}
                  asOfDate={asOfDate}
                  onManagerClick={(login, segCode) => {
                    setSelectedManager(login);
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
