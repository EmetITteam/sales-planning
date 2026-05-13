'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientSearchModal } from './client-search-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatUSD, formatDate, formatDateShort, pctOf } from '@/lib/format';
import { savePlanning, loadPlanning } from '@/lib/api';
import { syncIdsAfterRemove, syncIndicesAfterRemove } from '@/lib/selection-sync';
import { mutate as swrMutate } from 'swr';
import { useAppStore } from '@/lib/store';
import { isPlanningWritesAllowed, FEATURES } from '@/lib/feature-flags';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { WindowLockBanner } from '@/components/window-lock-banner';
import { useFinalizationStatus, finalizePlan, unfinalizePlan } from '@/lib/use-finalization';
import { useWindowStatus } from '@/lib/use-window-status';
import { getMonthName } from '@/lib/periods';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
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
  ArrowLeft, Save, Search, Target, DollarSign, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Trash2, Check, Phone, Calendar, MessageCircle,
  AlertTriangle, Clock, Lock, Users, UserPlus, RefreshCw, Eye, GraduationCap,
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
  /**
   * Адаптована відповідь Action 3 (`getSalesFact`) — потрібна щоб у формі
   * показати «незапланованих покупців» (які купили без плану) під списками.
   * null поки 1С не відповіла або у DEMO режимі.
   */
  factResponse?: SalesFactResponse | null;
}

// Етапи доступні і в "Прогноз по активних", і в "Закриття розриву".
// Опція "Навчання" розкриває селектор обучень з 1С (плюс поле коментаря).
const STAGE_OPTIONS = [
  { value: 'Дзвінок', icon: Phone },
  { value: 'Мессенджер', icon: MessageCircle },
  { value: 'Зустріч', icon: Calendar },
  { value: 'Навчання', icon: GraduationCap },
];

export function PlanningForm({
  segmentCode, onBack, readOnly: readOnlyProp = false, targetUserLogin, targetUserName,
  clientsResponse = null, clientsLoading = false, clientsError = null,
  planAmount: propPlanAmount = 0, factAmount: propFactAmount = 0,
  factResponse = null,
}: PlanningFormProps) {
  const segment = SEGMENTS.find(s => s.code === segmentCode);
  const { currentPeriod, user } = useAppStore();
  // ⚠️ Пакет А Етап 0 (2026-05-13): kill-switch під час оновлення системи.
  // Адмін (itd@emet.in.ua) обходить. Видаляється після Етапу 3.
  const isMaintenanceLocked = FEATURES.PLANNING_DISABLED && !isPlanningWritesAllowed(user?.login);
  const readOnly = readOnlyProp || isMaintenanceLocked;
  const isAdmin = user?.role === 'admin';
  // Дані вантажимо/зберігаємо для targetUserLogin (якщо переданий — РМ дивиться чужий план)
  // або для поточного увійшовшого user.login.
  const effectiveLogin = targetUserLogin || user?.login || 'anonymous';

  // ⚠️ Пакет А Етап 2 (2026-05-13): finalization status — після фіналізації
  // менеджер блокується на редагування сум/клієнтів/етапів. Admin обходить.
  // periodId для finalize endpoint — береться з currentPeriod.id (тижневий).
  // Backend сам ремапить на monthly через period.month. Передаємо як є.
  const { finalizedAt, finalizedBy, refetch: refetchFinalize } = useFinalizationStatus(
    currentPeriod?.id ?? null,
    segmentCode,
    effectiveLogin,
    currentPeriod?.month ?? null,
  );
  const isFinalized = !!finalizedAt;

  // Window-lock (Етап 3): admin завжди allowed; менеджер — за window_days
  // + per-user / global locks.
  const { status: windowStatus } = useWindowStatus(
    currentPeriod?.month ?? null,
    effectiveLogin && effectiveLogin !== 'anonymous' ? effectiveLogin : null,
  );
  const isWindowLocked = !!windowStatus && !windowStatus.allowed;

  // Lock редагування сум, списку клієнтів, етапів, тренінгу, кнопок Add/Remove
  // коли план фіналізований (не для admin) АБО window-lock заблокував менеджера.
  // Stage_comment поки теж заблоковано — інлайн-edit коментарів додамо окремим патчем.
  const lockEdit = readOnly || (isFinalized && !isAdmin) || (isWindowLocked && !isAdmin);

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
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Останнє успішне збереження (із summary.updated_at при load + з POST response).
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
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

  // FEATURE: завантаження збережених даних з Supabase.
  // ⚠️ При зміні (effectiveLogin, segmentCode, currentPeriod) ОЧИЩАЄМО stale state
  // ДО fetch — інакше при логауті/drill-down іншого менеджера у формі лишаються
  // прогнози попереднього користувача. supabaseLoaded скидаємо щоб handleSave guard
  // не дав зберегти доки не дочекались відповіді.
  useEffect(() => {
    setForecasts([]);
    setGapClosures([]);
    setGapActions({ action1: '', action2: '', action3: '' });
    setSupabaseLoaded(false);
    setPersistedClientIds(new Set());
    setSelectedForecasts(new Set());
    setSelectedGaps(new Set());
    setFormEverEdited(false);
    setManuallyEditedFactRows(new Set());

    let cancelled = false;
    loadPlanning(effectiveLogin, segmentCode, currentPeriod.id).then(data => {
      if (cancelled) return;
      setSupabaseLoaded(true);
      if (!data) return;
      // Зберігаємо ID-и які РЕАЛЬНО прийшли з Supabase — щоб «Незаплановані»
      // блок узгоджувався з дашбордом (де теж дивиться лише на saved-план).
      const persisted = new Set<string>();
      for (const f of data.forecasts) if (f.client_id_1c) persisted.add(f.client_id_1c);
      for (const g of data.gapClosures) if (g.client_id_1c) persisted.add(g.client_id_1c);
      setPersistedClientIds(persisted);
      // ⚠️ Після migration M3: читаємо дедіковані колонки замість unpack JSON.
      // Якщо БД ще має старі JSON-row (не мігровані), вони опрацюються через
      // міграційний UPDATE на стороні Supabase (M3 заповнює нові колонки + чистить
      // stage_comment до plain text).
      if (data.forecasts.length > 0) {
        setForecasts(data.forecasts.map(f => ({
          clientId1c: f.client_id_1c,
          clientName: f.client_name,
          forecastAmount: f.forecast_amount,
          stage: (f.stage || '') as ForecastRow['stage'],
          stageComment: f.stage_comment || '',
          trainingId: f.training_id || undefined,
          trainingName: f.training_name || undefined,
          trainingDate: f.training_date || undefined,
          stageDone: f.stage_done,
          factAmount: 0,
          // lastPurchaseDate/Amount довантажуються окремим useEffect-ом нижче
          // після того як segmentClients (1С Action 2) прийде. Зберігати їх у
          // forecasts table немає сенсу — це довідкова інфа з 1С яка змінюється.
          lastPurchaseDate: null,
          lastPurchaseAmount: 0,
          completed: f.completed,
          manuallyAdded: f.manually_added,
        })));
      }
      if (data.gapClosures.length > 0) {
        setGapClosures(data.gapClosures.map(g => ({
          clientId1c: g.client_id_1c,
          clientName: g.client_name,
          category: g.category || '',
          potentialAmount: g.potential_amount,
          stage: (g.stage || '') as GapClosureRow['stage'],
          stageComment: g.stage_comment || '',
          stageDone: g.stage_done,
          completed: g.closure_completed,
          trainingId: g.training_id || undefined,
          trainingName: g.training_name || undefined,
          trainingDate: g.training_date || undefined,
          deadline: g.deadline || '',
          factAmount: 0,
          lastPurchaseDate: null,
          lastPurchaseAmount: 0,
          manuallyAdded: g.manually_added,
        })));
      }
      if (data.summary) {
        setGapActions({
          action1: data.summary.gap_action_1 || '',
          action2: data.summary.gap_action_2 || '',
          action3: data.summary.gap_action_3 || '',
        });
        if (data.summary.updated_at) setLastSavedAt(data.summary.updated_at);
        // Маркер: форма вже зберігалась хоч раз (period_summaries запис існує).
        // Auto-populate більше не спрацює навіть якщо forecasts/gap_closures
        // порожні — це СВІДОМЕ рішення менеджера видалити всіх.
        setFormEverEdited(true);
      }
    });
    return () => { cancelled = true; };
  }, [segmentCode, currentPeriod.id, effectiveLogin]);

  const handleSave = async () => {
    // SAFETY: не дозволяємо save доки не дочекались load з Supabase. Інакше
    // можливий race: натиснули зберегти → POST порожнього стану → у БД
    // зникають попередньо збережені рядки. На сервері є симетричний захист
    // (clearAll flag), цей — додатковий.
    if (!supabaseLoaded) {
      setSaveResult({ ok: false, msg: 'Зачекайте — дані ще завантажуються' });
      setTimeout(() => setSaveResult(null), 3000);
      return;
    }
    // Захист від «тихого порожнього save»: коли state ще не догнав load з БД,
    // forecasts може бути [], persistedClientIds має старі id-и. Backend
    // skip-ає DELETE+UPSERT у такому стані (clearAll=false safety) → UI показав
    // би «Збережено!» без реальних змін у БД. Тепер просимо почекати.
    if (forecasts.length === 0 && gapClosures.length === 0 && persistedClientIds.size > 0) {
      setSaveResult({ ok: false, msg: 'Дані ще завантажуються — спробуйте за секунду' });
      setTimeout(() => setSaveResult(null), 3000);
      return;
    }
    setSaving(true);
    setSaveResult(null);
    // ⚠️ clearAll flag — гарантує що backend виконає DELETE notIn() навіть
    // коли один з блоків (forecast або gap) пустий. Без цього backend
    // skip-ає DELETE для пустого блоку (safety проти race), і видалені
    // через bulk-delete клієнти лишаються в БД.
    //
    // Передаємо clearAll коли форма реально редагувалась (formEverEdited)
    // АБО коли є persistedClient (були дані з минулого save). Це означає:
    //   - User свідомо змінює стан → backend має дослухатись до DELETE.
    //   - Перший save з пустим станом (formEverEdited=false, persisted=0) →
    //     clearAll=false → backend безпечно skip-ає DELETE. ✓
    const isExplicitClearAll = formEverEdited || persistedClientIds.size > 0;
    const result = await savePlanning({
      segmentCode,
      periodId: currentPeriod.id,
      period: {
        weekStart: currentPeriod.weekStart,
        weekEnd: currentPeriod.weekEnd,
        month: currentPeriod.month,
      },
      // Drill-down: РМ зберігає за свого менеджера. Сервер перевірить що цей
      // логін у session.managedUsers; якщо ні — 403.
      targetLogin: targetUserLogin || undefined,
      // Профіль потрібен серверу лише при drill-down (бо у session дані РМ а не
      // цільового менеджера). Для свого збереження сервер бере з сесії.
      userMeta: targetUserLogin ? { fullName: targetUserName || targetUserLogin } : undefined,
      forecasts,
      gapClosures,
      gapActions,
      clearAll: isExplicitClearAll,
    });
    setSaving(false);
    if (result.success) {
      // Маркер що форма редагувалась — після цього auto-populate не запуститься
      // навіть якщо менеджер видалив всіх і тимчасово forecasts/gap пусті.
      setFormEverEdited(true);
      // persistedClientIds оновлюємо з поточного state (бо save їх записав у БД)
      const justSaved = new Set<string>();
      for (const f of forecasts) if (f.clientId1c) justSaved.add(f.clientId1c);
      for (const g of gapClosures) if (g.clientId1c) justSaved.add(g.clientId1c);
      setPersistedClientIds(justSaved);
      // ⚠️ Invalidate SWR cache для planAgg + regionStats — інакше dashboard
      // hero/brand-row 60 сек тримають старі цифри (SWR dedupingInterval).
      // Менеджер save-нув → відкрив дашборд → видно старі % → плутає.
      // Mutate ВСІХ ключів agg|*|*|* і region-stats|*|*|*|*.
      swrMutate(
        (key) => typeof key === 'string' && (key.startsWith('agg|') || key.startsWith('region-stats|')),
        undefined,
        { revalidate: true },
      );
    }
    if (result.success) {
      if (result.savedAt) setLastSavedAt(result.savedAt);
      const c = result.counts;
      const msg = c
        ? `Збережено: прогноз ${c.forecasts}, розрив ${c.gaps}`
        : 'Збережено';
      setSaveResult({ ok: true, msg });
    } else {
      setSaveResult({ ok: false, msg: result.error || 'Помилка збереження' });
    }
    setTimeout(() => setSaveResult(null), 4000);
  };

  // ---- Фіналізація плану (Етап 2 Пакету А) ----
  const [finalizing, setFinalizing] = useState(false);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const doFinalize = async () => {
    setFinalizing(true);
    const result = await finalizePlan({
      periodId: currentPeriod.id,
      month: currentPeriod.month,
      segmentCode,
      targetLogin: targetUserLogin || undefined,
    });
    setFinalizing(false);
    if (result.ok) {
      refetchFinalize();
      setSaveResult({ ok: true, msg: 'План фіналізовано' });
    } else {
      setSaveResult({ ok: false, msg: result.error });
    }
    setTimeout(() => setSaveResult(null), 3000);
  };
  const handleFinalize = () => {
    // Перевірка повноти: forecast+gap >= planAmount → повний; інакше попередження.
    const forecastSum = forecasts.reduce((s, f) => s + (Number(f.forecastAmount) || 0), 0);
    const gapSum = gapClosures.reduce((s, g) => s + (Number(g.potentialAmount) || 0), 0);
    if (forecastSum + gapSum < propPlanAmount) {
      setShowIncompleteConfirm(true);
      return;
    }
    void doFinalize();
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

  // Розрахунок очікуваного по наростаючому періоду — РОБОЧІ ДНІ (не календарні),
  // як на дашборді. Свята України 2026 враховані у working-days.ts.
  // ⚠️ Парсимо вручну (не `new Date(string)`) — на UTC-серверах локальний час
  // може зсунутись на день назад (`new Date('2026-05-01')` → квітень при .getMonth()).
  const [my, mm, md] = currentPeriod.month.split('-').map(Number);
  const periodMonth = new Date(my || new Date().getFullYear(), (mm || 1) - 1, md || 1);
  const [ey, em, ed] = currentPeriod.weekEnd.split('-').map(Number);
  const periodEndDate = new Date(ey || my || new Date().getFullYear(), (em || mm || 1) - 1, ed || md || 1);
  const totalWorkingDays = getWorkingDaysInMonth(periodMonth.getFullYear(), periodMonth.getMonth());
  const passedWorkingDays = getPassedWorkingDays(periodMonth.getFullYear(), periodMonth.getMonth(), periodEndDate);
  const periodLabel = getMonthName(periodMonth.getFullYear(), periodMonth.getMonth());
  const expectedAmount = totalWorkingDays > 0 ? (planAmount / totalWorkingDays) * passedWorkingDays : 0;
  const expectedPct = pctOf(expectedAmount, planAmount);
  const factPct = pctOf(factAmount, planAmount);
  const deviation = factPct - expectedPct;

  // Сортовані прогнози: невиконані зверху, виконані знизу. У межах однієї
  // групи — алфавіт по clientName. Без вторинного сортування auto-populate
  // показує клієнтів у порядку як 1С повернула (рандом), а після першого
  // save+reload — в алфавіті (бо Supabase order). User бачить як
  // 'збивається сортування'.
  const sortedForecasts = useMemo(() => {
    return [...forecasts].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.clientName || '').localeCompare(b.clientName || '', 'uk');
    });
  }, [forecasts]);

  // Аналогічно для Закриття розриву — сортуємо за алфавітом, completed вниз.
  // Раніше gapClosures рендерився як є (порядок auto-populate / load).
  const sortedGapClosures = useMemo(() => {
    // Тримаємо оригінальний index — потрібен для updateGap/removeGapClosure
    // (selectedGaps теж по index, але sync через sortedGapClosures.findIndex
    // ламає логіку). Тому сортування лише ВІЗУАЛЬНЕ — повертаємо пари
    // {row, originalIndex}.
    return gapClosures
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((a, b) => {
        if (a.row.completed !== b.row.completed) return a.row.completed ? 1 : -1;
        return (a.row.clientName || '').localeCompare(b.row.clientName || '', 'uk');
      });
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
  // regionCode беремо з user.regionCode; для невідомих/демо — порожній список.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: trainingsResponse } = useOneCData(
    'getTrainings',
    user?.regionCode ? { regionCode: user.regionCode, dateFrom: todayIso } : null,
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
  //   «активні по бренду» = купив цей бренд протягом останніх 3 місяців
  //   «неактивні по бренду» = купив колись, але >3 місяців тому → блок «Закриття розриву»
  // 1С-категорія (Активный/Спящий/...) — окрема глобальна оцінка по клієнту,
  // НЕ використовуємо її тут. Використовуємо ТІЛЬКИ дату останньої покупки бренду.
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoffDate = Date.now() - THREE_MONTHS_MS;
  const isRecentBrandPurchase = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return false;
    return new Date(y, m - 1, d).getTime() >= cutoffDate;
  };
  const activeClients = segmentClients.filter(c => isRecentBrandPurchase(c.lastPurchaseDate));
  const sleepingClients = segmentClients.filter(c => !isRecentBrandPurchase(c.lastPurchaseDate));

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
  //
  // manuallyEditedFactRows тримає clientId1c рядків де менеджер сам
  // редагував поле «Факт» через updateForecast/updateGap.
  const [manuallyEditedFactRows, setManuallyEditedFactRows] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (factByClientId.size === 0) return;
    setForecasts(prev => {
      let changed = false;
      const next = prev.map(f => {
        if (manuallyEditedFactRows.has(f.clientId1c)) return f; // skip manual edit
        const realFact = factByClientId.get(f.clientId1c) ?? 0;
        if (realFact !== f.factAmount) {
          changed = true;
          // completed = факт >= прогноз (та сама логіка що в updateForecast)
          return { ...f, factAmount: realFact, completed: realFact >= f.forecastAmount };
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
        if (realFact !== g.factAmount) {
          changed = true;
          return { ...g, factAmount: realFact, completed: realFact >= g.potentialAmount };
        }
        return g;
      });
      return changed ? next : prev;
    });
  }, [factByClientId, manuallyEditedFactRows]);

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
      userMeta: targetUserLogin ? { fullName: targetUserName || targetUserLogin } : undefined,
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
  const isNewCategory = (c?: string | null) => !!c && /(^|\s)нов(ый|ий)/i.test(c);
  const newGapRows = gapClosures.filter(g => isNewCategory(g.category));
  const sleepingGapRows = gapClosures.filter(g => !isNewCategory(g.category));
  const activeForecastSum = forecasts.reduce((s, f) => s + (f.forecastAmount || 0), 0);
  const activeFactSum = forecasts.reduce((s, f) => s + (f.factAmount || 0), 0);
  const newPotentialSum = newGapRows.reduce((s, g) => s + (g.potentialAmount || 0), 0);
  const newFactSum = newGapRows.reduce((s, g) => s + (g.factAmount || 0), 0);
  const sleepingPotentialSum = sleepingGapRows.reduce((s, g) => s + (g.potentialAmount || 0), 0);
  const sleepingFactSum = sleepingGapRows.reduce((s, g) => s + (g.factAmount || 0), 0);

  const categories: ClientCategorySummary[] = [
    { category: 'active', label: 'Активні клієнти', clientCount: forecasts.length, expectedAmount: activeForecastSum, factAmount: activeFactSum, planCoveragePercent: pctOf(activeForecastSum, planAmount) },
    { category: 'new', label: 'Нові клієнти по ТМ', clientCount: newGapRows.length, expectedAmount: newPotentialSum, factAmount: newFactSum, planCoveragePercent: pctOf(newPotentialSum, planAmount) },
    { category: 'sleeping_lost', label: 'Активація (Сплячі, Втрачені, БЗ)', clientCount: sleepingGapRows.length, expectedAmount: sleepingPotentialSum, factAmount: sleepingFactSum, planCoveragePercent: pctOf(sleepingPotentialSum, planAmount) },
  ];
  const totalCatClients = categories.reduce((s, c) => s + c.clientCount, 0);
  const totalCatAmount = categories.reduce((s, c) => s + c.expectedAmount, 0);
  const totalCatFact = categories.reduce((s, c) => s + c.factAmount, 0);
  // «Запланований %» = СКІЛЬКИ МЕНЕДЖЕР ЗАПЛАНУВАВ від плану місяця, БЕЗ факту.
  // Семантика: «менеджер обіцяє покрити X% плану своєю активністю». Якщо разом
  // з фактом він буде > 100% — це окрема метрика «передбачуване виконання»,
  // тут не показуємо.
  const totalCatPct = pctOf(totalCatAmount, planAmount);

  const CAT_ICONS: Record<string, React.ReactNode> = {
    active: <Users className="h-4 w-4 text-[#066aab]" />,
    new: <UserPlus className="h-4 w-4 text-emerald-600" />,
    sleeping_lost: <RefreshCw className="h-4 w-4 text-amber-600" />,
  };

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
  const addClient = (client: Client1C) => {
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

  // Read-only рядок «незапланованого покупця» — спільна розмітка для блоків
  // «Прогноз» і «Закриття розриву». Тільки перегляд — менеджер планує його
  // на наступний місяць, у поточному фіксуємо лише факт.
  const UnplannedRow = ({ clientId, clientName, factAmount, category }: {
    clientId: string; clientName: string; factAmount: number;
    category: Client1C['category'];
  }) => (
    <div key={`unplanned-${clientId}`}
         className="bg-white/60 rounded-2xl border border-dashed border-fuchsia-300/60 px-5 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-fuchsia-50 shrink-0">
        <AlertCircle className="h-4 w-4 text-fuchsia-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold truncate">{clientName}</p>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 font-bold whitespace-nowrap">
            не було в плані
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f4f7fb] text-muted-foreground font-semibold whitespace-nowrap">
            {categoryLabel(category)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Запланувати можна на наступний місяць</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground">Факт</p>
        <p className="text-[14px] font-bold text-emerald-600 amount">{formatUSD(factAmount)}</p>
      </div>
    </div>
  );

  // Підпис option-а у select навчань: "[Тип] DD.MM — Назва". Тип допомагає
  // менеджеру одразу бачити що це Семінар vs Майстер-клас vs інше.
  const formatTrainingOption = (t: { date: string; trainingName: string; trainingType?: string }, maxNameLen = 50) => {
    const name = t.trainingName.length > maxNameLen
      ? t.trainingName.slice(0, maxNameLen) + '…'
      : t.trainingName;
    const typePrefix = t.trainingType ? `[${t.trainingType}] ` : '';
    return `${typePrefix}${formatDate(t.date)} — ${name}`;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">{segment?.name}</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e8f4fc] text-[#066aab]">{periodLabel}</span>
        {readOnlyProp && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 flex items-center gap-1">
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
        <div className="bg-[#e8f4fc] border border-[#066aab]/20 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#066aab] text-white flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#066aab]">
              План менеджера: {targetUserName || targetUserLogin}
            </p>
            <p className="text-[12px] text-[#066aab]/70 mt-0.5">
              Логін: {targetUserLogin}
              {isAdmin ? ' · режим адміна — редагування дозволено' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Finalized banner — Пакет А Етап 2 (2026-05-13) */}
      {isFinalized && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-emerald-900">
              ✓ Фіналізовано {finalizedAt ? new Date(finalizedAt).toLocaleString('uk-UA', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
            <p className="text-[13px] text-emerald-800 mt-0.5">
              {isAdmin
                ? 'Ви бачите план у режимі адміна — можете редагувати або розфіналізувати.'
                : 'План заблокований для редагування сум і списку клієнтів. Для змін зверніться до адміністратора.'}
              {finalizedBy && ` · Фіналізував: ${finalizedBy}`}
            </p>
          </div>
        </div>
      )}

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'План місяця', value: formatUSD(planAmount), icon: <Target className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: true },
          { label: `Очікуване на ${formatDateShort(currentPeriod.weekEnd)} (${passedWorkingDays} р.д.)`, value: formatUSD(Math.round(expectedAmount)), icon: <Clock className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: true },
          { label: 'Факт', value: formatUSD(factAmount), icon: <DollarSign className="h-4.5 w-4.5" />, grad: 'from-emerald-500 to-teal-600', badge: { text: `${factPct.toFixed(1)}%`, ok: factPct >= expectedPct }, isAmount: true },
          { label: 'Відхилення', value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`, icon: deviation >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />, grad: deviation >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600', isAmount: false },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${m.grad} text-white`}>{m.icon}</div>
              {'badge' in m && m.badge && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${m.badge.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {m.badge.ok ? <ArrowUpRight className="inline h-2.5 w-2.5" /> : <ArrowDownRight className="inline h-2.5 w-2.5" />} {m.badge.text}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">{m.label}</p>
            <p className={`text-xl font-extrabold tracking-tight ${m.isAmount ? 'amount' : ''}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* === ДАНІ ПО КЛІЄНТАХ ПО ТМ === */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
          <h3 className="text-[14px] font-bold">Дані по клієнтах по ТМ</h3>
          {clientsLoading && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#066aab] font-medium">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Завантажуємо клієнтів з 1С…
            </span>
          )}
          {clientsError && <span className="text-[11px] text-rose-600" title={clientsError}>1С недоступний — показуємо порожньо</span>}
        </div>
        {clientsLoading && segmentClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <p className="text-[12px]">Збираємо активних, сплячих, нових клієнтів…</p>
          </div>
        ) : (
        <div className="divide-y divide-[#f0f2f8]">
          {categories.map(cat => (
            <div key={cat.category} className="flex md:grid md:grid-cols-[32px_1fr_70px_100px_90px_60px] flex-wrap gap-x-3 gap-y-1 items-center px-4 md:px-5 py-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb] shrink-0">{CAT_ICONS[cat.category]}</div>
              <p className="text-[13px] font-medium flex-1 min-w-0">{cat.label}</p>
              <div className="text-right basis-[60px] md:basis-auto"><p className="text-[10px] text-muted-foreground">Заплан.</p><p className="text-[14px] font-bold">{cat.clientCount}</p></div>
              <div className="text-right basis-[90px] md:basis-auto"><p className="text-[10px] text-muted-foreground">Очікувана сума</p><p className="text-[14px] font-bold font-mono amount">{formatUSD(cat.expectedAmount)}</p></div>
              <div className="text-right basis-[80px] md:basis-auto"><p className="text-[10px] text-muted-foreground">Факт</p><p className="text-[14px] font-bold font-mono amount text-emerald-700">{formatUSD(cat.factAmount)}</p></div>
              <div className="text-right basis-[60px] md:basis-auto"><p className="text-[10px] text-muted-foreground">% план</p><p className="text-[14px] font-bold text-[#066aab]">{cat.planCoveragePercent.toFixed(1)}%</p></div>
            </div>
          ))}
          {/* Незаплановані — покупці яких немає у плані менеджера, але вони
              вже купують у поточному місяці. Розбиваємо по 4 категоріях
              (active/sleeping/lost/new/none). Сума = факт продажів. */}
          {unplannedAll.length > 0 && (() => {
            const unplannedTotal = unplannedAll.reduce((s, b) => s + b.factAmount, 0);
            const unplannedPct = pctOf(unplannedTotal, planAmount);
            const subRows: Array<[string, typeof unplannedAll]> = [
              ['Активний', unplannedByCategory.active],
              ['Сплячий', unplannedByCategory.sleeping],
              ['Втрачений', unplannedByCategory.lost],
              ['Новий', unplannedByCategory.new],
              ['Без закупок', unplannedByCategory.none],
            ];
            return (
              <>
                <div className="grid grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center px-5 py-3 bg-fuchsia-50/40">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-fuchsia-100">
                    <AlertCircle className="h-4 w-4 text-fuchsia-600" />
                  </div>
                  <p className="text-[13px] font-semibold">Незаплановані <span className="text-[10px] text-muted-foreground font-normal">(купили без плану)</span></p>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">Купили</p><p className="text-[14px] font-bold">{unplannedAll.length}</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">—</p><p className="text-[14px] font-bold text-muted-foreground/40">—</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">Факт</p><p className="text-[14px] font-bold font-mono amount text-fuchsia-700">{formatUSD(unplannedTotal)}</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">% план</p><p className="text-[14px] font-bold text-fuchsia-700">{unplannedPct.toFixed(1)}%</p></div>
                </div>
                {subRows.filter(([, items]) => items.length > 0).map(([label, items]) => {
                  const sum = items.reduce((s, b) => s + b.factAmount, 0);
                  return (
                    <div key={`unp-${label}`}
                         className="grid grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center px-5 py-2 pl-12 bg-fuchsia-50/20">
                      <div />
                      <p className="text-[12px] text-muted-foreground">↳ {label}</p>
                      <p className="text-[12px] text-right">{items.length}</p>
                      <p />
                      <p className="text-[12px] font-mono text-right amount text-muted-foreground">{formatUSD(sum)}</p>
                      <div />
                    </div>
                  );
                })}
              </>
            );
          })()}

          <div className="grid grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center px-5 py-3 bg-[#f4f7fb]">
            <div />
            <p className="text-[13px] font-bold">Всього</p>
            <p className="text-[14px] font-bold text-right">{totalCatClients}</p>
            <p className="text-[14px] font-bold font-mono text-right amount">{formatUSD(totalCatAmount)}</p>
            <p className="text-[14px] font-bold font-mono text-right amount text-emerald-700">{formatUSD(totalCatFact)}</p>
            <p className="text-[14px] font-bold text-[#066aab] text-right">{totalCatPct.toFixed(1)}%</p>
          </div>
        </div>
        )}
      </div>

      {/* === ПРОГНОЗ ПО АКТИВНИХ КЛІЄНТАХ === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-bold">Прогноз по активних клієнтах</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Клієнти які купували цей сегмент за останні 3 місяці</p>
          </div>
          {!lockEdit && (
            <Button onClick={() => setSearchOpen(true)}
              className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-9 px-4 text-[13px]">
              <Search className="h-3.5 w-3.5" /> Додати клієнта
            </Button>
          )}
        </div>

        {/* Bulk action bar — з'являється коли є вибрані */}
        {!lockEdit && selectedForecasts.size > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 mb-2 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-[13px] font-semibold text-rose-700">Обрано: {selectedForecasts.size}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedForecasts(new Set())}
                className="text-[12px] font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors">
                Скасувати
              </button>
              <button onClick={bulkDeleteForecasts}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 px-4 py-1.5 rounded-lg transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Видалити обраних
              </button>
            </div>
          </div>
        )}

        {/* Заголовок колонок (тільки на md+) */}
        <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 px-5 mb-1">
          {!lockEdit && sortedForecasts.length > 0 ? (
            <input
              type="checkbox"
              aria-label="Обрати всіх"
              className="h-4 w-4 cursor-pointer accent-rose-600"
              checked={selectedForecasts.size === sortedForecasts.filter(r => !r.completed).length && sortedForecasts.filter(r => !r.completed).length > 0}
              onChange={(e) => {
                if (e.target.checked) setSelectedForecasts(new Set(sortedForecasts.filter(r => !r.completed).map(r => r.clientId1c)));
                else setSelectedForecasts(new Set());
              }}
            />
          ) : <div />}
          <div />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Прогноз</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Коментар</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
          <div />
        </div>

        {clientsLoading && sortedForecasts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground bg-white rounded-2xl border border-[#e8ebf4]">
            <svg className="h-5 w-5 animate-spin text-[#066aab]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[12px] font-medium">Завантажуємо клієнтів з 1С…</p>
          </div>
        )}
        <div className="space-y-2">
          {unplannedSplit.forecast.length > 0 && sortedForecasts.length > 0 && (
            <div className="px-5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Запланованих: {sortedForecasts.length}
            </div>
          )}
          {sortedForecasts.map((row) => {
            const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : row.stage === 'Мессенджер' ? MessageCircle : Phone;
            return (
              <div key={row.clientId1c} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-200 ${(row.completed && !isAdmin) ? 'ring-1 ring-emerald-200 opacity-60' : ''}`}>
                {/* === DESKTOP (md+) === */}
                <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 items-center px-5 py-3">
                  {/* Чекбокс multi-select (тільки для незавершених) */}
                  {!lockEdit && !(row.completed && !isAdmin) ? (
                    <input
                      type="checkbox"
                      aria-label={`Обрати ${row.clientName}`}
                      className="h-4 w-4 cursor-pointer accent-rose-600"
                      checked={selectedForecasts.has(row.clientId1c)}
                      onChange={() => toggleForecast(row.clientId1c)}
                    />
                  ) : <div />}
                  {/* Іконка статусу */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${(row.completed && !isAdmin) ? 'bg-emerald-100' : 'bg-[#f4f7fb]'}`}>
                    {(row.completed && !isAdmin) ? <Check className="h-4 w-4 text-emerald-600" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Клієнт */}
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{row.clientName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Ост: {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '—'} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span>
                    </p>
                  </div>

                  {/* Прогноз */}
                  {(row.completed && !isAdmin) ? (
                    <div className="flex items-center justify-end gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.forecastAmount)}</span>
                    </div>
                  ) : (
                    <Input type="number" value={row.forecastAmount}
                      onChange={(e) => updateForecast(row.clientId1c, 'forecastAmount', parseFloat(e.target.value) || 0)}
                      disabled={lockEdit}
                      className="amount h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                  )}

                  {/* Етап */}
                  <Select
                    value={row.stage || undefined}
                    onValueChange={(v) => updateForecast(row.clientId1c, 'stage', v)}
                    disabled={lockEdit}
                  >
                    <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                      <SelectValue placeholder="Обрати" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Статус */}
                  {row.stage ? (
                    <div className={`flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold ${
                      row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      <StageIcon className="h-3 w-3" />
                      {row.stageDone ? 'Виконано' : 'Очікується'}
                    </div>
                  ) : (
                    <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                  )}

                  {/* Коментар або Навчання + коментар */}
                  {row.stage === 'Навчання' ? (
                    <div className="flex flex-col gap-1">
                      <Select
                        value={row.trainingId || undefined}
                        onValueChange={(trainingId) => {
                          const t = trainings.find(x => x.trainingId === trainingId);
                          updateForecast(row.clientId1c, 'trainingId', trainingId);
                          if (t) {
                            updateForecast(row.clientId1c, 'trainingName', t.trainingName);
                            updateForecast(row.clientId1c, 'trainingDate', t.date);
                          }
                        }}
                        disabled={lockEdit}
                      >
                        <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                          <SelectValue placeholder="Обрати навчання з 1С..." />
                        </SelectTrigger>
                        <SelectContent>
                          {trainings.map(t => (
                            <SelectItem key={t.trainingId} value={t.trainingId}>
                              <span className="text-[12px]">
                                {formatTrainingOption(t, 50)}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                        disabled={lockEdit}
                        className="h-7 text-[11px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                    </div>
                  ) : (
                    <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                      disabled={lockEdit}
                      className="h-8 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Ціль..." />
                  )}

                  {/* Факт */}
                  <p className={`text-[14px] font-bold text-right ${row.factAmount > 0 ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                    {row.factAmount > 0 ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                  </p>

                  {/* Видалити */}
                  {!lockEdit && !(row.completed && !isAdmin) ? (
                    <button onClick={() => removeForecast(row.clientId1c)} aria-label="Видалити клієнта"
                      className="p-2 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : <div />}
                </div>

                {/* === MOBILE (<md): vertical-stack картка === */}
                <div className="md:hidden p-4 space-y-3">
                  {/* Шапка: чекбокс + іконка + ім'я + delete */}
                  <div className="flex items-start gap-3">
                    {!lockEdit && !(row.completed && !isAdmin) && (
                      <input
                        type="checkbox"
                        aria-label={`Обрати ${row.clientName}`}
                        className="h-5 w-5 mt-2 cursor-pointer accent-rose-600 shrink-0"
                        checked={selectedForecasts.has(row.clientId1c)}
                        onChange={() => toggleForecast(row.clientId1c)}
                      />
                    )}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${(row.completed && !isAdmin) ? 'bg-emerald-100' : 'bg-[#f4f7fb]'}`}>
                      {(row.completed && !isAdmin) ? <Check className="h-4 w-4 text-emerald-600" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold leading-tight">{row.clientName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Ост: {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '—'} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span>
                      </p>
                    </div>
                    {!lockEdit && !(row.completed && !isAdmin) && (
                      <button onClick={() => removeForecast(row.clientId1c)} aria-label="Видалити клієнта"
                        className="p-2.5 rounded-lg hover:bg-rose-50 text-muted-foreground/40 hover:text-rose-500 transition-colors shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Прогноз + Факт у двох колонках */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Прогноз</label>
                      {(row.completed && !isAdmin) ? (
                        <p className="text-[14px] font-bold text-muted-foreground amount mt-1">{formatUSD(row.forecastAmount)}</p>
                      ) : (
                        <Input type="number" value={row.forecastAmount}
                          onChange={(e) => updateForecast(row.clientId1c, 'forecastAmount', parseFloat(e.target.value) || 0)}
                          disabled={lockEdit}
                          className="amount h-9 w-full text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1" />
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Факт</label>
                      <p className={`text-[14px] font-bold mt-1.5 ${row.factAmount > 0 ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                        {row.factAmount > 0 ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Етап + статус */}
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Етап</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={row.stage || undefined}
                        onValueChange={(v) => updateForecast(row.clientId1c, 'stage', v)}
                        disabled={lockEdit}
                      >
                        <SelectTrigger className="h-9 flex-1 text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                          <SelectValue placeholder="Обрати" />
                        </SelectTrigger>
                        <SelectContent>
                              {STAGE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {row.stage && (
                        <div className={`flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                          row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          <StageIcon className="h-3 w-3" />
                          {row.stageDone ? 'Викон.' : 'Очік.'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Коментар (+ Навчання якщо stage='Навчання') */}
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Коментар</label>
                    {row.stage === 'Навчання' && (
                      <Select
                        value={row.trainingId || undefined}
                        onValueChange={(trainingId) => {
                          const t = trainings.find(x => x.trainingId === trainingId);
                          updateForecast(row.clientId1c, 'trainingId', trainingId);
                          if (t) {
                            updateForecast(row.clientId1c, 'trainingName', t.trainingName);
                            updateForecast(row.clientId1c, 'trainingDate', t.date);
                          }
                        }}
                        disabled={lockEdit}
                      >
                        <SelectTrigger className="h-9 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe] mt-1" disabled={lockEdit}>
                          <SelectValue placeholder="Обрати навчання..." />
                        </SelectTrigger>
                        <SelectContent>
                          {trainings.map(t => (
                            <SelectItem key={t.trainingId} value={t.trainingId}>
                              <span className="text-[12px]">{formatTrainingOption(t, 40)}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                      disabled={lockEdit}
                      className="h-9 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1"
                      placeholder={row.stage === 'Навчання' ? 'Коментар (необов\'язково)...' : 'Ціль...'} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Незаплановані покупці (категорія `active`) — read-only внизу.
              Купив без плану цього місяця, але активний — закладемо на наступний. */}
          {unplannedSplit.forecast.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">
                Незапланованих: {unplannedSplit.forecast.length}
              </div>
              {unplannedSplit.forecast.map(b => (
                <UnplannedRow key={`fc-unp-${b.clientId}`}
                  clientId={b.clientId} clientName={b.clientName}
                  factAmount={b.factAmount} category={b.category} />
              ))}
            </>
          )}
        </div>

        {/* Підсумок прогнозу */}
        {forecasts.length > 0 && (
          <div className="mt-3 bg-[#f4f7fb] rounded-2xl p-4 flex items-center gap-6 flex-wrap">
            <div><span className="text-[11px] text-muted-foreground">Прогноз</span><p className="text-lg font-extrabold amount">{formatUSD(forecastTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Факт</span><p className="text-lg font-extrabold text-emerald-600 amount">{formatUSD(forecastFactTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Незавершено</span><p className="text-lg font-extrabold amount">{formatUSD(pendingForecastTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{forecasts.length} <span className="text-emerald-600 text-sm">({forecasts.filter(f => f.completed).length} ✓)</span></p></div>
          </div>
        )}
      </div>

      {/* === ЗАКРИТТЯ РОЗРИВУ === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-[15px] font-bold">Закриття розриву</h3>
              {gapAfterForecast > 0 ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-3 w-3" /> <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600">Покрито</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Очікуване <span className="amount">{formatUSD(Math.round(expectedAmount))}</span> − факт <span className="amount">{formatUSD(factAmount)}</span> − прогноз <span className="amount">{formatUSD(pendingForecastTotal)}</span> = розрив <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
            </p>
          </div>
          {!lockEdit && (
            <Button onClick={() => setGapSearchOpen(true)}
              className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-9 px-4 text-[13px]">
              <Search className="h-3.5 w-3.5" /> Додати клієнта
            </Button>
          )}
        </div>

        {clientsLoading && gapClosures.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground bg-white rounded-2xl border border-[#e8ebf4]">
            <svg className="h-5 w-5 animate-spin text-[#066aab]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[12px] font-medium">Завантажуємо клієнтів з 1С…</p>
          </div>
        )}
        {/* Bulk action bar для gap-closures */}
        {!lockEdit && selectedGaps.size > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 mb-2 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-[13px] font-semibold text-rose-700">Обрано: {selectedGaps.size}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedGaps(new Set())}
                className="text-[12px] font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors">
                Скасувати
              </button>
              <button onClick={bulkDeleteGaps}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 px-4 py-1.5 rounded-lg transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Видалити обраних
              </button>
            </div>
          </div>
        )}
        {(gapClosures.length > 0 || unplannedSplit.gap.length > 0) && (
          <div>
            {/* Заголовки колонок (тільки md+) */}
            {gapClosures.length > 0 && (
              <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 px-5 mb-1">
                {!lockEdit ? (
                  <input
                    type="checkbox"
                    aria-label="Обрати всіх"
                    className="h-4 w-4 cursor-pointer accent-rose-600"
                    checked={selectedGaps.size === gapClosures.filter(r => !r.completed).length && gapClosures.filter(r => !r.completed).length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next = new Set<number>();
                        gapClosures.forEach((r, i) => { if (!r.completed) next.add(i); });
                        setSelectedGaps(next);
                      } else setSelectedGaps(new Set());
                    }}
                  />
                ) : <div />}
                <div />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Потенціал</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Дія / Навчання</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
                <div />
              </div>
            )}

            <div className="space-y-2">
            {sortedGapClosures.map(({ row, originalIndex: i }) => {
              const hasFact = row.factAmount > 0;
              const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : row.stage === 'Мессенджер' ? MessageCircle : Phone;
              return (
                <div key={row.clientId1c || `idx-${i}`} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden ${(row.completed && !isAdmin) ? 'ring-1 ring-emerald-200 opacity-60' : hasFact ? 'ring-1 ring-emerald-200' : ''}`}>
                  {/* === DESKTOP (md+) === */}
                  <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 items-center px-5 py-3">
                    {/* Чекбокс multi-select */}
                    {!lockEdit && !(row.completed && !isAdmin) ? (
                      <input
                        type="checkbox"
                        aria-label={`Обрати ${row.clientName}`}
                        className="h-4 w-4 cursor-pointer accent-rose-600"
                        checked={selectedGaps.has(i)}
                        onChange={() => toggleGap(i)}
                      />
                    ) : <div />}
                    {/* Іконка */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${(row.completed && !isAdmin) || hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                      {(row.completed && !isAdmin) || hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>

                    {/* Клієнт */}
                    <div className="min-w-0">
                      {row.manuallyAdded ? (
                        <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)}
                          disabled={lockEdit}
                          className="h-7 text-[13px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                      ) : (
                        <p className="text-[13px] font-semibold truncate">{row.clientName}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {row.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">{row.category}</span>}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {row.lastPurchaseDate ? <>{formatDate(row.lastPurchaseDate)} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span></> : ''}
                        </span>
                      </div>
                    </div>

                    {/* Потенціал */}
                    {(row.completed && !isAdmin) ? (
                      <div className="flex items-center justify-end gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground/40" />
                        <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.potentialAmount)}</span>
                      </div>
                    ) : (
                      <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)}
                        disabled={lockEdit}
                        className="amount h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    )}

                    {/* Етап */}
                    <Select
                      value={row.stage || undefined}
                      onValueChange={(v) => updateGap(i, 'stage', v)}
                      disabled={lockEdit}
                    >
                      <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                        <SelectValue placeholder="Обрати" />
                      </SelectTrigger>
                      <SelectContent>
                          {STAGE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Статус */}
                    {row.stage ? (
                      <div className={`flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold ${
                        row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        <StageIcon className="h-3 w-3" />
                        {row.stageDone ? 'Виконано' : 'Очікується'}
                      </div>
                    ) : (
                      <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                    )}

                    {/* Дія / Навчання — Навчання показує селектор + комментар, інакше тільки коментар */}
                    {row.stage === 'Навчання' ? (
                      <div className="flex flex-col gap-1">
                        <Select
                          value={row.trainingId || undefined}
                          onValueChange={(trainingId) => {
                            const t = trainings.find(x => x.trainingId === trainingId);
                            updateGap(i, 'trainingId', trainingId);
                            if (t) {
                              updateGap(i, 'trainingName', t.trainingName);
                              updateGap(i, 'trainingDate', t.date);
                              updateGap(i, 'deadline', t.date);
                            }
                          }}
                          disabled={lockEdit}
                        >
                          <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                            <SelectValue placeholder="Обрати навчання з 1С..." />
                          </SelectTrigger>
                          <SelectContent>
                            {trainings.map(t => (
                              <SelectItem key={t.trainingId} value={t.trainingId}>
                                <span className="text-[12px]">
                                  {formatTrainingOption(t, 50)}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)}
                          disabled={lockEdit}
                          className="h-7 text-[11px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                      </div>
                    ) : (
                      <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)}
                        disabled={lockEdit}
                        className="h-8 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                    )}

                    {/* Факт */}
                    <p className={`text-[14px] font-bold text-right ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                      {hasFact ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                    </p>

                    {/* Видалити */}
                    {!lockEdit ? (
                      <button onClick={() => removeGapClosure(i)} aria-label="Видалити клієнта"
                        className="p-2 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : <div />}
                  </div>

                  {/* === MOBILE (<md): vertical-stack картка === */}
                  <div className="md:hidden p-4 space-y-3">
                    {/* Шапка */}
                    <div className="flex items-start gap-3">
                      {!lockEdit && !(row.completed && !isAdmin) && (
                        <input
                          type="checkbox"
                          aria-label={`Обрати ${row.clientName}`}
                          className="h-5 w-5 mt-2 cursor-pointer accent-rose-600 shrink-0"
                          checked={selectedGaps.has(i)}
                          onChange={() => toggleGap(i)}
                        />
                      )}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${(row.completed && !isAdmin) || hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                        {(row.completed && !isAdmin) || hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {row.manuallyAdded ? (
                          <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)} disabled={lockEdit}
                            className="h-7 text-[13px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                        ) : (
                          <p className="text-[13px] font-semibold leading-tight">{row.clientName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {row.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">{row.category}</span>}
                          {row.lastPurchaseDate && (
                            <span className="text-[10px] text-muted-foreground">{formatDate(row.lastPurchaseDate)} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span></span>
                          )}
                        </div>
                      </div>
                      {!lockEdit && !(row.completed && !isAdmin) && (
                        <button onClick={() => removeGapClosure(i)} aria-label="Видалити клієнта"
                          className="p-2.5 rounded-lg hover:bg-rose-50 text-muted-foreground/40 hover:text-rose-500 transition-colors shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Потенціал + Факт */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Потенціал</label>
                        {(row.completed && !isAdmin) ? (
                          <p className="text-[14px] font-bold text-muted-foreground amount mt-1">{formatUSD(row.potentialAmount)}</p>
                        ) : (
                          <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)} disabled={lockEdit}
                            className="amount h-9 w-full text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1" />
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Факт</label>
                        <p className={`text-[14px] font-bold mt-1.5 ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                          {hasFact ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Етап + статус */}
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Етап</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Select value={row.stage || undefined}
                          onValueChange={(v) => updateGap(i, 'stage', v)}
                          disabled={lockEdit}>
                          <SelectTrigger className="h-9 flex-1 text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                            <SelectValue placeholder="Обрати" />
                          </SelectTrigger>
                          <SelectContent>
                                  {STAGE_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        {row.stage && (
                          <div className={`flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap ${row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            <StageIcon className="h-3 w-3" />
                            {row.stageDone ? 'Викон.' : 'Очік.'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Дія / Навчання + коментар */}
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Дія</label>
                      {row.stage === 'Навчання' && (
                        <Select value={row.trainingId || undefined}
                          onValueChange={(trainingId) => {
                            const t = trainings.find(x => x.trainingId === trainingId);
                            updateGap(i, 'trainingId', trainingId);
                            if (t) { updateGap(i, 'trainingName', t.trainingName); updateGap(i, 'trainingDate', t.date); }
                          }}
                          disabled={lockEdit}>
                          <SelectTrigger className="h-9 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe] mt-1" disabled={lockEdit}>
                            <SelectValue placeholder="Обрати навчання..." />
                          </SelectTrigger>
                          <SelectContent>
                            {trainings.map(t => (
                              <SelectItem key={t.trainingId} value={t.trainingId}>
                                <span className="text-[12px]">{formatTrainingOption(t, 40)}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)} disabled={lockEdit}
                        className="h-9 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1"
                        placeholder={row.stage === 'Навчання' ? 'Коментар (необов\'язково)...' : 'Дія...'} />
                    </div>
                  </div>
                </div>
              );
            })}

              {/* Незаплановані з категорій Сплячий / Втрачений / Новий / БЗ —
                  read-only внизу. Менеджер планує їх на наступний місяць. */}
              {unplannedSplit.gap.length > 0 && (
                <>
                  <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">
                    Незапланованих: {unplannedSplit.gap.length}
                  </div>
                  {unplannedSplit.gap.map(b => (
                    <UnplannedRow key={`gap-unp-${b.clientId}`}
                      clientId={b.clientId} clientName={b.clientName}
                      factAmount={b.factAmount} category={b.category} />
                  ))}
                </>
              )}
            </div>

            {gapClosures.length > 0 && (
              <div className="mt-3 bg-amber-50/50 rounded-2xl border border-amber-200/30 p-4 flex items-center gap-6 flex-wrap">
                <div><span className="text-[11px] text-muted-foreground">Потенціал</span><p className="text-lg font-extrabold amount">{formatUSD(gapTotal)}</p></div>
                <div className="w-px h-8 bg-amber-200/40" />
                <div><span className="text-[11px] text-muted-foreground">Факт</span><p className="text-lg font-extrabold text-emerald-600 amount">{formatUSD(gapFactTotal)}</p></div>
                <div className="w-px h-8 bg-amber-200/40" />
                <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{gapClosures.length}</p></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Дії для закриття */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
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

      {/* Sticky save bar — внизу екрана. Менеджер у довгій формі (25+ рядків)
          бачить «Зберегти» весь час, не треба скролити. */}
      {!lockEdit && (
        <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/85 backdrop-blur-md border-t border-[#e2e7ef] flex items-center justify-end gap-3 z-10">
          {lastSavedAt && !saveResult && (
            <span className="text-[11px] text-muted-foreground mr-auto">
              Остання чернетка: {new Date(lastSavedAt).toLocaleString('uk-UA', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
          {saveResult && (
            <span className={`text-[13px] font-medium px-3 py-1.5 rounded-lg ${
              saveResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`} role="status">
              {saveResult.msg}
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || finalizing}
            className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-11 px-6 text-[14px] font-semibold disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-label="Збереження..."><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Зберігаю...
              </>
            ) : (
              <><Save className="h-4 w-4" /> Зберегти чернетку</>
            )}
          </Button>
          {!isFinalized && (
            <Button
              onClick={handleFinalize}
              disabled={saving || finalizing}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/15 rounded-xl h-11 px-6 text-[14px] font-semibold disabled:opacity-50"
              title="Заблокувати план від подальших змін сум і списку клієнтів"
            >
              <Lock className="h-4 w-4" />
              {finalizing ? 'Фіналізую…' : 'Фіналізувати'}
            </Button>
          )}
          {isFinalized && isAdmin && (
            <Button
              onClick={handleUnfinalize}
              disabled={saving || finalizing}
              className="gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/15 rounded-xl h-11 px-6 text-[14px] font-semibold disabled:opacity-50"
              title="Зняти фіналізацію — дозволити менеджеру редагувати"
            >
              <RefreshCw className="h-4 w-4" />
              {finalizing ? 'Розфіналізую…' : 'Розфіналізувати'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showIncompleteConfirm}
        title="Увага — план неповний"
        description={(() => {
          const fSum = forecasts.reduce((s, f) => s + (Number(f.forecastAmount) || 0), 0);
          const gSum = gapClosures.reduce((s, g) => s + (Number(g.potentialAmount) || 0), 0);
          const diff = Math.max(0, propPlanAmount - (fSum + gSum));
          const pct = propPlanAmount > 0 ? ((fSum + gSum) / propPlanAmount) * 100 : 0;
          return `Запланована сума менше за план на ${formatUSD(diff)}, відсоток планування — ${pct.toFixed(1)}%. Ви впевнені що хочете фіналізувати? Після цього неможливо додати клієнтів чи змінити суми.`;
        })()}
        confirmLabel="Так, фіналізувати"
        cancelLabel="Назад"
        onConfirm={() => { setShowIncompleteConfirm(false); void doFinalize(); }}
        onCancel={() => setShowIncompleteConfirm(false)}
      />


      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={addClient} excludeIds={existingIds} clients={segmentClients} loading={clientsLoading} />
      <ClientSearchModal open={gapSearchOpen} onClose={() => setGapSearchOpen(false)} onSelect={addGapClient} excludeIds={[...gapExistingIds, ...existingIds]} clients={allManagerClients} loading={clientsLoading} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.type === 'forecast-bulk'
            ? `Видалити ${pendingDelete.ids.length} клієнтів з прогнозу?`
            : pendingDelete?.type === 'gap-bulk'
            ? `Видалити ${pendingDelete.indices.length} клієнтів з закриття розриву?`
            : pendingDelete?.type === 'forecast' || pendingDelete?.type === 'gap'
            ? `Видалити «${pendingDelete.clientName}»?`
            : ''
        }
        description={
          pendingDelete?.type === 'forecast' || pendingDelete?.type === 'forecast-bulk'
            ? 'Зникнуть з блоку «Прогноз по активних». Дія застосується після збереження.'
            : 'Зникнуть з блоку «Закриття розриву». Дія застосується після збереження.'
        }
        confirmLabel="Видалити"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
