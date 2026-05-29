'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { DIRECTOR_PROXY_LOGIN, MULTI_REGION_RM_OVERRIDES } from '@/lib/feature-flags';
import { aggregateRegion, aggregateManagers, aggregateRegionClientStats } from '@/lib/region-aggregates';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { useRegionStats } from '@/lib/use-region-stats';
import { CategoryStatsTable } from './category-stats-table';
import { formatUSD, formatPct, formatDateShort, pctOf, calcForecastPercent, workingDaysLabel } from '@/lib/format';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays, getMonthProgressPct } from '@/lib/working-days';
import { ManagerDashboard } from './manager-dashboard';
import { ManagerAccordion } from './manager-accordion';
import { BrandManagerGroup, pivotBrandsByManager } from './brand-manager-group';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import { DashboardSkeleton } from './dashboard-skeleton';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { WindowLockBanner } from '@/components/window-lock-banner';
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
  // Initial з nav store — щоб refresh повертав на drill-down (Manager/PlanForm).
  // Не для Director-внутрішнього RM (regionCode prop) — там drill-down nav
  // керується Director-ом.
  const persistedNav = useAppStore.getState().nav;
  const startManager = !regionCode ? (persistedNav.managerLogin || '') : '';
  const [view, setView] = useState<RMView>(startManager ? 'viewManager' : 'dashboard');
  const [selectedManager, setSelectedManager] = useState<string>(startManager);
  const [selectedSegmentForManager, setSelectedSegmentForManager] = useState<string>(
    !regionCode ? (persistedNav.segmentCode || '') : '',
  );

  const { user, currentPeriod, liveMode, setNav } = useAppStore();
  // Wrappers для setView/setSelected — синхронізують nav store
  const goToManager = (login: string, segCode?: string) => {
    setSelectedManager(login);
    setSelectedSegmentForManager(segCode || '');
    setView('viewManager');
    setNav({ managerLogin: login, segmentCode: segCode });
  };
  const goToDashboard = () => {
    setView('dashboard');
    setSelectedManager('');
    setSelectedSegmentForManager('');
    setNav({ managerLogin: undefined, segmentCode: undefined });
  };
  const periodKey = currentPeriod.month.slice(0, 7); // YYYY-MM
  // ⚠️ asOfIso ЗАВЖДИ передаємо: live → today, інакше → дата з фільтра
  // (currentPeriod.weekEnd). Якщо не передавати — 1С повертає весь місяць,
  // а норма виконання й факт мають бути узгоджені з обраним періодом.
  const asOfIso = liveMode
    ? new Date().toISOString().slice(0, 10)
    : currentPeriod.weekEnd;

  // === Action 5 ===
  // КОСТИЛЬ: для МУЛЬТИ-РМ (Пашковська — Одеса + Миколаїв) 1С повертає
  // тільки той регіон де вона офіційно РМ (Одеса). У Миколаєві вона є
  // як менеджер з historic хвостом — але без інших менеджерів регіону.
  // Якщо логін у MULTI_REGION_RM_OVERRIDES — викликаємо Action 5 через
  // DIRECTOR_PROXY (повна картина), потім фільтруємо до її regionCodes.
  const overrideRegions = user ? MULTI_REGION_RM_OVERRIDES[user.login] : undefined;
  const a5Login = overrideRegions ? DIRECTOR_PROXY_LOGIN : user?.login;
  const { data: regionResp, loading, error, refetch } = useOneCData(
    'getRegionData',
    a5Login ? { login: a5Login, period: periodKey, asOfDate: asOfIso } : null,
    { isEmptyResponse: (r) => !r?.regions || r.regions.length === 0 },
  );
  const adapted = useMemo(() => {
    if (!regionResp) return null;
    const full = adaptRegionData(regionResp);
    if (!overrideRegions) return full;
    // Фільтруємо до тих регіонів які РМ має бачити
    return { ...full, regions: full.regions.filter(r => overrideRegions.includes(r.regionCode)) };
  }, [regionResp, overrideRegions]);

  const availableRegions = adapted?.regions ?? [];

  // Дефолт: перший регіон з реальними даними (де є менеджер з planом/фактом),
  // інакше — просто перший. Це щоб РМ не відкривав одразу порожній регіон.
  const defaultRegionCode = useMemo(() => {
    if (!adapted) return null;
    const withData = adapted.regions.find(r =>
      r.managers.some(m => m.segments.some(s => s.planAmount > 0 || s.factAmount > 0))
    );
    return withData?.regionCode || adapted.regions[0]?.regionCode || null;
  }, [adapted]);

  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(null);
  const effectiveRegionCode = regionCode || selectedRegionCode || defaultRegionCode;

  const region = useMemo(() => {
    if (!adapted) return null;
    if (effectiveRegionCode) {
      return adapted.regions.find(r => r.regionCode === effectiveRegionCode) ?? adapted.regions[0] ?? null;
    }
    return adapted.regions[0] ?? null;
  }, [adapted, effectiveRegionCode]);

  const aggregate = useMemo(() => region ? aggregateRegion(region) : null, [region]);
  // managerList: тільки ті хто РЕАЛЬНО продав (totalFact > 0).
  // Fallback на тих з планом, якщо ніхто ще не продав (1-2 числа місяця).
  const managerList = useMemo(() => {
    if (!region) return [];
    const all = aggregateManagers(region);
    const withFact = all.filter(m => m.totalFact > 0);
    return withFact.length > 0 ? withFact : all.filter(m => m.totalPlan > 0);
  }, [region]);

  // Auto-retry для cold-start винесено у useOneCData (Day 14 #4).
  // `loading` flag тепер true поки йде retry — UI не блимає.
  const handleManualRetry = () => { refetch(); };

  // Aggregate planning по всіх менеджерах регіону → для розрахунку «Очікуваного %»
  const allLogins = useMemo(() => {
    const flat = region?.managers.map(m => m.login).filter(Boolean) ?? [];
    return Array.from(new Set(flat)); // dedup на випадок 1С Action 5 повторення
  }, [region]);
  const { data: planAgg } = usePlanningAggregate(currentPeriod.id, allLogins.length > 0 ? allLogins : null, currentPeriod.month);
  // Fact частина — батч Action 2+3 з 1С через серверний proxy.
  // Передаємо plannedClientIds щоб правильно рахувати «Незаплановані» (купили
  // без плану) — інакше блок дублює totalFact коли planned=0.
  const periodKeyForStats = currentPeriod.month.slice(0, 7);
  const { data: regionStats, loading: statsLoading } = useRegionStats(
    allLogins.length > 0 ? periodKeyForStats : null,
    asOfIso,
    allLogins.length > 0 ? allLogins : null,
    planAgg ? {
      forecastClientIds: planAgg.forecastClientIds,
      gapNewClientIds: planAgg.gapNewClientIds,
      gapActivationClientIds: planAgg.gapActivationClientIds,
    } : null,
  );
  // Збираємо plan + fact для CategoryStatsTable: сумарно по регіону (всі бренди разом)
  const aggregatedPlan = useMemo(() => {
    if (!planAgg) return null;
    const empty = () => ({ plannedCount: 0, plannedSum: 0, plannedCountFinalized: 0, plannedSumFinalized: 0 });
    const out = { active: empty(), sleeping: empty(), lost: empty(), new: empty(), none: empty() };
    for (const seg of Object.values(planAgg.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].plannedCount += seg.byCategory[cat].plannedCount;
        out[cat].plannedSum   += seg.byCategory[cat].plannedSum;
        out[cat].plannedCountFinalized += seg.byCategory[cat].plannedCountFinalized ?? 0;
        out[cat].plannedSumFinalized   += seg.byCategory[cat].plannedSumFinalized ?? 0;
      }
    }
    return out;
  }, [planAgg]);
  const aggregatedFact = useMemo(() => {
    if (!regionStats) return null;
    const out = {
      active: { factCount: 0, factSum: 0 },
      sleeping: { factCount: 0, factSum: 0 },
      lost: { factCount: 0, factSum: 0 },
      new: { factCount: 0, factSum: 0 },
      none: { factCount: 0, factSum: 0 },
    };
    for (const seg of Object.values(regionStats.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].factCount += seg.byCategory[cat].factCount;
        out[cat].factSum   += seg.byCategory[cat].factSum;
      }
    }
    return out;
  }, [regionStats]);
  const aggregatedUnplanned = useMemo(() => {
    if (!regionStats) return null;
    let factCount = 0, factSum = 0;
    for (const seg of Object.values(regionStats.bySegment)) {
      factCount += seg.unplanned?.factCount ?? 0;
      factSum   += seg.unplanned?.factSum   ?? 0;
    }
    return { factCount, factSum };
  }, [regionStats]);

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
        <button onClick={goToDashboard} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
        <button onClick={goToDashboard} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до регіону
        </button>
        <ManagerDashboard
          targetUserLogin={selectedManager}
          targetUserName={target?.name || selectedManager}
          targetUserRegion={region?.regionName || ''}
          targetUserRegionCode={region?.regionCode || ''}
          initialSegmentCode={selectedSegmentForManager || undefined}
        />
      </div>
    );
  }

  // === Loading skeleton ===
  if (loading && !regionResp) return <DashboardSkeleton role="rm" />;

  // === Error state ===
  // Session-expired показуємо через модал у AppHeader (не дубль).
  const errorBanner = error && !error.includes('Сесія завершилась') ? (
    <div className="px-4 py-2 rounded-xl bg-rose-50/60 backdrop-blur-md border border-rose-200/70 text-[12px] text-rose-700 flex items-center gap-2">
      <span>Помилка 1С (getRegionData): {error}</span>
      <button onClick={refetch} className="ml-auto font-semibold underline hover:no-underline">
        Спробувати ще
      </button>
    </div>
  ) : null;

  // === Empty state ===
  // `loading` тепер true поки йде auto-retry (useOneCData), тому окрема
  // isAutoRetrying flag непотрібна.
  const noRegion = !loading && !error && !region;

  // === Dashboard ===
  const totalPlan = aggregate?.totalPlan ?? 0;
  const totalFact = aggregate?.totalFact ?? 0;
  const totalPct = pctOf(totalFact, totalPlan);
  const totalPrevFact = aggregate?.totalPrevMonthFact ?? 0;
  const totalPrevPlan = aggregate?.totalPrevMonthPlan ?? 0;
  const totalPrevPct = pctOf(totalPrevFact, totalPrevPlan);
  // Б.2: динаміка — заплановане vs минулий факт (forward-looking).
  // ТІЛЬКИ finalized — порівнюємо проти зафіксованих планів менеджерів регіону.
  const totalExpectedAmount = planAgg
    ? planAgg.totalForecastFinalized + planAgg.totalGapPotentialFinalized
    : 0;
  // ЗАВЖДИ заплановане vs минулий — без fallback на totalFact. Якщо план=$0,
  // dyn = -prevFact, що наочно показує «у плані нічого нема».
  const dynAmount = totalExpectedAmount - totalPrevFact;
  const dynBetter = dynAmount >= 0;
  const DynArrow = dynBetter ? TrendingUp : TrendingDown;
  const totalForecastPct = calcForecastPercent(totalFact, totalPlan, passedWD, totalWD);
  // «Запланований %» — ТІЛЬКИ з фіналізованих планів (не чернеток).
  // Семантика: реальне зобов'язання менеджерів регіону, на яке РМ покладається.
  const totalExpectedPct = planAgg && totalPlan > 0
    ? ((planAgg.totalForecastFinalized + planAgg.totalGapPotentialFinalized) / totalPlan) * 100
    : null;

  return (
    <div className="space-y-8">
      <MaintenanceBanner />
      <WindowLockBanner />
      {errorBanner}

      {/* Region header — селектор регіонів коли РМ закріплений за кількома
          (приклад: Пашковська — Одеса + Миколаїв). */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white shadow-lg shadow-emet-blue/15">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold">Регіон: {region?.regionName || user?.region || '—'}</h1>
            {!regionCode && availableRegions.length > 1 && (
              <div className="flex items-center gap-1 ml-1">
                {availableRegions.map(r => {
                  const active = r.regionCode === effectiveRegionCode;
                  return (
                    <button
                      key={r.regionCode}
                      onClick={() => setSelectedRegionCode(r.regionCode)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                        active
                          ? 'bg-emet-blue text-white'
                          : 'bg-emet-50 text-emet-blue hover:bg-emet-100'
                      }`}
                    >
                      {r.regionName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {managerList.length} {managerList.length === 1 ? 'менеджер' : 'менеджерів'} · {periodLabel}
          </p>
        </div>
        <button
          onClick={() => setView('myPlanning')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emet-50 hover:bg-emet-100 text-emet-blue text-[12px] font-semibold transition-colors"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Моє планування
        </button>
        {!loading && (
          <button
            onClick={refetch}
            title="Оновити з 1С"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-emet-blue transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Оновити
          </button>
        )}
      </div>

      {/* Mobile fallback for 'Моє планування' (sm:hidden, header has hidden sm:flex) */}
      <button
        onClick={() => setView('myPlanning')}
        className="sm:hidden flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-emet-50 text-emet-blue text-[13px] font-semibold"
      >
        <ClipboardList className="h-4 w-4" /> Моє планування
        <ChevronRight className="h-4 w-4 ml-auto" />
      </button>

      {loading && !region && (
        <div className="glass-card p-12 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emet-blue" />
            <p className="text-[13px] font-medium text-muted-foreground">Завантажуємо дані регіону…</p>
          </div>
        </div>
      )}
      {noRegion && (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-[15px] font-bold">Дані регіону не знайдено</p>
          <p className="text-[13px] text-muted-foreground">
            1С не повернула жодного регіону для логіну <span className="font-mono">{user?.login}</span>.
            <br />Якщо це постійно — зверніться до IT.
          </p>
          <button
            onClick={handleManualRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white text-[13px] font-semibold shadow-md shadow-emet-blue/15 transition-all"
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
              index={0}
              ambient="accent"
              valueSize="lg"
              valuePrefix="$"
              icon={<Target />}
              iconColor="text-emet-blue"
              label="План регіону"
              value={<span className="amount">{Math.round(totalPlan).toLocaleString('en-US')}</span>}
              caption={(() => {
                // ТІЛЬКИ finalized — чернетки до натискання «Фінальне збереження»
                // не йдуть у звітність.
                const totalFin = planAgg ? planAgg.totalForecastFinalized + planAgg.totalGapPotentialFinalized : 0;
                return (
                  <span className="space-y-0.5 block">
                    <span className="text-muted-foreground block">{periodLabel} · {workingDaysLabel(totalWD)}</span>
                    <span className="text-muted-foreground block">
                      Заплановано: <span className="amount font-semibold text-foreground">{formatUSD(totalFin)}</span>
                    </span>
                  </span>
                );
              })()}
            />
            <MetricCard
              index={1}
              ambient="mint"
              valueSize="lg"
              valuePrefix="$"
              icon={<DollarSign />}
              iconColor="text-emerald-500"
              label="Факт"
              value={<span className="amount">{Math.round(totalFact).toLocaleString('en-US')}</span>}
              caption={totalPrevFact > 0 ? (
                <span className="space-y-0.5 block">
                  <span className="text-muted-foreground block">
                    Мин. міс.: <span className="amount font-semibold text-foreground whitespace-nowrap">{formatUSD(totalPrevFact)}</span>
                    {' / '}<span className="font-semibold text-foreground">{totalPrevPct.toFixed(1)}%</span>
                  </span>
                  <span className={`font-semibold block ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <DynArrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                    <span className="amount whitespace-nowrap">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      заплан. vs мин. факт
                    </span>
                  </span>
                </span>
              ) : null}
            />
            <MetricCard
              index={2}
              ambient={totalPct >= calcPctValue ? 'good' : totalPct - calcPctValue >= -15 ? 'warn' : 'bad'}
              valueSize="lg"
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
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground">Норма на {liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd)}:</span>
                  <span className="font-semibold text-foreground tabular-nums text-right">{formatPct(calcPctValue)}</span>
                  <span className="text-muted-foreground">Норма на ранок:</span>
                  <span className="font-semibold text-foreground tabular-nums text-right">{formatPct(morningPctValue)}</span>
                  <span className="text-muted-foreground">Прогноз (темп):</span>
                  <span className="font-semibold text-amber-600 tabular-nums text-right">{formatPct(totalForecastPct)}</span>
                  {totalExpectedPct !== null && (
                    <>
                      <span className="text-muted-foreground">Запланований:</span>
                      <span className="font-semibold text-emet-blue tabular-nums text-right">{formatPct(totalExpectedPct)}</span>
                    </>
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

          {/* Розклад по категоріях клієнтів (агрегат по регіону) — над списком менеджерів */}
          <CategoryStatsTable
            plan={aggregatedPlan}
            fact={aggregatedFact}
            unplanned={aggregatedUnplanned}
            title={`Регіон ${region.regionName} · ${managerList.length} ${managerList.length === 1 ? 'менеджер' : 'менеджерів'}`}
            loading={statsLoading && !aggregatedFact}
          />

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
                  onDrillDown={() => goToManager(m.login)}
                  onPlanBrand={(segCode) => goToManager(m.login, segCode)}
                  planByLogin={planAgg?.byLogin ?? null}
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
                  planCategoriesForBrand={planAgg?.bySegment[brand.segmentCode]?.byCategory ?? null}
                  factCategoriesForBrand={regionStats?.bySegment[brand.segmentCode]?.byCategory ?? null}
                  unplannedForBrand={regionStats?.bySegment[brand.segmentCode]?.unplanned ?? null}
                  categoriesLoading={statsLoading}
                  planByLogin={planAgg?.byLogin ?? null}
                  onManagerClick={(login, segCode) => goToManager(login, segCode)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
