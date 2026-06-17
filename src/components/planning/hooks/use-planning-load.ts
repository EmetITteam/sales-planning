import { useEffect } from 'react';
import { loadPlanning } from '@/lib/api';
import type { ForecastRow, GapClosureRow, GapActions } from '@/lib/types';

/**
 * Hook: завантаження збережених planning-даних з Supabase + reset stale state.
 *
 * Запускається при зміні (segmentCode, currentPeriodId, effectiveLogin).
 * Спочатку очищає весь state (запобігає тому щоб у формі лишились прогнози
 * попереднього користувача при drill-down/logout/перемикання бренду).
 * Потім fetch + parse → заповнює forecasts/gapClosures/gapActions/persistedClientIds.
 *
 * Передає всі setters як props бо state живе у parent (PlanningForm). Це
 * trade-off між «чистий хук» і «один великий refactor». На наступному кроці
 * можна об'єднати весь planning-state у `usePlanningFormState`.
 *
 * Виокремлено з planning-form.tsx (Day 7 рефактору).
 */
export function usePlanningLoad({
  segmentCode,
  currentPeriodId,
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
}: {
  segmentCode: string;
  currentPeriodId: number;
  effectiveLogin: string;
  setForecasts: (rows: ForecastRow[]) => void;
  setGapClosures: (rows: GapClosureRow[]) => void;
  setGapActions: (a: GapActions) => void;
  setSupabaseLoaded: (v: boolean) => void;
  setPersistedClientIds: (ids: Set<string>) => void;
  setSelectedForecasts: (ids: Set<string>) => void;
  setSelectedGaps: (idx: Set<number>) => void;
  setFormEverEdited: (v: boolean) => void;
  setManuallyEditedFactRows: (ids: Set<string>) => void;
  setLastSavedAt: (ts: string | null) => void;
}) {
  // ⚠️ При зміні (effectiveLogin, segmentCode, currentPeriod) ОЧИЩАЄМО stale state
  // ДО fetch — інакше при логауті/drill-down іншого менеджера у формі лишаються
  // прогнози попереднього користувача. supabaseLoaded скидаємо щоб handleSave guard
  // не дав зберегти доки не дочекались відповіді.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    loadPlanning(effectiveLogin, segmentCode, currentPeriodId).then(data => {
      if (cancelled) return;
      setSupabaseLoaded(true);
      if (!data) return;
      // У ФОРМІ менеджер має бачити що draft-клієнти у плані → не дублюємо
      // у блоці «Незаплановані». persistedClientIds = ВСІ рядки у Supabase
      // (draft + finalized). На дашборді логіка інша (тільки finalized).
      const persisted = new Set<string>();
      for (const f of data.forecasts) if (f.client_id_1c) persisted.add(f.client_id_1c);
      for (const g of data.gapClosures) if (g.client_id_1c) persisted.add(g.client_id_1c);
      setPersistedClientIds(persisted);
      // ⚠️ Після migration M3: читаємо дедіковані колонки замість unpack JSON.
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
          // після того як segmentClients (1С Action 2) прийде.
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
      }
      // ⚠️ Day 14 fix (2026-05-14): formEverEdited тільки якщо у БД є РЕАЛЬНІ
      // дані. Раніше ставили true просто від наявності period_summaries запису,
      // через що сценарій «finalize порожнім → admin розфіналізував» залишав
      // менеджера у вічно-пустій формі.
      const hasPlanData = data.forecasts.length > 0
        || data.gapClosures.length > 0
        || !!data.summary?.gap_action_1
        || !!data.summary?.gap_action_2
        || !!data.summary?.gap_action_3;
      if (hasPlanData) setFormEverEdited(true);
    });
    return () => { cancelled = true; };
  }, [segmentCode, currentPeriodId, effectiveLogin]);
}
