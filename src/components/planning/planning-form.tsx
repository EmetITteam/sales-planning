'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type MeetingFormData } from '@/components/meetings/meeting-form';
import { useMeetings } from '@/lib/meetings/use-meetings';
import { formatUSD, formatDate, pctOf } from '@/lib/format';
import { savePlanning, loadPlanning } from '@/lib/api';
import { syncIdsAfterRemove, syncIndicesAfterRemove } from '@/lib/selection-sync';
import { mutate as swrMutate } from 'swr';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { WindowLockBanner } from '@/components/window-lock-banner';
import { finalizePlan, unfinalizePlan } from '@/lib/use-finalization';
import { usePlanningLocks } from './hooks/use-planning-locks';
import { STAGE_OPTIONS, computePeriodStats, formatTrainingOption } from './planning-helpers';
import { usePlanningSave } from './hooks/use-planning-save';
import { usePlanningLoad } from './hooks/use-planning-load';
import { PlanningDialogs } from './planning-dialogs';
import { ClientDataByTmSection } from './sections/client-data-by-tm-section';
import { ForecastSection } from './sections/forecast-section';
import { GapClosureSection } from './sections/gap-closure-section';
import { PlanningMetricsRow } from './sections/planning-metrics-row';
import { compareForecastRows, compareGapRows, isPassiveAmount } from '@/lib/passive-rows';
import { isActiveForBrand } from '@/lib/three-month-rule';
import {
  SEGMENTS, isDemoLogin, getDemoForecastsPETARAN, getDemoGapClosuresPETARAN,
} from '@/lib/mock-data';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptClientsForSegment, adaptClientsForPlanning, adaptTrainings } from '@/lib/onec-adapters';
import {
  getUnplannedBuyersForSegment, splitUnplannedForPlanning,
  groupUnplannedByCategory, categoryLabel,
} from '@/lib/unplanned-buyers';
import type { GetClientsForPlanningResponse } from '@/lib/onec-types';
import type { ForecastRow, GapClosureRow, Client1C, ClientCategorySummary, GapActions, SalesFactResponse } from '@/lib/types';
import {
  ArrowLeft, Save, Check, Lock, Users, RefreshCw, Eye,
  AlertCircle,
} from 'lucide-react';

interface PlanningFormProps {
  segmentCode: string;
  onBack: () => void;
  readOnly?: boolean;
  /**
   * Логін цільового користувача (наприклад коли РМ переглядає чужий план).
   * Якщо не передано — береться поточний логін зі store.
   */
  targetUserLogin?: string;
  /**
   * Повне ім'я цільового користувача (для banner «чий план» зверху форми
   * + щоб у Supabase users.full_name писалось ім'я, а не email).
   */
  targetUserName?: string;
  /** Регіон цільового — щоб users.region не залишався null при save. */
  targetUserRegion?: string;
  targetUserRegionCode?: string;
  /**
   * Клієнти з 1С — приходять з ManagerDashboard через кеш (Zustand).
   * Дозволяє формі відкриватись миттєво (без власного fetch'у). Якщо null —
   * клієнти ще завантажуються (показуємо placeholder).
   */
  clientsResponse?: GetClientsForPlanningResponse | null;
  clientsLoading?: boolean;
  clientsError?: string | null;
  /**
   * План і факт по цьому сегменту (з Action 4 + Action 3, обчислюється на дашборді).
   * Передаємо через prop щоб форма не дублювала fetch.
   */
  planAmount?: number;
  factAmount?: number;
  /** Prev-month dual: для порівняльного рядка у hero-чіпі FACT (Б.8). */
  prevMonthFactAmount?: number;
  prevMonthPlanAmount?: number;
  /**
   * Адаптована відповідь Action 3 (`getSalesFact`) — потрібна щоб у формі
   * показати «незапланованих покупців» (які купили без плану) під списками.
   * null поки 1С не відповіла або у DEMO режимі.
   */
  factResponse?: SalesFactResponse | null;
}

// STAGE_OPTIONS винесено у planning-helpers.ts (Day 6)

export function PlanningForm({
  segmentCode, onBack, readOnly: readOnlyProp = false, targetUserLogin, targetUserName,
  targetUserRegion, targetUserRegionCode,
  clientsResponse = null, clientsLoading = false, clientsError = null,
  planAmount: propPlanAmount = 0, factAmount: propFactAmount = 0,
  prevMonthFactAmount = 0, prevMonthPlanAmount = 0,
  factResponse = null,
}: PlanningFormProps) {
  const segment = SEGMENTS.find(s => s.code === segmentCode);
  const {
    user,
    currentPeriod,
    effectiveLogin,
    readOnly,
    isAdmin,
    isFinalized,
    finalizedAt,
    finalizedBy,
    refetchFinalize,
    isWindowLocked,
    lockEdit,
    lockStage,
    canEditStagesAfterFinalize,
    stageUnlockedAfterFinalize,
    canUnfinalize,
  } = usePlanningLocks({ segmentCode, targetUserLogin, readOnlyProp });

  // Початковий стан — порожньо. Supabase підтягне збережені прогнози у useEffect.
  // Auto-populate з активних клієнтів 1С — нижче (коли 1С відповіла).
  // У DEMO для PETARAN одразу пре-заповнюємо мок-showcase щоб бачити заповнену форму.
  const isDemoSession = isDemoLogin(user?.login);
  const [forecasts, setForecasts] = useState<ForecastRow[]>(() =>
    isDemoSession && segmentCode === 'PETARAN' ? getDemoForecastsPETARAN() : []
  );
  const [gapClosures, setGapClosures] = useState<GapClosureRow[]>(() =>
    isDemoSession && segmentCode === 'PETARAN' ? getDemoGapClosuresPETARAN() : []
  );
  const [gapActions, setGapActions] = useState<GapActions>({ action1: '', action2: '', action3: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [gapSearchOpen, setGapSearchOpen] = useState(false);
  // saving / saveResult / lastSavedAt + handleSave винесено у usePlanningSave (Day 7)
  const {
    saving,
    saveResult,
    lastSavedAt,
    setSaveResult,
    setLastSavedAt,
    handleSave: doSave,
  } = usePlanningSave({
    segmentCode,
    currentPeriod,
    targetUserLogin,
    targetUserName,
    targetUserRegion,
    targetUserRegionCode,
  });
  // Підтвердження видалення — заміняє blocking browser `confirm()`. type вказує
  // куди застосовувати: forecast row (по clientId) або gap closure (по index).
  // bulk-варіанти — для multi-select видалення з чекбоксів.
  const [pendingDelete, setPendingDelete] = useState<
    | { type: 'forecast'; clientId: string; clientName: string }
    | { type: 'gap'; index: number; clientName: string }
    | { type: 'forecast-bulk'; ids: string[] }
    | { type: 'gap-bulk'; indices: number[] }
    | null
  >(null);
  // Multi-select для bulk-видалення. Окремі сети для двох блоків.
  const [selectedForecasts, setSelectedForecasts] = useState<Set<string>>(new Set());
  const [selectedGaps, setSelectedGaps] = useState<Set<number>>(new Set());
  // Прапорець: чи закінчилась спроба завантаження з Supabase. Якщо так і даних
  // нема — auto-populate Прогноз з реальних активних клієнтів 1С.
  const [supabaseLoaded, setSupabaseLoaded] = useState(false);
  // ID-и клієнтів які РЕАЛЬНО збережені у Supabase (не auto-populated).
  // Використовуємо тільки для розрахунку «Незаплановані» — щоб блок поводився
  // консистентно з дашбордом (де теж рахується по Supabase плану).
  // Інакше: відкрив форму → auto-populate додав клієнтів → unplanned зник
  // навіть для тих хто реально не у плані.
  const [persistedClientIds, setPersistedClientIds] = useState<Set<string>>(new Set());
  // ⚠️ Маркер "форма вже хоч раз зберігалась" (period_summaries record існує).
  // Якщо true — auto-populate НЕ запускається (інакше після видалення +
  // перемикання дати клієнти повертаються знов, бо load повертає [] і
  // auto-populate думає що це 'перше відкриття').
  const [formEverEdited, setFormEverEdited] = useState(false);
  // manuallyEditedFactRows тримає clientId1c рядків де менеджер сам
  // редагував поле «Факт» через updateForecast/updateGap. Скидаємо у load hook.
  const [manuallyEditedFactRows, setManuallyEditedFactRows] = useState<Set<string>>(new Set());

  // FEATURE: завантаження збережених даних з Supabase.
  // При відкритті форми (та при зміні бренду чи менеджера) — скролимо нагору.
  // Без цього перехід «Перейти у форму» з середини дашборду залишав scroll
  // position попередньої сторінки, і форма відкривалась посередині.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [segmentCode, effectiveLogin]);

  // Load з Supabase + reset stale state — винесено у usePlanningLoad (Day 7).
  usePlanningLoad({
    segmentCode,
    currentPeriodId: currentPeriod.id,
    effectiveLogin,
    setForecasts,
    setGapClosures,
    setGapActions,
    setSupabaseLoaded,
    setPersistedClientIds,
    setSelectedForecasts,
    setSelectedGaps,
    setFormEverEdited,
    setManuallyEditedFactRows,
    setLastSavedAt,
  });

  // handleSave — обгортка над doSave з usePlanningSave (Day 7).
  // Передаємо stateful залежності explicit щоб уникнути stale-closure.
  const handleSave = () => doSave({
    supabaseLoaded,
    forecasts,
    gapClosures,
    gapActions,
    formEverEdited,
    persistedClientIds,
    setFormEverEdited,
    setPersistedClientIds,
  });

  // ---- Фіналізація плану (Етап 2 Пакету А) ----
  const [finalizing, setFinalizing] = useState(false);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const doFinalize = async () => {
    setFinalizing(true);
    // ⚠️ Спочатку зберегти поточний state форми (Day 14 fix, 2026-05-14).
    // Інакше менеджер натискає «Фінальне збереження» без попереднього
    // «Зберегти чернетку» → finalize endpoint ставить тільки finalized_at,
    // а forecasts/gap_closures лишаються порожніми → план фіналізований
    // з 0 рядків (втрата даних). Виявлено на тесті sm.odessa2 × PETARAN.
    const isExplicitClearAll = formEverEdited || persistedClientIds.size > 0
      || forecasts.length > 0 || gapClosures.length > 0;
    const saveResultLocal = await savePlanning({
      segmentCode,
      periodId: currentPeriod.id,
      period: { weekStart: currentPeriod.weekStart, weekEnd: currentPeriod.weekEnd, month: currentPeriod.month },
      targetLogin: targetUserLogin || undefined,
      userMeta: targetUserLogin ? {
        fullName: targetUserName || targetUserLogin,
        region: targetUserRegion || undefined,
        regionCode: targetUserRegionCode || undefined,
      } : undefined,
      forecasts,
      gapClosures,
      gapActions,
      clearAll: isExplicitClearAll,
    });
    if (!saveResultLocal.success) {
      setFinalizing(false);
      setSaveResult({ ok: false, msg: 'Не вдалось зберегти перед фіналізацією: ' + (saveResultLocal.error || 'unknown') });
      setTimeout(() => setSaveResult(null), 4000);
      return;
    }
    if (saveResultLocal.savedAt) setLastSavedAt(saveResultLocal.savedAt);
    // Day 14: дзеркалити post-save side-effects з handleSave щоб state був консистентним.
    setFormEverEdited(true);
    const justSaved = new Set<string>();
    for (const f of forecasts) if (f.clientId1c) justSaved.add(f.clientId1c);
    for (const g of gapClosures) if (g.clientId1c) justSaved.add(g.clientId1c);
    setPersistedClientIds(justSaved);
    // Invalidate dashboard caches — дашборд має побачити нові цифри одразу.
    swrMutate(
      (key) => typeof key === 'string' && (key.startsWith('agg|') || key.startsWith('region-stats|')),
      undefined,
      { revalidate: true },
    );
    // Тільки після успішного save — викликаємо finalize.
    const result = await finalizePlan({
      periodId: currentPeriod.id,
      month: currentPeriod.month,
      segmentCode,
      targetLogin: targetUserLogin || undefined,
    });
    setFinalizing(false);
    if (result.ok) {
      refetchFinalize();
      const c = saveResultLocal.counts;
      const savedMsg = c ? ` (прогноз ${c.forecasts}, розрив ${c.gaps})` : '';
      setSaveResult({ ok: true, msg: 'План фіналізовано' + savedMsg });
    } else {
      setSaveResult({ ok: false, msg: result.error });
    }
    setTimeout(() => setSaveResult(null), 3000);
  };
  const handleFinalize = () => {
    // Day 14 fix: показуємо діалог ЗАВЖДИ — навіть при повному плані
    // (менеджер має свідомо підтвердити, що це фінал). Текст діалогу
    // різниться залежно від повноти.
    setShowIncompleteConfirm(true);
  };
  const handleUnfinalize = async () => {
    if (!isAdmin) return;
    setFinalizing(true);
    const result = await unfinalizePlan({
      periodId: currentPeriod.id,
      month: currentPeriod.month,
      segmentCode,
      targetLogin: targetUserLogin || undefined,
    });
    setFinalizing(false);
    if (result.ok) {
      refetchFinalize();
      setSaveResult({ ok: true, msg: 'План розфіналізовано' });
    } else {
      setSaveResult({ ok: false, msg: result.error });
    }
    setTimeout(() => setSaveResult(null), 3000);
  };

  const planAmount = propPlanAmount;
  const factAmount = propFactAmount;

  // Розрахунок очікуваного / факт / відхилення по поточному періоду —
  // винесено у planning-helpers.ts (Day 6 рефактору).
  const {
    periodMonth,
    periodEndDate,
    totalWorkingDays,
    passedWorkingDays,
    periodLabel,
    expectedAmount,
    expectedPct,
    factPct,
    deviation,
  } = computePeriodStats({ currentPeriod, planAmount, factAmount });

  // Сортовані прогнози: активні зверху → passive (amount=0) → completed вниз.
  // У межах кожної групи — алфавіт по clientName.
  // Passive («без плану») окремою групою щоб око одразу бачило хто реально
  // запланований, а хто «у резерві».
  const sortedForecasts = useMemo(() => {
    return [...forecasts].sort(compareForecastRows);
  }, [forecasts]);

  // Аналогічно для Закриття розриву.
  // Тримаємо оригінальний index — потрібен для updateGap/removeGapClosure
  // (selectedGaps теж по index, але sync через sortedGapClosures.findIndex
  // ламає логіку). Тому сортування лише ВІЗУАЛЬНЕ — повертаємо пари
  // {row, originalIndex}.
  const sortedGapClosures = useMemo(() => {
    return gapClosures
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((a, b) => compareGapRows(a.row, b.row));
  }, [gapClosures]);

  const forecastTotal = forecasts.reduce((s, f) => s + f.forecastAmount, 0);
  const forecastFactTotal = forecasts.reduce((s, f) => s + f.factAmount, 0);
  const pendingForecastTotal = forecasts.filter(f => !f.completed).reduce((s, f) => s + f.forecastAmount, 0);

  const gapTotal = gapClosures.reduce((s, g) => s + g.potentialAmount, 0);
  const gapFactTotal = gapClosures.reduce((s, g) => s + g.factAmount, 0);

  // Розрив = очікуване на період − факт
  const gapFromExpected = Math.max(0, expectedAmount - factAmount);
  // Розрив після прогнозу = розрив − прогноз незавершених − факт закриття розриву
  const gapAfterForecast = Math.max(0, gapFromExpected - pendingForecastTotal - gapFactTotal);

  // Клієнти приходять з ManagerDashboard через prop (кеш у Zustand store).
  // Власного fetch'у тут немає — це робить дашборд один раз при заході менеджера.
  const segmentClients: Client1C[] = useMemo(() => {
    if (!clientsResponse) return [];
    // adaptClientsForSegment повертає ВСІХ клієнтів менеджера, з нулями для тих
    // хто не купував цей бренд. Фільтруємо — тут потрібні тільки реальні клієнти
    // цього сегменту (з ненульовою датою останньої покупки).
    return adaptClientsForSegment(clientsResponse, segmentCode)
      .filter(c => c.lastPurchaseDate !== null);
  }, [clientsResponse, segmentCode]);

  // Усі клієнти менеджера — для пошукового модала «Закриття розриву»,
  // де можна додати будь-якого клієнта незалежно від того чи купував він цей бренд.
  const allManagerClients: Client1C[] = useMemo(() => {
    return clientsResponse ? adaptClientsForPlanning(clientsResponse) : [];
  }, [clientsResponse]);

  // ⚠️ Збагачуємо завантажені forecasts/gapClosures даними lastPurchaseDate/Amount
  // з 1С Action 2. Без цього у формі рядки показували «Ост: — · $0» бо при load
  // з Supabase ставили null/0 (lastPurchase у forecasts table НЕ зберігається).
  // segmentClients може прийти ПІСЛЯ Supabase load — тому окремий useEffect.
  //
  // Правила:
  //   - Enrich ТІЛЬКИ зі segmentClients (брендозалежні дані). НЕ використовуємо
  //     allManagerClients — інакше клієнт що ніколи не купляв цей бренд отримає
  //     дату/суму з ІНШОГО бренду (плутає менеджера: "звідки $318 з 12.05?").
  //   - НЕ enrich-имо рядки з manually_added=true — менеджер сама вирішила
  //     додати клієнта вручну, поважаємо її введення (порожні або власні суми).
  useEffect(() => {
    if (!supabaseLoaded) return;
    if (segmentClients.length === 0) return;
    const byId = new Map<string, { date: string | null; amount: number }>();
    for (const c of segmentClients) byId.set(c.clientId, { date: c.lastPurchaseDate, amount: c.lastPurchaseAmount });
    setForecasts(prev => {
      let changed = false;
      const next = prev.map(f => {
        if (f.manuallyAdded) return f;
        const enrich = byId.get(f.clientId1c);
        if (!enrich) return f;
        if (f.lastPurchaseDate === enrich.date && f.lastPurchaseAmount === enrich.amount) return f;
        changed = true;
        return { ...f, lastPurchaseDate: enrich.date, lastPurchaseAmount: enrich.amount };
      });
      return changed ? next : prev;
    });
    setGapClosures(prev => {
      let changed = false;
      const next = prev.map(g => {
        if (g.manuallyAdded) return g;
        const enrich = byId.get(g.clientId1c);
        if (!enrich) return g;
        if (g.lastPurchaseDate === enrich.date && g.lastPurchaseAmount === enrich.amount) return g;
        changed = true;
        return { ...g, lastPurchaseDate: enrich.date, lastPurchaseAmount: enrich.amount };
      });
      return changed ? next : prev;
    });
  }, [supabaseLoaded, segmentClients]);

  // Тренінги для блоку «Закриття розриву» — Action 6 з 1С.
  // ⚠️ Пріоритет regionCode: цільовий менеджер (коли admin/RM drill-down)
  // → свій regionCode (коли менеджер сам редагує). Без цього admin Малькова
  // переглядаючи план одеського менеджера не отримувала тренінги (її власний
  // regionCode може бути порожній), і Select показував raw trainingId «4635».
  const effectiveRegionCode = targetUserRegionCode || user?.regionCode;
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: trainingsResponse } = useOneCData(
    'getTrainings',
    effectiveRegionCode ? { regionCode: effectiveRegionCode, dateFrom: todayIso } : null,
  );
  const trainings = useMemo(() => {
    return trainingsResponse ? adaptTrainings(trainingsResponse) : [];
  }, [trainingsResponse]);

  // === Action 7: checkActivities — автоматичне підтвердження stageDone ===
  // 1С перевіряє чи був завершений Дзвінок/Зустріч менеджера з клієнтом
  // у поточному місяці. Якщо так — у формі ставимо бейдж «Виконано»
  // (зелений) замість «Очікується» (жовтий). Менеджеру НЕ треба клікати.
  //
  // Викликається тільки для клієнтів з stage ∈ {Дзвінок, Зустріч} (інші
  // етапи — Навчання, Мессенджер — не автоматизуються бо у 1С не фіксуються).
  const periodYM = currentPeriod.month.slice(0, 7);
  const activityClientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of forecasts) {
      if (!f.clientId1c) continue;
      if (f.stage === 'Дзвінок' || f.stage === 'Зустріч') ids.add(f.clientId1c);
    }
    for (const g of gapClosures) {
      if (!g.clientId1c) continue;
      if (g.stage === 'Дзвінок' || g.stage === 'Зустріч') ids.add(g.clientId1c);
    }
    return Array.from(ids).sort();
  }, [forecasts, gapClosures]);

  const { data: activitiesResponse } = useOneCData(
    'checkActivities',
    activityClientIds.length > 0
      ? { login: effectiveLogin, period: periodYM, clientIds: activityClientIds }
      : null,
  );

  // Map<clientId, {hasCall, hasMeeting}> для швидкого lookup
  const activitiesByClient = useMemo(() => {
    const map = new Map<string, { hasCall: boolean; hasMeeting: boolean }>();
    if (!activitiesResponse?.activities) return map;
    for (const a of activitiesResponse.activities) {
      map.set(a.clientId, { hasCall: a.hasCall, hasMeeting: a.hasMeeting });
    }
    return map;
  }, [activitiesResponse]);

  // Авто-set stageDone=true коли 1С підтвердив завершений Дзвінок/Зустріч.
  // ONE-WAY sync: ніколи не скидаємо stageDone=true → false (поважаємо
  // ручне підтвердження менеджера).
  //
  // Auto-persist: одразу після set у state — fire-and-forget POST до
  // `/api/planning/confirm-activities` що оновлює `stage_done=true` тільки
  // для цих конкретних рядків. Це безпечно (не зачипає інші поля state)
  // і дозволяє наступному відкриттю форми відразу показати «Виконано»
  // без чекання на 1С response.
  //
  // confirmedRef — пам'ятаємо що вже відправили щоб не дзвонити повторно
  // на кожному ререндері.
  const confirmedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Якщо змінився effectiveLogin/segment/period — скидаємо memo
    confirmedRef.current = new Set();
  }, [segmentCode, currentPeriod.id, effectiveLogin]);

  useEffect(() => {
    if (activitiesByClient.size === 0) return;

    // Plan-vs-fact tracking (Етап 4 Пакету А, 2026-05-13):
    // Збираємо ВСІ клієнтів у яких 1С повернула hasCall/hasMeeting,
    // незалежно від запланованого етапу. Backend пише actual_had_* для
    // аналітики, плюс stage_done якщо planned stage співпав з фактом.
    const toPersist: Array<{
      block: 'forecast' | 'gap';
      clientId1c: string;
      hasCall: boolean;
      hasMeeting: boolean;
      plannedStage: string;
    }> = [];

    const buildItem = (
      block: 'forecast' | 'gap',
      row: { clientId1c: string; stage: string },
    ): typeof toPersist[number] | null => {
      const act = activitiesByClient.get(row.clientId1c);
      if (!act || (!act.hasCall && !act.hasMeeting)) return null;
      // Memo-key включає фактичні прапори — якщо 1С згодом додасть meeting
      // до існуючого call, ми викличемо backend знов (інакше new actual_had_meeting
      // не запишеться у БД).
      const memoKey = `${block}|${row.clientId1c}|${act.hasCall ? 'c' : ''}${act.hasMeeting ? 'm' : ''}|${row.stage}`;
      if (confirmedRef.current.has(memoKey)) return null;
      confirmedRef.current.add(memoKey);
      return {
        block,
        clientId1c: row.clientId1c,
        hasCall: !!act.hasCall,
        hasMeeting: !!act.hasMeeting,
        plannedStage: row.stage || '',
      };
    };

    // Локальний state — оновлюємо stageDone=true ТІЛЬКИ коли planned stage
    // співпадає з фактом (cross-channel separation: дзвінок не підтверджується
    // мітингом). actual_had_* — це БД-only, не у state форми.
    setForecasts(prev => {
      let changed = false;
      const next = prev.map(f => {
        const act = activitiesByClient.get(f.clientId1c);
        if (!act) return f;
        // Збираємо для persist (незалежно від stageDone — actual_* може ще не записано)
        const item = buildItem('forecast', f);
        if (item) toPersist.push(item);
        // Локальний stageDone — тільки якщо match і ще не done
        if (f.stageDone) return f;
        const match = (f.stage === 'Дзвінок' && act.hasCall) || (f.stage === 'Зустріч' && act.hasMeeting);
        if (!match) return f;
        changed = true;
        return { ...f, stageDone: true };
      });
      return changed ? next : prev;
    });
    setGapClosures(prev => {
      let changed = false;
      const next = prev.map(g => {
        const act = activitiesByClient.get(g.clientId1c);
        if (!act) return g;
        const item = buildItem('gap', g);
        if (item) toPersist.push(item);
        if (g.stageDone) return g;
        const match = (g.stage === 'Дзвінок' && act.hasCall) || (g.stage === 'Зустріч' && act.hasMeeting);
        if (!match) return g;
        changed = true;
        return { ...g, stageDone: true };
      });
      return changed ? next : prev;
    });

    // Fire-and-forget auto-persist. Помилки логуємо у консоль — стейт уже
    // оновлено локально, тож менеджер бачить «Виконано» все одно. Backend
    // пише stage_done (якщо match) і actual_had_* (завжди коли є активність).
    if (toPersist.length > 0) {
      fetch('/api/planning/confirm-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: currentPeriod.id,
          period: { month: currentPeriod.month },
          segmentCode,
          targetLogin: targetUserLogin || undefined,
          confirmations: toPersist,
        }),
      }).catch(err => console.warn('[confirm-activities] failed', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesByClient]);

  // === Незаплановані покупці по сегменту (з 1С) ===
  // Крос-референс Action 2 (категорії) + Action 3 (хто купував) − план менеджера
  // (forecasts ∪ gapClosures). Активні незаплановані → блок «Прогноз»,
  // решта (Сплячий/Втрачений/Новий/БЗ) → блок «Закриття розриву».
  const plannedClientIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of forecasts) if (f.clientId1c) set.add(f.clientId1c);
    for (const g of gapClosures) if (g.clientId1c) set.add(g.clientId1c);
    return set;
  }, [forecasts, gapClosures]);

  // Незаплановані рахуємо проти ТОГО ЩО У SUPABASE, а не проти поточного state.
  // Інакше auto-populate додає клієнтів у forecasts і блок «Незаплановані»
  // зникає миттєво, навіть якщо вони реально ще не у плані.
  //
  // ⚠️ Гард на supabaseLoaded: поки Supabase не відповіла — persistedClientIds
  // порожній Set, тому ВСІ покупці виглядали б як «незаплановані» і блок
  // блимав би на секунду. Чекаємо завантаження.
  const unplannedAll = useMemo(() => {
    if (!supabaseLoaded) return [];
    return getUnplannedBuyersForSegment(allManagerClients, factResponse, segmentCode, persistedClientIds);
  }, [supabaseLoaded, allManagerClients, factResponse, segmentCode, persistedClientIds]);

  const unplannedSplit = useMemo(() => splitUnplannedForPlanning(unplannedAll), [unplannedAll]);
  const unplannedByCategory = useMemo(() => groupUnplannedByCategory(unplannedAll), [unplannedAll]);

  // === Активні vs Неактивні ПО ЦЬОМУ БРЕНДУ ===
  // Логіка погоджена з директором продажу:
  //   «активні по бренду» = купив у вікні [planMonth − 3 міс, planMonthStart)
  //   «неактивні по бренду» = решта → блок «Закриття розриву»
  //
  // ⚠️ Cutoff FIXED на плановий місяць (не «90 днів від сьогодні»). Без цього
  // класифікація плавала: 12.05 клієнт у gap, 14.05 (після покупки 13.05) — у
  // forecast. Виникали дублі коли менеджер відкривала форму повторно.
  // Виправлено 2026-05-14 — див. tests/three-month-rule.test.ts.
  //
  // Купівлі ВСЕРЕДИНІ планового місяця → не міняють бакет (це факт виконання,
  // а не зміна категорії).
  const planMonth = currentPeriod.month;
  const activeClients = segmentClients.filter(c => isActiveForBrand(c.lastPurchaseDate, planMonth));
  const sleepingClients = segmentClients.filter(c => !isActiveForBrand(c.lastPurchaseDate, planMonth));

  // Map clientId → factAmount з 1С Action 3 для ПОТОЧНОГО сегмента.
  // Потрібно щоб у колонці ФАКТ кожного рядка показалась справжня сума
  // продажу. Без цього поле 0 (default з loadPlanning/auto-populate),
  // навіть коли клієнт реально купив цього місяця.
  const factByClientId = useMemo(() => {
    const map = new Map<string, number>();
    if (!factResponse) return map;
    const segFact = factResponse.facts.find(f => f.segmentCode === segmentCode);
    if (!segFact) return map;
    for (const c of segFact.clients) {
      if (c.clientId) map.set(c.clientId, c.amount);
    }
    return map;
  }, [factResponse, segmentCode]);

  // ⚠️ Sync per-row factAmount з 1С (Action 3) — ТІЛЬКИ якщо рядок не був
  // вручну змінений менеджером. Інакше SWR revalidation (focus/reconnect)
  // перетирала ручний ввод. Менеджер ввів свій факт → focus tab → факт
  // повернувся до 1С-значення.
  useEffect(() => {
    if (factByClientId.size === 0) return;
    setForecasts(prev => {
      let changed = false;
      const next = prev.map(f => {
        if (manuallyEditedFactRows.has(f.clientId1c)) return f; // skip manual edit
        const realFact = factByClientId.get(f.clientId1c) ?? 0;
        // completed = факт >= прогноз ⚠️ ТІЛЬКИ якщо план finalized.
        // До фінал — менеджер має можливість правити рядок навіть якщо клієнт
        // уже купив (бо план чернетковий, нічого не «зафіксовано»).
        const newCompleted = isFinalized && realFact >= f.forecastAmount;
        if (realFact !== f.factAmount || newCompleted !== f.completed) {
          changed = true;
          return { ...f, factAmount: realFact, completed: newCompleted };
        }
        return f;
      });
      return changed ? next : prev;
    });
    setGapClosures(prev => {
      let changed = false;
      const next = prev.map(g => {
        if (manuallyEditedFactRows.has(g.clientId1c)) return g; // skip manual edit
        const realFact = factByClientId.get(g.clientId1c) ?? 0;
        const newCompleted = isFinalized && realFact >= g.potentialAmount;
        if (realFact !== g.factAmount || newCompleted !== g.completed) {
          changed = true;
          return { ...g, factAmount: realFact, completed: newCompleted };
        }
        return g;
      });
      return changed ? next : prev;
    });
  }, [factByClientId, manuallyEditedFactRows, isFinalized]);

  // Snapshot: фіксуємо первинний список клієнтів у БД ОДИН РАЗ на (manager
  // × segment × period). Backend INSERT з ON CONFLICT DO NOTHING — повторні
  // виклики безпечні, snapshot не оновлюється.
  // Робимо це ЗАВЖДИ як 1С повернула segmentClients — навіть якщо менеджер
  // вже зберігав форму. Це дає аудит "хто був на початку" незалежно від
  // того видаляв він далі чи ні.
  useEffect(() => {
    if (segmentClients.length === 0) return;
    const cat1cToText = (cat: Client1C['category']): string | null => {
      switch (cat) {
        case 'active': return 'Активный';
        case 'sleeping': return 'Спящий';
        case 'lost': return 'Потерянный';
        case 'new': return 'Новый';
        case 'none': return 'Без закупок';
        default: return null;
      }
    };
    const buildClient = (c: Client1C) => ({
      clientId1c: c.clientId,
      clientName: c.clientName,
      category1c: cat1cToText(c.category),
      lastPurchaseDate: c.lastPurchaseDate || null,
      lastPurchaseAmount: c.lastPurchaseAmount,
    });
    const payload = {
      periodId: currentPeriod.id,
      period: {
        weekStart: currentPeriod.weekStart,
        weekEnd: currentPeriod.weekEnd,
        month: currentPeriod.month,
      },
      segmentCode,
      targetLogin: targetUserLogin || undefined,
      userMeta: targetUserLogin ? {
        fullName: targetUserName || targetUserLogin,
        region: targetUserRegion || undefined,
        regionCode: targetUserRegionCode || undefined,
      } : undefined,
      forecasts: activeClients.map(buildClient),
      gapClosures: sleepingClients.map(buildClient),
      source: 'auto-populate',
    };
    fetch('/api/planning/init-snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[init-snapshot] failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCode, currentPeriod.id, effectiveLogin, segmentClients.length]);

  // Auto-populate Прогноз з активних клієнтів 1С — якщо Supabase нічого
  // не повернув. Початковий forecastAmount = lastPurchaseAmount (остання
  // покупка) щоб менеджер мав логічний default замість 0 — і сума у рядках
  // одразу збігалась з «Очікуваною сумою» зверху.
  useEffect(() => {
    if (!supabaseLoaded) return;
    if (formEverEdited) return; // менеджер вже редагував — не повертаємо видалених
    if (forecasts.length > 0) return;
    if (activeClients.length === 0) return;
    setForecasts(activeClients.map(c => ({
      clientId1c: c.clientId,
      clientName: c.clientName,
      // 1С іноді віддає від'ємний lastPurchaseAmount (повернення/refund) —
      // як стартовий default для прогнозу він не має сенсу. Зводимо до 0.
      forecastAmount: Math.max(0, c.lastPurchaseAmount || 0),
      stage: '',
      stageComment: '',
      stageDone: false,
      factAmount: 0,
      lastPurchaseDate: c.lastPurchaseDate,
      lastPurchaseAmount: c.lastPurchaseAmount,
      completed: false,
      manuallyAdded: false,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseLoaded, formEverEdited, activeClients.length]);

  // Auto-populate Закриття розриву — клієнти що купували цей бренд >3 місяців тому.
  // potentialAmount = lastPurchaseAmount (історична сума яку б повернути).
  // Підпис category — теж 3-місячна логіка не плутаючи з 1С-категорією:
  // показуємо Сплячий/Втрачений якщо так класифікувала 1С (просто для довідки),
  // інакше — порожньо.
  useEffect(() => {
    if (!supabaseLoaded) return;
    if (formEverEdited) return; // менеджер вже редагував — не повертаємо видалених
    if (gapClosures.length > 0) return;
    if (sleepingClients.length === 0) return;
    const categoryHint = (cat: Client1C['category']): string => {
      switch (cat) {
        case 'sleeping': return 'Сплячий';
        case 'lost': return 'Втрачений';
        case 'none': return 'Без закупок';
        case 'new': return 'Новий';
        default: return '';
      }
    };
    setGapClosures(sleepingClients.map(c => ({
      clientId1c: c.clientId,
      clientName: c.clientName,
      category: categoryHint(c.category),
      potentialAmount: c.lastPurchaseAmount || 0,
      stage: '',
      stageComment: '',
      stageDone: false,
      completed: false,
      deadline: '',
      factAmount: 0,
      lastPurchaseDate: c.lastPurchaseDate,
      lastPurchaseAmount: c.lastPurchaseAmount,
      manuallyAdded: false,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseLoaded, formEverEdited, sleepingClients.length]);
  // «Дані по клієнтах по ТМ» — РЕАЛЬНИЙ розклад планування менеджера, не
  // потенціал з 1С. Активні = forecasts (за визначенням 3-month rule). Нові +
  // Активізація = gap_closures, розділяємо за полем category (з 1С).
  // ⚠️ Passive rows (amount=0) — «пам'ятаю, не планую» — НЕ враховуємо у counter'ах.
  const isNewCategory = (c?: string | null) => !!c && /(^|\s)нов(ый|ий)/i.test(c);
  const newGapRows = gapClosures.filter(g => isNewCategory(g.category));
  const sleepingGapRows = gapClosures.filter(g => !isNewCategory(g.category));
  const activeForecastSum = forecasts.reduce((s, f) => s + (f.forecastAmount || 0), 0);
  const activeFactSum = forecasts.reduce((s, f) => s + (f.factAmount || 0), 0);
  const newPotentialSum = newGapRows.reduce((s, g) => s + (g.potentialAmount || 0), 0);
  const newFactSum = newGapRows.reduce((s, g) => s + (g.factAmount || 0), 0);
  const sleepingPotentialSum = sleepingGapRows.reduce((s, g) => s + (g.potentialAmount || 0), 0);
  const sleepingFactSum = sleepingGapRows.reduce((s, g) => s + (g.factAmount || 0), 0);
  // Лічильники ТІЛЬКИ активно запланованих клієнтів (amount > 0).
  const activeForecastCount = forecasts.filter(f => !isPassiveAmount(f.forecastAmount)).length;
  const newGapActiveCount = newGapRows.filter(g => !isPassiveAmount(g.potentialAmount)).length;
  const sleepingGapActiveCount = sleepingGapRows.filter(g => !isPassiveAmount(g.potentialAmount)).length;

  const categories: ClientCategorySummary[] = [
    { category: 'active', label: 'Активні клієнти', clientCount: activeForecastCount, expectedAmount: activeForecastSum, factAmount: activeFactSum, planCoveragePercent: pctOf(activeForecastSum, planAmount) },
    { category: 'new', label: 'Нові клієнти (категорія 1С)', clientCount: newGapActiveCount, expectedAmount: newPotentialSum, factAmount: newFactSum, planCoveragePercent: pctOf(newPotentialSum, planAmount) },
    { category: 'sleeping_lost', label: 'Активація (Сплячі, Втрачені, БЗ)', clientCount: sleepingGapActiveCount, expectedAmount: sleepingPotentialSum, factAmount: sleepingFactSum, planCoveragePercent: pctOf(sleepingPotentialSum, planAmount) },
  ];
  const totalCatClients = categories.reduce((s, c) => s + c.clientCount, 0);
  const totalCatAmount = categories.reduce((s, c) => s + c.expectedAmount, 0);
  const totalCatFact = categories.reduce((s, c) => s + c.factAmount, 0);
  // «Запланований %» = СКІЛЬКИ МЕНЕДЖЕР ЗАПЛАНУВАВ від плану місяця, БЕЗ факту.
  // Семантика: «менеджер обіцяє покрити X% плану своєю активністю». Якщо разом
  // з фактом він буде > 100% — це окрема метрика «передбачуване виконання»,
  // тут не показуємо.
  const totalCatPct = pctOf(totalCatAmount, planAmount);

  // CAT_ICONS винесено у sections/client-data-by-tm-section.tsx (Day 8)

  // === Етап «Зустріч» → пропозиція запланувати точну дату й час ===
  // Коли менеджер у select Stage обирає «Зустріч», пропонуємо одразу створити
  // подію у /meetings (закриває цикл план→подія, інакше менеджер забуде).
  // Soft prompt — Stage пишеться як завжди, відмова просто закриває діалог.
  const [meetingPrompt, setMeetingPrompt] = useState<{ clientId: string; clientName: string } | null>(null);
  const [meetingFormState, setMeetingFormState] = useState<{ clientId: string } | null>(null);
  // Hook useMeetings — щоб мати createMeeting. Range «Сьогодні» дефолтний —
  // нам тут range не важливий, лише createMeeting.
  const { createMeeting } = useMeetings();

  /** Дата для prefill у MeetingForm: 1-ше число місяця плану або сьогодні
   *  (якщо плановий місяць — поточний). YYYY-MM-DD. */
  const planDateHint = useMemo(() => {
    const month = currentPeriod?.month; // YYYY-MM
    if (!month) return undefined;
    const today = new Date();
    const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (month === todayMonth) return today.toISOString().slice(0, 10);
    return `${month}-01`;
  }, [currentPeriod?.month]);

  const updateForecast = (clientId: string, field: keyof ForecastRow, value: string | number | boolean | null | undefined) => {
    // Якщо менеджер редагує factAmount вручну — позначаємо рядок щоб
    // auto-sync з 1С НЕ перетирав цю зміну при наступному revalidate.
    if (field === 'factAmount') {
      setManuallyEditedFactRows(prev => {
        if (prev.has(clientId)) return prev;
        const next = new Set(prev);
        next.add(clientId);
        return next;
      });
    }
    setForecasts(prev => prev.map(f => {
      if (f.clientId1c !== clientId) return f;
      const updated = { ...f, [field]: value };
      if (field === 'factAmount' && typeof value === 'number') {
        updated.completed = value >= updated.forecastAmount;
      }
      return updated;
    }));
    if (field === 'stage' && value === 'Зустріч') {
      const row = forecasts.find(f => f.clientId1c === clientId);
      setMeetingPrompt({ clientId, clientName: row?.clientName || 'клієнтом' });
    }
  };

  const updateGap = (i: number, field: keyof GapClosureRow, value: string | number | boolean | null | undefined) => {
    if (field === 'factAmount') {
      const id = gapClosures[i]?.clientId1c;
      if (id) {
        setManuallyEditedFactRows(prev => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    }
    setGapClosures(prev => {
      const n = [...prev];
      const updated = { ...n[i], [field]: value };
      // Симетрично з updateForecast: автовиконання при ручному введенні факту
      if (field === 'factAmount' && typeof value === 'number') {
        updated.completed = value >= updated.potentialAmount;
      }
      n[i] = updated;
      return n;
    });
    if (field === 'stage' && value === 'Зустріч') {
      const row = gapClosures[i];
      if (row?.clientId1c) {
        setMeetingPrompt({ clientId: row.clientId1c, clientName: row.clientName || 'клієнтом' });
      }
    }
  };

  /** Викликається коли менеджер у MeetingForm натиснув «Зберегти». */
  const handleMeetingSave = async (data: MeetingFormData) => {
    await createMeeting({
      clientId1c: data.clientId1c,
      date: data.date,
      time: data.time,
      durationMin: data.durationMin,
      purpose: data.purpose,
      comment: data.comment || null,
      plannedAddress: data.plannedAddress || null,
    });
    setMeetingFormState(null);
  };

  const removeForecast = (clientId: string) => {
    const target = forecasts.find(f => f.clientId1c === clientId);
    setPendingDelete({ type: 'forecast', clientId, clientName: target?.clientName || 'цього клієнта' });
  };

  const removeGapClosure = (i: number) => {
    const target = gapClosures[i];
    setPendingDelete({ type: 'gap', index: i, clientName: target?.clientName || 'цього клієнта' });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // ⚠️ ВАЖЛИВО: ставимо formEverEdited=true при будь-якому видаленні.
    // Інакше після видалення ВСІХ рядків auto-populate useEffect одразу
    // повертає клієнтів назад (бо forecasts/gap.length=0 і formEverEdited
    // ще false якщо менеджер ще ні разу не save-ив).
    setFormEverEdited(true);
    if (pendingDelete.type === 'forecast') {
      const removedId = pendingDelete.clientId;
      setForecasts(prev => prev.filter(f => f.clientId1c !== removedId));
      setSelectedForecasts(prev => syncIdsAfterRemove(prev, removedId));
    } else if (pendingDelete.type === 'gap') {
      // ⚠️ selectedGaps — Set<number> по index. Sync щоб наступний bulk-delete
      // не потрапив у не тих рядків після зсуву індексів.
      const removedIdx = pendingDelete.index;
      setGapClosures(prev => prev.filter((_, j) => j !== removedIdx));
      setSelectedGaps(prev => syncIndicesAfterRemove(prev, removedIdx));
    } else if (pendingDelete.type === 'forecast-bulk') {
      const ids = new Set(pendingDelete.ids);
      setForecasts(prev => prev.filter(f => !ids.has(f.clientId1c)));
      setSelectedForecasts(new Set());
    } else if (pendingDelete.type === 'gap-bulk') {
      const idxs = new Set(pendingDelete.indices);
      setGapClosures(prev => prev.filter((_, j) => !idxs.has(j)));
      setSelectedGaps(new Set());
    }
    setPendingDelete(null);
  };

  // Bulk-видалення обраних
  const bulkDeleteForecasts = () => {
    if (selectedForecasts.size === 0) return;
    setPendingDelete({ type: 'forecast-bulk', ids: [...selectedForecasts] });
  };
  const bulkDeleteGaps = () => {
    if (selectedGaps.size === 0) return;
    setPendingDelete({ type: 'gap-bulk', indices: [...selectedGaps] });
  };
  // Toggle per row
  const toggleForecast = (clientId: string) => {
    setSelectedForecasts(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });
  };
  const toggleGap = (i: number) => {
    setSelectedGaps(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // ⚠️ ВРУЧНУ додано через «+Додати» з пошуку — НЕ auto-fill сумою/датою.
  // Для gap-modal модаль показує всіх клієнтів менеджера (включно з тими що
  // ніколи не купляли цей бренд) — їх last_purchase може бути з ІНШОГО
  // бренду і плутати. Менеджер сама впише потенціал і дедлайн.
  // Для forecast-модалі дані брендозалежні, але уніфіковуємо UX: «доданий
  // вручну = заповни сам, щоб не плутатись».
  // Перевірка на дубль (forecast ∪ gap_closures): клієнт може бути ТІЛЬКИ
  // у одному блоці одночасно. Перевірка тут у add handler, а не у фільтрі
  // ClientSearchModal — щоб user бачив у пошуку всіх клієнтів менеджера
  // і отримав явне попередження якщо клієнт вже у плані.
  const isAlreadyInPlan = (clientId: string): 'forecast' | 'gap' | null => {
    if (forecasts.some(f => f.clientId1c === clientId)) return 'forecast';
    if (gapClosures.some(g => g.clientId1c === clientId)) return 'gap';
    return null;
  };

  const addClient = (client: Client1C) => {
    const where = isAlreadyInPlan(client.clientId);
    if (where) {
      const block = where === 'forecast' ? '«Прогноз по активних»' : '«Закриття розриву»';
      alert(`${client.clientName} вже у вашому плані: ${block}. Один клієнт може бути лише в одному блоці.`);
      return;
    }
    setForecasts(prev => [...prev, {
      clientId1c: client.clientId, clientName: client.clientName,
      forecastAmount: 0,
      stage: '', stageComment: '', stageDone: false,
      factAmount: 0,
      lastPurchaseDate: null,
      lastPurchaseAmount: 0,
      completed: false, manuallyAdded: true,
    }]);
  };

  const addGapClient = (client: Client1C) => {
    const where = isAlreadyInPlan(client.clientId);
    if (where) {
      const block = where === 'forecast' ? '«Прогноз по активних»' : '«Закриття розриву»';
      alert(`${client.clientName} вже у вашому плані: ${block}. Один клієнт може бути лише в одному блоці.`);
      return;
    }
    setGapClosures(prev => [...prev, {
      clientId1c: client.clientId,
      clientName: client.clientName,
      // Для `none` зберігаємо порожньо щоб chip не показувався «Без закупок» у gap-картці.
      category: client.category === 'none' ? '' : categoryLabel(client.category),
      potentialAmount: 0,
      stage: '', stageComment: '', stageDone: false,
      completed: false, deadline: '', factAmount: 0,
      lastPurchaseDate: null,
      lastPurchaseAmount: 0,
      manuallyAdded: true,
    }]);
  };

  const existingIds = forecasts.map(f => f.clientId1c);
  const gapExistingIds = gapClosures.map(g => g.clientId1c).filter(Boolean);

  // UnplannedRow винесено у sections/forecast-section.tsx (Day 8)
  // (gap-closure section ще використовує inline-варіант — буде винесено далі)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">{segment?.name}</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emet-50 text-emet-blue">{periodLabel}</span>
        {readOnlyProp && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm flex items-center gap-1">
            <Eye className="h-3 w-3" /> Перегляд
          </span>
        )}
      </div>

      <MaintenanceBanner />

      {/* Window-lock banner — Пакет А Етап 3 (2026-05-13). Логіка показу
          (admin/director/manager + global-block vs standard) у компоненті. */}
      <WindowLockBanner />

      {/* Whose-plan banner — коли admin/RM/Director дивиться чужого менеджера,
          явно показуємо ім'я і логін щоб не загубитись (Етап 2.6, 2026-05-13). */}
      {targetUserLogin && targetUserLogin !== (user?.login || '') && (
        <div className="bg-emet-50 border border-emet-blue/20 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emet-blue text-white flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-emet-blue">
              План менеджера: {targetUserName || targetUserLogin}
            </p>
            <p className="text-[12px] text-emet-blue/70 mt-0.5">
              Логін: {targetUserLogin}
              {isAdmin ? ' · режим адміна — редагування дозволено' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Finalized banner — Пакет А Етап 2 (2026-05-13) */}
      {isFinalized && (
        <div className="bg-emerald-50/55 backdrop-blur-xl border border-emerald-200/70 rounded-2xl p-4 flex items-start gap-3 shadow-[0_4px_20px_rgba(6,95,70,0.04)]">
          <div className="w-9 h-9 rounded-xl bg-emerald-100/80 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-emerald-900">
              ✓ Фіналізовано {finalizedAt ? new Date(finalizedAt).toLocaleString('uk-UA', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
            <p className="text-[13px] text-emerald-800 mt-0.5">
              {isAdmin
                ? 'Ви бачите план у режимі адміна — можете редагувати або розфіналізувати.'
                : stageUnlockedAfterFinalize
                  ? '✏ Адмін надав дозвіл редагувати «Етап». Суми та список клієнтів заблоковані.'
                  : 'План заблокований для редагування сум і списку клієнтів. Для змін зверніться до адміністратора.'}
              {finalizedBy && ` · Фіналізував: ${finalizedBy}`}
            </p>
          </div>
        </div>
      )}

      {/* Sticky save bar — приліплений під AppHeader (top-[56px]). Раніше було
          `sticky bottom-0`, але у довгій формі (25+ клієнтів × 3 категорії)
          адмін мусив скролити аж до низу, щоб натиснути «Фіналізувати» /
          «Розфіналізувати». Тепер кнопки одразу під breadcrumb-ом і прилипають
          до верху при скролі — доступні без скролу.
          Day 14 #2: bar показуємо навіть коли план фіналізований (lockEdit=true для
          non-admin), щоб менеджер міг зберегти оновлені stage_comment. Backend
          filtered-mode (Етап 2) пропустить лише ці поля.
          Save bar ховаємо коли window закритий не-адміну (техноботи /
          global-block / user-block / поза вікном). Admin завжди бачить
          кнопки — він має bypass усіх обмежень. */}
      {!readOnly && (isAdmin || !isWindowLocked) && (
        <div className="sticky top-[56px] -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/85 backdrop-blur-md border-b border-[#e2e7ef] flex flex-wrap items-center justify-end gap-2 md:gap-3 z-30">
          {lastSavedAt && !saveResult && (
            <span className="text-[11px] text-muted-foreground mr-auto">
              Остання чернетка: {new Date(lastSavedAt).toLocaleString('uk-UA', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
          {saveResult && (
            <span className={`text-[13px] font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm border ${
              saveResult.ok ? 'bg-emerald-500/12 border-emerald-300/40 text-emerald-700' : 'bg-rose-500/12 border-rose-300/40 text-rose-700'
            }`} role="status">
              {saveResult.msg}
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || finalizing}
            className="flex-1 md:flex-initial gap-2 bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white shadow-lg shadow-emet-blue/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-label="Збереження..."><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Зберігаю...
              </>
            ) : (
              <><Save className="h-4 w-4" /> {isFinalized && !isAdmin ? (stageUnlockedAfterFinalize ? 'Зберегти етапи + коментарі' : 'Зберегти коментарі') : 'Зберегти чернетку'}</>
            )}
          </Button>
          {!isFinalized && (
            <Button
              onClick={handleFinalize}
              disabled={saving || finalizing}
              className="flex-1 md:flex-initial gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
              title="Заблокувати план від подальших змін сум і списку клієнтів"
            >
              <Lock className="h-4 w-4" />
              <span className="md:hidden">{finalizing ? 'Зберігаю…' : 'Фіналізувати'}</span>
              <span className="hidden md:inline">{finalizing ? 'Зберігаю…' : 'Фінальне збереження'}</span>
            </Button>
          )}
          {isFinalized && canUnfinalize && (
            <Button
              onClick={handleUnfinalize}
              disabled={saving || finalizing}
              className="flex-1 md:flex-initial gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
              title="Зняти фіналізацію — дозволити менеджеру редагувати"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="md:hidden">{finalizing ? 'Розфін…' : 'Розфіналіз.'}</span>
              <span className="hidden md:inline">{finalizing ? 'Розфіналізую…' : 'Розфіналізувати'}</span>
            </Button>
          )}
        </div>
      )}

      {/* 4-метрики рядок — винесено у sections/planning-metrics-row (Day 8) */}
      <PlanningMetricsRow
        planAmount={planAmount}
        factAmount={factAmount}
        expectedAmount={expectedAmount}
        factPct={factPct}
        expectedPct={expectedPct}
        deviation={deviation}
        passedWorkingDays={passedWorkingDays}
        periodEndDate={currentPeriod.weekEnd}
        prevMonthFactAmount={prevMonthFactAmount}
        prevMonthPlanAmount={prevMonthPlanAmount}
        forecasts={forecasts}
        gapClosures={gapClosures}
      />

      {/* === ДАНІ ПО КЛІЄНТАХ ПО ТМ === винесено у sections/client-data-by-tm-section (Day 8) */}
      <ClientDataByTmSection
        categories={categories}
        totalCatClients={totalCatClients}
        totalCatAmount={totalCatAmount}
        totalCatFact={totalCatFact}
        totalCatPct={totalCatPct}
        unplannedAll={unplannedAll}
        unplannedByCategory={unplannedByCategory}
        planAmount={planAmount}
        clientsLoading={clientsLoading}
        clientsError={clientsError}
        hasSegmentClients={segmentClients.length > 0}
      />
      {/* === ПРОГНОЗ ПО АКТИВНИХ КЛІЄНТАХ === винесено у sections/forecast-section (Day 8) */}
      <ForecastSection
        sortedForecasts={sortedForecasts}
        forecasts={forecasts}
        forecastTotal={forecastTotal}
        forecastFactTotal={forecastFactTotal}
        pendingForecastTotal={pendingForecastTotal}
        activeForecastCount={activeForecastCount}
        unplannedForecast={unplannedSplit.forecast}
        selectedForecasts={selectedForecasts}
        setSelectedForecasts={setSelectedForecasts}
        toggleForecast={toggleForecast}
        bulkDeleteForecasts={bulkDeleteForecasts}
        updateForecast={updateForecast}
        removeForecast={removeForecast}
        setSearchOpen={setSearchOpen}
        trainings={trainings}
        lockEdit={lockEdit}
        lockStage={lockStage}
        readOnly={readOnly}
        isAdmin={isAdmin}
        clientsLoading={clientsLoading}
      />
      {/* === ЗАКРИТТЯ РОЗРИВУ === винесено у sections/gap-closure-section (Day 8) */}
      <GapClosureSection
        sortedGapClosures={sortedGapClosures}
        gapClosures={gapClosures}
        gapTotal={gapTotal}
        gapFactTotal={gapFactTotal}
        gapAfterForecast={gapAfterForecast}
        expectedAmount={expectedAmount}
        factAmount={factAmount}
        pendingForecastTotal={pendingForecastTotal}
        unplannedGap={unplannedSplit.gap}
        selectedGaps={selectedGaps}
        setSelectedGaps={setSelectedGaps}
        toggleGap={toggleGap}
        bulkDeleteGaps={bulkDeleteGaps}
        updateGap={updateGap}
        removeGapClosure={removeGapClosure}
        setGapSearchOpen={setGapSearchOpen}
        trainings={trainings}
        lockEdit={lockEdit}
        lockStage={lockStage}
        readOnly={readOnly}
        isAdmin={isAdmin}
        clientsLoading={clientsLoading}
      />
      {/* Дії для закриття */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дії для закриття розриву</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {(['action1', 'action2', 'action3'] as const).map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f4f7fb] text-[12px] font-bold text-muted-foreground shrink-0">{i + 1}</span>
              <Input value={gapActions[key]} onChange={(e) => setGapActions(prev => ({ ...prev, [key]: e.target.value }))}
                disabled={lockEdit}
                className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe]" placeholder={`Дія ${i + 1}...`} />
            </div>
          ))}
        </div>
      </div>

      <PlanningDialogs
        showIncompleteConfirm={showIncompleteConfirm}
        setShowIncompleteConfirm={setShowIncompleteConfirm}
        forecasts={forecasts}
        gapClosures={gapClosures}
        propPlanAmount={propPlanAmount}
        doFinalize={doFinalize}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        gapSearchOpen={gapSearchOpen}
        setGapSearchOpen={setGapSearchOpen}
        addClient={addClient}
        addGapClient={addGapClient}
        allManagerClients={allManagerClients}
        clientsLoading={clientsLoading}
        pendingDelete={pendingDelete}
        setPendingDelete={setPendingDelete}
        confirmDelete={confirmDelete}
        meetingPrompt={meetingPrompt}
        setMeetingPrompt={setMeetingPrompt}
        setMeetingFormState={setMeetingFormState}
        meetingFormState={meetingFormState}
        planDateHint={planDateHint}
        handleMeetingSave={handleMeetingSave}
      />
    </div>
  );
}
