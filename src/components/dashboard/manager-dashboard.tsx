'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  SEGMENTS, type ClientCategoryStats,
  isDemoLogin, getDemoTMSummaries, getDemoClientStats, getDemoClientsForPlanningResponse,
} from '@/lib/mock-data';
import {
  formatUSD, formatPct, formatDateShort, pctOf, workingDaysLabel,
  calcForecastPercent,
} from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays, getMonthProgressPct } from '@/lib/working-days';
import { useOneCData } from '@/lib/use-onec-data';
import { useClientsForPlanning } from '@/lib/use-clients-for-planning';
import { useRegistryPlans } from '@/lib/use-registry-plans';
import { usePlanningAggregate } from '@/lib/use-planning-aggregate';
import { DashboardSkeleton } from './dashboard-skeleton';
import {
  adaptSalesFact, adaptRegistryPlans, adaptClientsForPlanning,
} from '@/lib/onec-adapters';
import type { TMSummaryCard } from '@/lib/types';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import { BrandRow } from './brand-row';
import { BrandExpandedDetails } from './brand-expanded-details';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { WindowLockBanner } from '@/components/window-lock-banner';
import {
  DollarSign, Target, TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';

interface ManagerDashboardProps {
  /** Якщо передано — режим «перегляд менеджера X» (для РМ або Директора).
   *  Заголовок показує ПІБ цільового менеджера, drill-down у форму = read-only. */
  targetUserLogin?: string;
  targetUserName?: string;
  /** Регіон цільового менеджера — щоб у Supabase users.region не лишався
   *  null при admin/RM drill-down save. Передається з 1С Action 5. */
  targetUserRegion?: string;
  targetUserRegionCode?: string;
  /** Якщо передано — одразу відкриває PlanningForm для вказаного сегмента
   *  (skip dashboard view). Використовується для shortcut «Director → manager → brand
   *  безпосередньо у планування». */
  initialSegmentCode?: string;
}

export function ManagerDashboard({ targetUserLogin, targetUserName, targetUserRegion, targetUserRegionCode, initialSegmentCode }: ManagerDashboardProps = {}) {
  // Initial state читається з nav store (зберігається в sessionStorage),
  // щоб refresh повертав на ту ж форму а не на список брендів. Пріоритет:
  //   1. initialSegmentCode (drill-down з parent dashboard) — явне завдання
  //   2. nav.segmentCode (persisted з минулої сесії того ж tab)
  //   3. порожньо → dashboard view
  const persistedSegment = useAppStore.getState().nav.segmentCode;
  const startSegment = initialSegmentCode ?? (persistedSegment || '');
  const [view, setView] = useState<'dashboard' | 'plan' | 'control'>(startSegment ? 'plan' : 'dashboard');
  const [selectedSegment, setSelectedSegment] = useState(startSegment);
  // Variant A (Sasha 2026-05-06): chevron на BrandRow розкриває деталі по сегменту.
  // Один сегмент за раз — інакше дашборд перетворюється на «гармошку».
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);

  const { currentPeriod, liveMode, user, setNav } = useAppStore();
  // Wrapped setters: оновлюють локальний state + persisted nav.segmentCode.
  const goToPlan = (seg: string) => {
    setSelectedSegment(seg);
    setView('plan');
    setNav({ segmentCode: seg });
  };
  const goToDashboard = () => {
    setView('dashboard');
    setSelectedSegment('');
    setNav({ segmentCode: undefined });
  };
  const effectiveLogin = targetUserLogin || user?.login || 'anonymous';
  // isViewing = «я дивлюсь чужий профіль» (не свій).
  // Якщо РМ клікнув СЕБЕ у списку менеджерів регіону — це його ж план,
  // має бути редагованим, а не read-only.
  const isViewing = !!targetUserLogin && targetUserLogin.toLowerCase().trim() !== (user?.login || '').toLowerCase().trim();
  // DEMO режим: тестові логіни не існують у 1С → не робимо до неї запитів,
  // а показуємо мокові цифри (для презентацій + dev). Реальні 1С-юзери
  // отримують справжні дані. Умова не залежить від targetUserLogin (РМ переглядає
  // менеджера) — для демо РМ це теж буде demo data.
  const isDemo = isDemoLogin(user?.login);
  // Зріз даних: live → сьогодні, інакше → кінець обраного фільтру.
  // useMemo щоб identity Date була стабільна між рендерами (інакше React Compiler
  // не може мемоізувати залежний summaries useMemo).
  // ⚠️ Парсимо weekEnd вручну (без `new Date(string)`) — UTC-зсув може дати
  // попередній день на серверах поза UTC. Та сама схема як на РМ/Director.
  const asOfDate = useMemo(() => {
    if (liveMode) return new Date();
    const [y, m, d] = currentPeriod.weekEnd.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  }, [liveMode, currentPeriod.weekEnd]);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);
  const periodMonthLabel = getMonthName(asOfDate.getFullYear(), asOfDate.getMonth());
  const totalWorkingDaysInMonth = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());

  // === ETAP 1. Action 2 (getClientsForPlanning) — повний список клієнтів менеджера ===
  // SWR кешує per login. Передаємо у PlanningForm через prop, плюс використовуємо
  // тут для:
  //   1) ClientStatsCard (категорії клієнтів — active/sleeping/new counts)
  //   2) clientIds для Action 3 (щоб отримати ВСІХ покупців а не лише плану)
  //   3) cross-reference у формі — визначити «незапланованих» по категорії
  const {
    data: realClientsResponse,
    loading: clientsLoading,
    error: clientsError,
    refetch: refetchClients,
  } = useClientsForPlanning(!isDemo && effectiveLogin !== 'anonymous' ? effectiveLogin : null);
  const clientsResponse = isDemo ? getDemoClientsForPlanningResponse() : realClientsResponse;

  // === ETAP 2. Action 3 (getSalesFact) ===
  // ⚠️ clientIds = ВСІ клієнти менеджера (з Action 2). Тоді clients[] у відповіді
  //    містить усіх покупців місяця, а не тільки запланованих. Це потрібно щоб
  //    визначити «незапланованих» (купили без плану) і розкласти по категоріях.
  // Послідовність: чекаємо Action 2 → беремо всі clientId-и → Action 3.
  const periodKey = currentPeriod.month.slice(0, 7); // "2026-05"
  // ⚠️ ЗАВЖДИ передаємо asOfDate у Action 3: live → today, інакше → дата з фільтра.
  // Якщо undefined — 1С повертає факт за весь місяць, тому фільтр і live дають
  // ОДНАКОВІ цифри. Така ж логіка вже на РМ/Director, тут раніше була стара.
  const asOfIso = liveMode
    ? new Date().toISOString().slice(0, 10)
    : currentPeriod.weekEnd;
  const allClientIds: string[] = useMemo(() => {
    return clientsResponse?.clients.map(c => c.clientId) ?? [];
  }, [clientsResponse]);
  const { data: factResponse, loading: factLoading, error: factError, refetch: refetchFact } = useOneCData(
    'getSalesFact',
    !isDemo && effectiveLogin !== 'anonymous' && allClientIds.length > 0
      ? { login: effectiveLogin, period: periodKey, clientIds: allClientIds, asOfDate: asOfIso }
      : null,
  );

  // === ETAP 3. Action 4 (getRegistryPlans) — план місяця по ВСІХ менеджерах ===
  // ⚠️ Парсимо date вручну (НЕ через `new Date(string)`) — на серверах поза UTC
  // `new Date("2026-05-01")` може дати квітень при .getMonth() в локальному часі.
  // Guard: якщо persisted state раптом порожній/невалідний — fallback у поточний місяць
  // замість того щоб шити `NaN-NaN-01` у 1С.
  const monthParts = currentPeriod.month.split('-').map(Number);
  const py = Number.isFinite(monthParts[0]) && monthParts[0] > 0 ? monthParts[0] : new Date().getFullYear();
  const pm = Number.isFinite(monthParts[1]) && monthParts[1] > 0 ? monthParts[1] : new Date().getMonth() + 1;
  const dateFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
  const lastDayNum = new Date(py, pm, 0).getDate();
  const dateTo = `${py}-${String(pm).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
  const { data: plansResponse, loading: plansLoading, error: plansError, refetch: refetchPlans } = useRegistryPlans(
    !isDemo && effectiveLogin !== 'anonymous' ? dateFrom : null,
    !isDemo && effectiveLogin !== 'anonymous' ? dateTo : null,
  );

  // === Prev-month fetch (Б.1, 2026-05-13): окремі виклики Action 3 + Action 4
  // для попереднього місяця. Менеджер сам собі — Action 5 не використовуємо.
  // Якщо це травень → prev = квітень.
  const prevPm = pm === 1 ? 12 : pm - 1;
  const prevPy = pm === 1 ? py - 1 : py;
  const prevDateFrom = `${prevPy}-${String(prevPm).padStart(2, '0')}-01`;
  const prevLastDay = new Date(prevPy, prevPm, 0).getDate();
  const prevDateTo = `${prevPy}-${String(prevPm).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;
  const prevPeriodKey = `${prevPy}-${String(prevPm).padStart(2, '0')}`;
  const { data: prevPlansResponse } = useRegistryPlans(
    !isDemo && effectiveLogin !== 'anonymous' ? prevDateFrom : null,
    !isDemo && effectiveLogin !== 'anonymous' ? prevDateTo : null,
  );
  const { data: prevFactResponse } = useOneCData(
    'getSalesFact',
    !isDemo && effectiveLogin !== 'anonymous' && allClientIds.length > 0
      ? { login: effectiveLogin, period: prevPeriodKey, clientIds: allClientIds, asOfDate: prevDateTo }
      : null,
  );

  // Map { segmentCode → planAmount } для поточного користувача.
  // Нормалізуємо логіни до lower-case з обох сторін.
  const effectiveLoginLower = effectiveLogin.toLowerCase().trim();

  // Auto-retry для Action 4: до 3 спроб з backoff якщо 1С повернула порожній
  // plans[] для нашого login. Аналогічно до Action 5 (region) — на першому
  // запиті після логіну 1С іноді не встигає індексу.
  const [planRetryAttempt, setPlanRetryAttempt] = useState(0);
  useEffect(() => {
    if (!plansResponse || plansLoading || plansError) return;
    if (planRetryAttempt >= 3) return;
    const myPlans = plansResponse.plans?.filter(p =>
      (p.managerLogin || '').toLowerCase().trim() === effectiveLoginLower,
    ) ?? [];
    if (myPlans.length === 0) {
      const delay = planRetryAttempt === 0 ? 1200 : planRetryAttempt === 1 ? 2500 : 5000;
      const t = setTimeout(() => {
        setPlanRetryAttempt(n => n + 1);
        refetchPlans();
      }, delay);
      return () => clearTimeout(t);
    }
  }, [plansResponse, plansLoading, plansError, effectiveLoginLower, planRetryAttempt, refetchPlans]);
  // Reset retry counter коли план з'явився або змінився login
  useEffect(() => {
    setPlanRetryAttempt(0);
  }, [effectiveLoginLower]);
  const myPlansBySegment = useMemo(() => {
    if (!plansResponse) return null;
    const map = new Map<string, number>();
    for (const p of adaptRegistryPlans(plansResponse)) {
      if (p.managerLogin === effectiveLoginLower) {
        map.set(p.segmentCode, (map.get(p.segmentCode) ?? 0) + p.planAmount);
      }
    }
    return map;
  }, [plansResponse, effectiveLoginLower]);

  // Prev-month plans per segment (Б.1, 2026-05-13).
  const prevMyPlansBySegment = useMemo(() => {
    if (!prevPlansResponse) return null;
    const map = new Map<string, number>();
    for (const p of adaptRegistryPlans(prevPlansResponse)) {
      if (p.managerLogin === effectiveLoginLower) {
        map.set(p.segmentCode, (map.get(p.segmentCode) ?? 0) + p.planAmount);
      }
    }
    return map;
  }, [prevPlansResponse, effectiveLoginLower]);

  // Prev-month facts per segment (Б.1, 2026-05-13).
  const prevFactsBySegment = useMemo(() => {
    if (!prevFactResponse) return null;
    const map = new Map<string, number>();
    for (const f of adaptSalesFact(prevFactResponse).facts) {
      map.set(f.segmentCode, f.totalAmount);
    }
    return map;
  }, [prevFactResponse]);

  // Агрегати по категоріях клієнтів (для ClientStatsCard) — з реальних даних 1С
  // або з демо-цифр у DEMO режимі.
  const clientStats: ClientCategoryStats | null = useMemo(() => {
    if (isDemo) return getDemoClientStats();
    if (!clientsResponse) return null;
    const all = adaptClientsForPlanning(clientsResponse);
    const active = all.filter(c => c.category === 'active').length;
    const sleeping = all.filter(c => c.category === 'sleeping' || c.category === 'lost').length;
    const newClients = all.filter(c => c.category === 'new').length;
    // `bought` поки не маємо джерела — потрібен крос-метод Action 2 + Action 3
    // (для кожної категорії порахувати скільки купило цього місяця). Зробимо коли
    // буде відповідний метод/агрегація. Поки 0 щоб не вводити в оману.
    return {
      active: { total: active, bought: 0 },
      sleeping: { total: sleeping, bought: 0 },
      newClients: { total: newClients, bought: 0 },
      totalBought: 0,
      totalClients: all.length,
    };
  }, [isDemo, clientsResponse]);

  // План менеджера з нашого Supabase (forecasts + gap_closures) per segment.
  // Використовуємо для:
  //   - hasManagerPlan: true → синя насічка «Запланований» на progress bar
  //   - expectedPercent: (факт + Σ forecast + Σ gap potential) / план × 100%
  const { data: planAgg } = usePlanningAggregate(
    currentPeriod.id,
    !isDemo && effectiveLogin !== 'anonymous' ? [effectiveLogin] : null,
    currentPeriod.month,
  );

  // Будуємо summaries з реальних даних 1С — без mock fallback.
  // Action 4 → план, Action 3 → факт + кількість покупців.
  // PrevMonth поля = 0 поки не готовий Action 5 (UI це коректно обробляє).
  // DEMO: повертаємо мокові summaries з фіксованими цифрами.
  const summaries: TMSummaryCard[] = useMemo(() => {
    if (isDemo) return getDemoTMSummaries(asOfDate);
    const realFacts = factResponse ? adaptSalesFact(factResponse).facts : null;
    const totalWD = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());
    const passedWD = getPassedWorkingDays(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
    const calcPctValue = getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);

    return SEGMENTS.map(seg => {
      const planAmount = myPlansBySegment?.get(seg.code) ?? 0;
      const fact = realFacts?.find(f => f.segmentCode === seg.code);
      const factAmount = fact?.totalAmount ?? 0;
      const clientCount = fact?.totalClientCount ?? 0;

      const factPct = pctOf(factAmount, planAmount);
      const forecastPct = calcForecastPercent(factAmount, planAmount, passedWD, totalWD);

      // План менеджера для цього сегменту з planAgg
      const segPlan = planAgg?.bySegment[seg.code];
      const managerForecast = segPlan?.forecast ?? 0;
      const managerGap = segPlan?.gap ?? 0;
      // Показуємо «Запл.: X%» коли (1) planAgg уже догрузився, і (2) бренд
      // має target. Без guard на planAgg був blink: 0% → реальний %
      // через ~500ms коли SWR закінчував fetch.
      const hasManagerPlan = !!planAgg && planAmount > 0;
      const expectedPct = planAmount > 0
        ? ((managerForecast + managerGap) / planAmount) * 100
        : 0;

      // Prev-month (Б.1): окремі Action 3 + Action 4 виклики з prev period.
      const prevPlanAmount = prevMyPlansBySegment?.get(seg.code) ?? 0;
      const prevFactAmount = prevFactsBySegment?.get(seg.code) ?? 0;
      const prevFactPct = pctOf(prevFactAmount, prevPlanAmount);

      return {
        segmentCode: seg.code,
        segmentName: seg.name,
        planAmount,
        factAmount,
        factPercent: Math.round(factPct * 100) / 100,
        calcPercent: Math.round(calcPctValue * 100) / 100,
        forecastPercent: Math.round(forecastPct * 100) / 100,
        expectedPercent: Math.round(expectedPct * 100) / 100,
        hasManagerPlan,
        deviationPercent: Math.round((forecastPct - calcPctValue) * 100) / 100,
        prevMonthFactAmount: Math.round(prevFactAmount * 100) / 100,
        prevMonthPlanAmount: Math.round(prevPlanAmount * 100) / 100,
        prevMonthFactPercent: Math.round(prevFactPct * 100) / 100,
        weightedPipeline: factAmount * 1.5,
        clientCount,
        status: 'draft',
      } satisfies TMSummaryCard;
    });
  }, [isDemo, asOfDate, factResponse, myPlansBySegment, planAgg, prevMyPlansBySegment, prevFactsBySegment]);
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
  // «Норма на ранок» = % робочих днів станом на вчора. Показуємо завжди.
  const morningPctValue = useMemo(() => {
    const yest = new Date(asOfDate);
    yest.setDate(yest.getDate() - 1);
    return getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), yest);
  }, [asOfDate]);
  const totalForecastPct = summaries.length > 0
    ? summaries.reduce((s, t) => s + t.forecastPercent * t.planAmount, 0) / Math.max(totalPlan, 1)
    : 0;
  // ⚠️ «Запланований %» — пряма формула як у RM/Director:
  //   (Σ forecast + Σ gap) / totalPlan × 100, БЕЗ факту.
  // Раніше була weighted-average per-segment expectedPercent, що давала
  // ІНШУ цифру коли є сегменти з planAmount=0 але plan>0 (вони «зникали»
  // у numerator). Тепер скрізь однакова формула.
  const totalExpectedPct = planAgg && totalPlan > 0
    ? ((planAgg.totalForecast + planAgg.totalGapPotential) / totalPlan) * 100
    : 0;

  if (view === 'plan' && selectedSegment) {
    const seg = summaries.find(s => s.segmentCode === selectedSegment);
    const adaptedFact = factResponse ? adaptSalesFact(factResponse) : null;
    return (
      <PlanningForm
        segmentCode={selectedSegment}
        onBack={goToDashboard}
        readOnly={isViewing && user?.role !== 'admin'}
        targetUserLogin={targetUserLogin}
        targetUserName={targetUserName}
        targetUserRegion={targetUserRegion}
        targetUserRegionCode={targetUserRegionCode}
        clientsResponse={clientsResponse ?? null}
        clientsLoading={clientsLoading}
        clientsError={clientsError}
        planAmount={seg?.planAmount ?? 0}
        factAmount={seg?.factAmount ?? 0}
        prevMonthFactAmount={seg?.prevMonthFactAmount ?? 0}
        prevMonthPlanAmount={seg?.prevMonthPlanAmount ?? 0}
        factResponse={adaptedFact}
      />
    );
  }
  if (view === 'control') return <ClientControlView onBack={() => setView('dashboard')} />;

  // Skeleton при першому завантаженні — поки нема ні плану ні факту з 1С,
  // а у демо-режиму данні мокові (миттєво) і ми сюди не потрапляємо.
  // Альтернатива (mock-based scrum): показувати zero-value cards з спіннером —
  // виглядає зламано. Skeleton чесніший.
  const showSkeleton = !isDemo && (factLoading || plansLoading) && totalPlan === 0 && totalFact === 0;
  if (showSkeleton) return <DashboardSkeleton role="manager" />;

  // Empty state: 1С відповіла, але у менеджера 0 клієнтів закріплено (Action 2 → []).
  // Без цього — пустий дашборд без пояснень, користувач думає що щось зламалось.
  // Не блокуємо стаб для адміна (`isViewing`) — він теж побачить чесне «нема даних».
  const noClientsFromOneC = !isDemo && !clientsLoading && !clientsError
    && clientsResponse !== null && clientsResponse !== undefined
    && clientsResponse.clients.length === 0;
  if (noClientsFromOneC) {
    return (
      <div className="space-y-4">
        {isViewing && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
            <span className="font-semibold">👁 Перегляд менеджера:</span>
            <span className="font-bold">{targetUserName || targetUserLogin}</span>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-[#e2e7ef] p-8 text-center space-y-2">
          <p className="text-[15px] font-bold text-foreground">У 1С не знайдено закріплених клієнтів</p>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
            Логін <span className="font-mono font-semibold">{effectiveLogin}</span> не має жодного клієнта у регістрі планування 1С.
            Зверніться до адміністратора 1С щоб закріпити клієнтів за вашим логіном.
          </p>
          <button onClick={refetchClients}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#066aab] hover:underline">
            <RefreshCw className="h-3 w-3" /> Спробувати ще раз
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MaintenanceBanner />
      <WindowLockBanner />
      {isViewing && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
          <span className="font-semibold">👁 Перегляд менеджера:</span>
          <span className="font-bold">{targetUserName || targetUserLogin}</span>
          <span className="ml-auto text-[11px] text-amber-700">
            {user?.role === 'admin' ? 'режим адміна — редагування дозволено' : 'режим тільки для читання'}
          </span>
        </div>
      )}
      {(factLoading || clientsLoading || plansLoading) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
          <RefreshCw className="h-3 w-3 animate-spin" aria-label="Завантаження" />
          Завантаження даних з 1С...
        </div>
      )}
      {(factError || plansError || clientsError) && (() => {
        // Об'єднуємо всі помилки 1С в один баннер з одним Retry — не псуємо
        // ще більше і так стресовий момент сепаратними червоними блоками.
        const sources: string[] = [];
        if (factError) sources.push(`факт (${factError})`);
        if (plansError) sources.push(`план (${plansError})`);
        if (clientsError) sources.push(`клієнти (${clientsError})`);
        const retryAll = () => {
          if (factError) refetchFact();
          if (plansError) refetchPlans();
          if (clientsError) refetchClients();
        };
        return (
          <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700 flex items-center gap-2">
            <span>Помилка 1С: {sources.join('; ')}</span>
            <button onClick={retryAll} className="ml-auto font-semibold underline hover:no-underline">
              Спробувати ще
            </button>
          </div>
        );
      })()}

      {/* Hero metrics — компактні картки у стилі watermark */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Target />}
          iconColor="text-[#066aab]"
          label="План місяця"
          value={formatUSD(totalPlan)}
          isAmount
          caption={(() => {
            const totalAll = planAgg ? planAgg.totalForecast + planAgg.totalGapPotential : 0;
            const totalFin = planAgg ? planAgg.totalForecastFinalized + planAgg.totalGapPotentialFinalized : 0;
            const draftPart = totalAll - totalFin;
            return (
              <span className="space-y-0.5 block">
                <span className="text-muted-foreground block">{periodMonthLabel} · {workingDaysLabel(totalWorkingDaysInMonth)}</span>
                {totalAll > 0 && (
                  <span className="text-muted-foreground block">
                    Заплановано: <span className="amount font-semibold text-foreground">{formatUSD(totalAll)}</span>
                  </span>
                )}
                {totalFin > 0 && draftPart > 0 && (
                  <span className="text-muted-foreground block text-[10.5px]">
                    з них фінал: <span className="amount font-semibold text-emerald-700">{formatUSD(totalFin)}</span>
                  </span>
                )}
              </span>
            );
          })()}
        />
        <MetricCard
          icon={<DollarSign />}
          iconColor="text-emerald-500"
          label="Факт"
          value={formatUSD(totalFact)}
          isAmount
          caption={totalPrevFact > 0 && (() => {
            // Б.2: порівнюємо ЗАПЛАНОВАНИЙ показник з минулим фактом (forward-looking).
            // Якщо плану ще нема — порівнюємо поточний факт з минулим (з міткою).
            const totalExpected = planAgg
              ? planAgg.totalForecast + planAgg.totalGapPotential
              : 0;
            const hasPlan = totalExpected > 0;
            const compareValue = hasPlan ? totalExpected : totalFact;
            const dyn = compareValue - totalPrevFact;
            const better = dyn >= 0;
            const Arrow = better ? TrendingUp : TrendingDown;
            const label = hasPlan ? 'заплан. vs мин. факт' : 'факт vs мин. факт';
            return (
              <span className="space-y-0.5 block">
                <span className="text-muted-foreground block">
                  Мин. міс.: <span className="amount font-semibold text-foreground whitespace-nowrap">{formatUSD(totalPrevFact)}</span>
                  <span className="whitespace-nowrap"> / <span className="font-semibold text-foreground">{totalPrevPct.toFixed(1)}%</span></span>
                </span>
                <span className={`font-semibold block ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <Arrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                  <span className="amount whitespace-nowrap">{better ? '+' : ''}{formatUSD(dyn)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">{label}</span>
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
              <p className="text-muted-foreground">Норма на ранок: <span className="font-semibold text-foreground">{formatPct(morningPctValue)}</span></p>
              <p className="text-muted-foreground">Прогноз (темп): <span className="font-semibold text-amber-600">{formatPct(totalForecastPct)}</span> · Запланований: <span className="font-semibold text-[#066aab]">{formatPct(totalExpectedPct)}</span></p>
            </div>
          )}
        />
        <ClientStatsCard stats={clientStats ?? { active: { total: 0, bought: 0 }, sleeping: { total: 0, bought: 0 }, newClients: { total: 0, bought: 0 }, totalBought: 0, totalClients: 0 }} />
      </div>

      {/* Control banner — приховано до часу коли вирішимо дизайн (потижневий план?
          новий метод 1С для weekly fact?). Stub-сторінка лишається у роутингу. */}

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
          {summaries.map((tm) => {
            const isExpanded = expandedSegment === tm.segmentCode;
            const adaptedFact = factResponse ? adaptSalesFact(factResponse) : null;
            return (
              <div key={tm.segmentCode}>
                <BrandRow
                  segmentName={tm.segmentName}
                  planAmount={tm.planAmount}
                  factAmount={tm.factAmount}
                  calcPct={tm.calcPercent}
                  asOfDate={asOfDate}
                  expectedPercent={tm.expectedPercent}
                  expectedAmount={(planAgg?.bySegment[tm.segmentCode]?.forecast ?? 0) + (planAgg?.bySegment[tm.segmentCode]?.gap ?? 0)}
                  hasManagerPlan={tm.hasManagerPlan}
                  clientCount={tm.clientCount}
                  prevMonthFactAmount={tm.prevMonthFactAmount}
                  prevMonthFactPercent={tm.prevMonthFactPercent}
                  onClick={() => setExpandedSegment(prev => prev === tm.segmentCode ? null : tm.segmentCode)}
                  readOnly={liveMode}
                  expandable
                  expanded={isExpanded}
                />
                {isExpanded && (
                  <BrandExpandedDetails
                    login={effectiveLogin}
                    segmentCode={tm.segmentCode}
                    segmentName={tm.segmentName}
                    periodId={currentPeriod.id}
                    clientsResponse={clientsResponse ?? null}
                    factResponse={adaptedFact}
                    onPlan={() => goToPlan(tm.segmentCode)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
