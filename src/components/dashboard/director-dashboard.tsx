'use client';

import { useMemo, useState, useCallback } from 'react';
import { useSWRConfig } from 'swr';
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
import { useDynamicPlanSegments } from '@/lib/use-dynamic-plan-segments';
import { PlanningReadinessCard } from './planning-readiness-card';
import { FEATURES } from '@/lib/feature-flags';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { WindowLockBanner } from '@/components/window-lock-banner';
import { CategoryStatsTable } from './category-stats-table';
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
  // Initial з nav store — refresh повертає на drill-down (Region/Manager/Plan).
  const persistedNav = useAppStore.getState().nav;
  // Visual ієрархія: regionCode → viewRegion; managerLogin (без regionCode) → viewManager.
  const startView: DirView = persistedNav.regionCode
    ? 'viewRegion'
    : persistedNav.managerLogin
      ? 'viewManager'
      : 'dashboard';
  const [view, setView] = useState<DirView>(startView);
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>(persistedNav.regionCode || '');
  const [selectedManagerLogin, setSelectedManagerLogin] = useState<string>(persistedNav.managerLogin || '');
  const [selectedSegmentForManager, setSelectedSegmentForManager] = useState<string>(persistedNav.segmentCode || '');

  const { user, currentPeriod, liveMode, setNav } = useAppStore();
  // Wrappers — синхронізують локальний state + persistent nav store.
  const goToRegion = (code: string) => {
    setSelectedRegionCode(code);
    setView('viewRegion');
    setNav({ regionCode: code, managerLogin: undefined, segmentCode: undefined });
  };
  const goToManager = (login: string, segCode?: string) => {
    setSelectedManagerLogin(login);
    setSelectedSegmentForManager(segCode || '');
    setView('viewManager');
    setNav({ regionCode: undefined, managerLogin: login, segmentCode: segCode });
  };
  const goToDashboard = () => {
    setView('dashboard');
    setSelectedRegionCode('');
    setSelectedManagerLogin('');
    setSelectedSegmentForManager('');
    setNav({ regionCode: undefined, managerLogin: undefined, segmentCode: undefined });
  };
  const periodKey = currentPeriod.month.slice(0, 7);
  // Динамічний план: для NEURONOX тощо plan=fact дзеркально. Прокидуємо у
  // BrandRegionGroup + RegionAccordion.
  const { dynamicSegments } = useDynamicPlanSegments(currentPeriod.month);
  // ⚠️ asOfIso ЗАВЖДИ передаємо щоб 1С повертала факт по обраному діапазону
  const asOfIso = liveMode
    ? new Date().toISOString().slice(0, 10)
    : currentPeriod.weekEnd;

  const { data: regionResp, loading, error, refetch } = useOneCData(
    'getRegionData',
    user ? { login: user.login, period: periodKey, asOfDate: asOfIso } : null,
    { isEmptyResponse: (r) => !r?.regions || r.regions.length === 0 },
  );
  const adapted = useMemo(() => regionResp ? adaptRegionData(regionResp) : null, [regionResp]);
  const company = useMemo(() => adapted ? aggregateCompany(adapted.regions) : null, [adapted]);

  const handleManualRetry = () => { refetch(); };

  // «Оновити» — повний хард-рефреш всіх SWR-ключів дашборду. Без цього
  // refetch скидав тільки getRegionData, а CategoryStatsTable + RegionStats +
  // planAggregate сиділи у 5хв кеші і виглядали «не оновлюються».
  const { mutate: swrMutate } = useSWRConfig();
  const handleRefreshAll = useCallback(() => {
    swrMutate(
      (key) => typeof key === 'string' && (
        key.startsWith('onec|') ||
        key.startsWith('region-stats|') ||
        key.startsWith('agg|')
      ),
      undefined,
      { revalidate: true },
    );
  }, [swrMutate]);

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
  // Dedup логінів — 1С Action 5 іноді повертає одного менеджера у двох
  // регіонах (підтверджено 2026-05-12: 1 дубль на 21 → $17,970 повторного
  // факту в aggregate). Без Set-у backend викликає 1С двічі для того ж
  // менеджера і отримує buyers дублі.
  const allCompanyLogins = useMemo(() => {
    const flat = adapted?.regions.flatMap(r => r.managers.map(m => m.login)).filter(Boolean) ?? [];
    return Array.from(new Set(flat));
  }, [adapted]);
  const { data: planAgg } = usePlanningAggregate(currentPeriod.id, allCompanyLogins.length > 0 ? allCompanyLogins : null, currentPeriod.month);
  const periodKeyForStats = currentPeriod.month.slice(0, 7);
  const { data: companyStats, loading: companyStatsLoading } = useRegionStats(
    allCompanyLogins.length > 0 ? periodKeyForStats : null,
    asOfIso,
    allCompanyLogins.length > 0 ? allCompanyLogins : null,
    planAgg ? {
      forecastClientIds: planAgg.forecastClientIds,
      gapNewClientIds: planAgg.gapNewClientIds,
      gapActivationClientIds: planAgg.gapActivationClientIds,
    } : null,
  );
  // Агрегат plan + fact для CategoryStatsTable: сумарно по компанії (всі сегменти разом)
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
    if (!companyStats) return null;
    const out = {
      active: { factCount: 0, factSum: 0 },
      sleeping: { factCount: 0, factSum: 0 },
      lost: { factCount: 0, factSum: 0 },
      new: { factCount: 0, factSum: 0 },
      none: { factCount: 0, factSum: 0 },
    };
    for (const seg of Object.values(companyStats.bySegment)) {
      for (const cat of ['active','sleeping','lost','new','none'] as const) {
        out[cat].factCount += seg.byCategory[cat].factCount;
        out[cat].factSum   += seg.byCategory[cat].factSum;
      }
    }
    return out;
  }, [companyStats]);
  const aggregatedUnplanned = useMemo(() => {
    if (!companyStats) return null;
    let factCount = 0, factSum = 0;
    for (const seg of Object.values(companyStats.bySegment)) {
      factCount += seg.unplanned?.factCount ?? 0;
      factSum   += seg.unplanned?.factSum   ?? 0;
    }
    return { factCount, factSum };
  }, [companyStats]);

  // ⚠️ ВСІ хуки ВИЩЕ early returns (rules-of-hooks).
  // Effective план: для dynamic-сегментів беремо факт замість 1С-плану.
  const totalPlan = useMemo(() => {
    if (!company) return 0;
    let acc = 0;
    for (const seg of company.segments) {
      acc += dynamicSegments.has(seg.segmentCode) ? seg.factAmount : seg.planAmount;
    }
    return acc;
  }, [company, dynamicSegments]);
  const rawTotalPlan1c = company?.totalPlan ?? 0;
  const hasDynamicDiff = dynamicSegments.size > 0 && Math.abs(rawTotalPlan1c - totalPlan) > 0.5;
  // «Заплановано»/«Запланований %»: для dynamic-сегментів (NEURONOX) внесок =
  // факт (дзеркало plan=fact), а не введений менеджерами фіналізований forecast+gap.
  // Без цього фіналізація NEURONOX роздувала суму й % (баг ITD 2026-07-06).
  const finalizedExpected = useMemo(() => {
    if (!planAgg) return 0;
    if (dynamicSegments.size === 0 || !company) {
      return planAgg.totalForecastFinalized + planAgg.totalGapPotentialFinalized;
    }
    let acc = 0;
    for (const seg of company.segments) {
      if (dynamicSegments.has(seg.segmentCode)) {
        acc += seg.factAmount; // дзеркало
      } else {
        const s = planAgg.bySegment[seg.segmentCode];
        acc += (s?.forecastFinalized ?? 0) + (s?.gapFinalized ?? 0);
      }
    }
    return acc;
  }, [planAgg, dynamicSegments, company]);

  // Σ факт по dynamic-сегментах (NEURONOX) — для рядка «Без динамічного бренду»
  // (той самий елемент що у картках регіонів). Головні числа НЕ чіпаємо.
  const dynFact = useMemo(() => {
    if (!company || dynamicSegments.size === 0) return 0;
    let acc = 0;
    for (const seg of company.segments) if (dynamicSegments.has(seg.segmentCode)) acc += seg.factAmount;
    return acc;
  }, [company, dynamicSegments]);

  // === Sub-views ===
  if (view === 'viewRegion') {
    return (
      <div className="space-y-4">
        <button onClick={goToDashboard} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
    let managerRegion = '';
    let managerRegionCode = '';
    if (adapted) {
      for (const r of adapted.regions) {
        const m = r.managers.find(x => x.login === selectedManagerLogin);
        if (m) {
          managerName = m.name;
          managerRegion = r.regionName;
          managerRegionCode = r.regionCode;
          break;
        }
      }
    }
    return (
      <div className="space-y-4">
        <button onClick={goToDashboard} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до огляду
        </button>
        <ManagerDashboard
          targetUserLogin={selectedManagerLogin}
          targetUserName={managerName}
          targetUserRegion={managerRegion}
          targetUserRegionCode={managerRegionCode}
          initialSegmentCode={selectedSegmentForManager || undefined}
        />
      </div>
    );
  }

  // === Loading skeleton ===
  if (loading && !regionResp) return <DashboardSkeleton role="director" />;

  // Session-expired показуємо через модал у AppHeader (не дубль).
  const errorBanner = error && !error.includes('Сесія завершилась') ? (
    <div className="px-4 py-2 rounded-xl bg-rose-50/60 backdrop-blur-md border border-rose-200/70 text-[12px] text-rose-700 flex items-center gap-2">
      <span>Помилка 1С (getRegionData): {error}</span>
      <button onClick={refetch} className="ml-auto font-semibold underline hover:no-underline">
        Спробувати ще
      </button>
    </div>
  ) : null;

  // loading тепер включає auto-retry (через isEmptyResponse у useOneCData),
  // тому окремий isAutoRetrying flag не потрібен.
  const noData = !loading && !error && (!company || company.regionAggregates.length === 0);

  const totalFact = company?.totalFact ?? 0;
  const totalPct = pctOf(totalFact, totalPlan);
  const totalPrevFact = company?.totalPrevMonthFact ?? 0;
  const totalPrevPlan = company?.totalPrevMonthPlan ?? 0;
  const totalPrevPct = pctOf(totalPrevFact, totalPrevPlan);
  // Б.2: динаміка hero «Факт» = заплановане vs минулий факт (forward-looking).
  // ТІЛЬКИ finalized. ЗАВЖДИ порівнюємо план vs минулий факт — навіть коли
  // план = $0 (тоді dyn = -prevFact, показує наочно «у плані нічого нема»).
  // Без fallback на totalFact щоб label «заплан. vs мин. факт» був стабільний.
  const totalExpectedAmountForDyn = finalizedExpected;
  const dynAmount = totalExpectedAmountForDyn - totalPrevFact;
  const dynBetter = dynAmount >= 0;
  const DynArrow = dynBetter ? TrendingUp : TrendingDown;
  const totalForecastPct = calcForecastPercent(totalFact, totalPlan, passedWD, totalWD);
  // «Запланований %» — ТІЛЬКИ з фіналізованих планів (не чернеток).
  // Семантика: реальне зобов'язання менеджерів, на яке керівник має покладатись.
  // Чернетки можуть змінюватись до останнього дня — їх у звітність не пускаємо.
  const totalExpectedPct = planAgg && totalPlan > 0
    ? (finalizedExpected / totalPlan) * 100
    : null;
  // Унікальні логіни — менеджер у 2 регіонах (приклад: Пашковська) не лічиться двічі.
  // ⚠️ БЕЗ useMemo бо early returns вище (loading guard на line 249) роблять
  // hook count різним між рендерами → React error #310. Inline IIFE дешевий.
  const totalManagers = (() => {
    const set = new Set<string>();
    for (const r of adapted?.regions ?? []) {
      for (const m of r.managers ?? []) {
        if (m.login) set.add(m.login);
      }
    }
    return set.size;
  })();

  return (
    <div className="space-y-8">
      <MaintenanceBanner />
      <WindowLockBanner />
      {errorBanner}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white shadow-lg shadow-emet-blue/15">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Огляд по представництвах</h1>
          <p className="text-[12px] text-muted-foreground">
            {company?.regionAggregates.length ?? 0} {(company?.regionAggregates.length ?? 0) === 1 ? 'регіон' : 'регіонів'}
            {' · '}{totalManagers} менеджерів · {periodLabel}
          </p>
        </div>
        {!loading && (
          <button
            onClick={handleRefreshAll}
            title="Оновити всі дані (1С + статистика регіонів)"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-emet-blue transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Оновити
          </button>
        )}
      </div>

      {loading && (
        <div className="glass-card p-12 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emet-blue" />
            <p className="text-[13px] font-medium text-muted-foreground">Завантажуємо дані компанії…</p>
          </div>
        </div>
      )}
      {noData && (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-[15px] font-bold">Дані по компанії не знайдено</p>
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

      {company && company.regionAggregates.length > 0 && (
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
              label="План представництв"
              value={<span className="amount">{Math.round(totalPlan).toLocaleString('en-US')}</span>}
              caption={(() => {
                // ТІЛЬКИ finalized — це реальне зобов'язання менеджерів.
                // Чернетки до натискання «Фінальне збереження» не йдуть у звітність.
                const totalFin = finalizedExpected;
                return (
                  <span className="space-y-0.5 block">
                    <span className="text-muted-foreground block">{periodLabel} · {workingDaysLabel(totalWD)}</span>
                    <span className="text-muted-foreground block">
                      Заплановано: <span className="amount font-semibold text-foreground">{formatUSD(totalFin)}</span>
                    </span>
                    {hasDynamicDiff && (
                      <span className="text-muted-foreground block" title="1С-план по dynamic-сегментах замінено на факт (plan=fact). Тут — оригінальна сума з 1С.">
                        Повний план з 1С: <span className="amount font-semibold text-foreground">{formatUSD(rawTotalPlan1c)}</span>
                      </span>
                    )}
                    {dynFact > 0.5 && (
                      <span className="text-muted-foreground block" title="Без dynamic-бренду (NEURONOX) — тільки звичайні бренди">
                        Без динамічного: <span className="amount font-semibold text-foreground">{formatPct((totalPlan - dynFact) > 0 ? ((finalizedExpected - dynFact) / (totalPlan - dynFact)) * 100 : 0)}</span> · <span className="amount font-semibold text-foreground">{formatUSD(finalizedExpected - dynFact)}</span> / План <span className="amount font-semibold text-foreground">{formatUSD(totalPlan - dynFact)}</span>
                      </span>
                    )}
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

          {/* Розклад по категоріях клієнтів — агрегат по всій компанії */}
          <CategoryStatsTable
            plan={aggregatedPlan}
            fact={aggregatedFact}
            unplanned={aggregatedUnplanned}
            title={`Компанія · ${totalManagers} менеджерів · ${company.regionAggregates.length} регіонів`}
            loading={companyStatsLoading && !aggregatedFact}
          />

          {/* Готовність планування — overview скільки менеджерів заповнили план.
              Вимкнути → FEATURES.PLANNING_READINESS=false у src/lib/feature-flags.ts */}
          {FEATURES.PLANNING_READINESS && adapted?.regions && (
            <PlanningReadinessCard
              regions={adapted.regions}
              planByLogin={planAgg?.byLogin ?? null}
              dynamicSegments={dynamicSegments}
            />
          )}

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
                    isTrial: m.isTrial,
                  }));
                const regionLogins = Array.from(new Set(region.managers.map(m => m.login).filter(Boolean)));
                // Б.3: regionExpectedAmount = Σ forecast+gap по менеджерам регіону
                // (з planAgg.byLogin). ТІЛЬКИ ФІНАЛІЗОВАНІ — чернетки не входять
                // у «Запл.» прогрес-лінію регіону (мають враховуватись тільки
                // зафіксовані плани, не draft).
                // «Заплановано» БЕЗ dynamic — Σ(forecast+gap) фіналіз. по звичайних
                // сегментах. Головний рядок = це + факт dynamic-сегментів (дзеркало).
                let regionExpectedNonDyn = 0;
                if (planAgg) {
                  for (const login of regionLogins) {
                    const segs = planAgg.byLogin[login.toLowerCase().trim()] || {};
                    for (const [segCode, s] of Object.entries(segs)) {
                      if (dynamicSegments.has(segCode)) continue;
                      if (s.finalized) regionExpectedNonDyn += s.forecast + s.gap;
                    }
                  }
                }
                let regionDynFact = 0;
                if (dynamicSegments.size > 0) {
                  for (const seg of r.segments ?? []) {
                    if (dynamicSegments.has(seg.segmentCode)) regionDynFact += seg.factAmount;
                  }
                }
                const regionExpectedAmount = regionExpectedNonDyn + regionDynFact;
                return (
                  <RegionAccordion
                    key={r.regionCode || r.regionName}
                    aggregate={r}
                    managersBrief={managersBrief}
                    calcPct={calcPctValue}
                    asOfDate={asOfDate}
                    regionLogins={regionLogins}
                    regionExpectedAmount={regionExpectedAmount}
                    regionExpectedNonDyn={regionExpectedNonDyn}
                    dynamicSegments={dynamicSegments}
                    onDrillDown={() => goToRegion(r.regionCode)}
                    onManagerClick={(login) => goToManager(login)}
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
                  unplannedForBrand={companyStats?.bySegment[brand.segmentCode]?.unplanned ?? null}
                  categoriesLoading={companyStatsLoading}
                  planByLogin={planAgg?.byLogin ?? null}
                  dynamicSegments={dynamicSegments}
                  onRegionClick={(code) => goToRegion(code)}
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
