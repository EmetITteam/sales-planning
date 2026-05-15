import type { ForecastRow, GapClosureRow, GapActions, PeriodInfo } from './types';

interface SavePlanningParams {
  segmentCode: string;
  periodId: number;
  /**
   * Метадані періоду — потрібно щоб сервер міг upsert-ити рядок у `periods`
   * перед вставкою forecasts (foreign key constraint).
   */
  period: Pick<PeriodInfo, 'weekStart' | 'weekEnd' | 'month'>;
  /**
   * Drill-down: якщо РМ зберігає за свого менеджера — тут логін цільового
   * менеджера. Сервер перевірить що він у session.managedUsers. Якщо undefined
   * — сервер бере login з сесії (звичайне зберігання свого плану).
   */
  targetLogin?: string;
  /**
   * Метадані профілю — потрібно щоб upsert-ити рядок у `users` ТІЛЬКИ для
   * drill-down (РМ зберігає за свого менеджера, у session дані РМ а не цільового).
   * Якщо `targetLogin` не передано — сервер ігнорує і бере профіль з сесії.
   */
  userMeta?: {
    fullName: string;
    role?: string;
    region?: string;
    regionCode?: string;
  };
  forecasts: ForecastRow[];
  gapClosures: GapClosureRow[];
  gapActions: GapActions;
  /** Якщо true — сервер дозволяє повний wipe (інакше пустий list = no-op). */
  clearAll?: boolean;
}

// === Forecast: пакуємо trainingId/Name/Date + stageDone у JSON у legacy `stage_comment` ===
// Та сама логіка як для gap-closure (`action`) — обхід міграції БД.
// v3 (2026-05-07): додано stageDone (раніше втрачався після reload).
export function packForecastStageComment(f: ForecastRow): string {
  // Якщо нема ні навчання ні позначки виконання — пишемо звичайний коментар (чисто текст)
  // щоб legacy-сумісність не ламалась.
  if (!f.trainingId && !f.trainingName && !f.trainingDate && !f.stageDone) {
    return f.stageComment || '';
  }
  return JSON.stringify({
    v: 3,
    comment: f.stageComment,
    stageDone: f.stageDone,
    trainingId: f.trainingId,
    trainingName: f.trainingName,
    trainingDate: f.trainingDate,
  });
}

export interface UnpackedForecastStageComment {
  comment: string;
  stageDone: boolean;
  trainingId?: string;
  trainingName?: string;
  trainingDate?: string;
}

export function unpackForecastStageComment(raw: string | null): UnpackedForecastStageComment {
  if (!raw) return { comment: '', stageDone: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed.v === 2 || parsed.v === 3)) {
      return {
        comment: parsed.comment ?? '',
        // v2 не зберігав stageDone — fallback false. v3+ — читаємо.
        stageDone: !!parsed.stageDone,
        trainingId: parsed.trainingId,
        trainingName: parsed.trainingName,
        trainingDate: parsed.trainingDate,
      };
    }
  } catch {
    // Legacy: звичайний текст коментаря
  }
  return { comment: raw, stageDone: false };
}

// Пакуємо нові поля gap-closure (v2.1) в JSON у legacy колонці `action` Supabase —
// уникаємо міграції БД. На бекенді — той самий рядок, на фронті — структуровані поля.
export function packGapAction(g: GapClosureRow): string {
  return JSON.stringify({
    v: 2,
    stage: g.stage,
    stageComment: g.stageComment,
    stageDone: g.stageDone,
    completed: g.completed,
    trainingId: g.trainingId,
    trainingName: g.trainingName,
    trainingDate: g.trainingDate,
  });
}

export interface UnpackedGapAction {
  stage: GapClosureRow['stage'];
  stageComment: string;
  stageDone: boolean;
  completed: boolean;
  trainingId?: string;
  trainingName?: string;
  trainingDate?: string;
}

export function unpackGapAction(actionStr: string | null): UnpackedGapAction {
  if (!actionStr) return { stage: '', stageComment: '', stageDone: false, completed: false };
  try {
    const parsed = JSON.parse(actionStr);
    if (parsed && typeof parsed === 'object' && parsed.v === 2) {
      return {
        stage: parsed.stage ?? '',
        stageComment: parsed.stageComment ?? '',
        stageDone: !!parsed.stageDone,
        completed: !!parsed.completed,
        trainingId: parsed.trainingId,
        trainingName: parsed.trainingName,
        trainingDate: parsed.trainingDate,
      };
    }
  } catch {
    // Legacy: action — звичайний текст. Кладемо в коментар.
  }
  return { stage: 'Дзвінок', stageComment: actionStr, stageDone: false, completed: false };
}

export interface SavePlanningResult {
  success: boolean;
  error?: string;
  /** Кількість рядків які реально потрапили у backend UPSERT (НЕ кількість у БД). */
  counts?: { forecasts: number; gaps: number };
  /** ISO timestamp коли backend завершив save. */
  savedAt?: string;
}

export async function savePlanning(params: SavePlanningParams): Promise<SavePlanningResult> {
  try {
    const res = await fetch('/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segmentCode: params.segmentCode,
        periodId: params.periodId,
        period: params.period,
        targetLogin: params.targetLogin,
        userMeta: params.userMeta,
        clearAll: params.clearAll,
        // ⚠️ Після migration M3 (2026-05-08) пишемо raw поля — без JSON-pack.
        // Сервер кладе їх у дедіковані колонки training_id / training_name /
        // training_date / stage_done (forecasts) і відповідні у gap_closures.
        forecasts: params.forecasts.map(f => ({
          clientId1c: f.clientId1c,
          clientName: f.clientName,
          forecastAmount: f.forecastAmount,
          stage: f.stage,
          stageComment: f.stageComment || null,
          completed: f.completed,
          manuallyAdded: f.manuallyAdded || false,
          trainingId: f.trainingId || null,
          trainingName: f.trainingName || null,
          trainingDate: f.trainingDate || null,
          stageDone: f.stageDone || false,
        })),
        gapClosures: params.gapClosures.map(g => ({
          clientId1c: g.clientId1c,
          clientName: g.clientName,
          category: g.category,
          potentialAmount: g.potentialAmount,
          deadline: g.deadline,
          manuallyAdded: g.manuallyAdded || false,
          stage: g.stage || null,
          stageComment: g.stageComment || null,
          stageDone: g.stageDone || false,
          closureCompleted: g.completed || false,
          trainingId: g.trainingId || null,
          trainingName: g.trainingName || null,
          trainingDate: g.trainingDate || null,
        })),
        summary: {
          gapAction1: params.gapActions.action1 || null,
          gapAction2: params.gapActions.action2 || null,
          gapAction3: params.gapActions.action3 || null,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true, counts: data.counts, savedAt: data.savedAt };
  } catch {
    return { success: false, error: 'Помилка мережі' };
  }
}

export interface LoadPlanningResult {
  forecasts: Array<{
    id: number;
    client_id_1c: string;
    client_name: string;
    forecast_amount: number;
    stage: string | null;
    stage_comment: string | null;
    completed: boolean;
    manually_added: boolean;
    /** v2 (after migration M3 — 2026-05-08): окремі колонки замість JSON-pack. */
    training_id: string | null;
    training_name: string | null;
    training_date: string | null;
    stage_done: boolean;
  }>;
  gapClosures: Array<{
    id: number;
    client_id_1c: string;
    client_name: string;
    category: string | null;
    potential_amount: number;
    deadline: string | null;
    manually_added: boolean;
    /** v2 (after migration M3): окремі колонки замість JSON-pack у `action`. */
    stage: string | null;
    stage_comment: string | null;
    stage_done: boolean;
    closure_completed: boolean;
    training_id: string | null;
    training_name: string | null;
    training_date: string | null;
  }>;
  summary: {
    gap_action_1: string | null;
    gap_action_2: string | null;
    gap_action_3: string | null;
    updated_at?: string | null;
    /** M9: timestamp фіналізації плану. NULL = чернетка. */
    finalized_at?: string | null;
  } | null;
}

export async function loadPlanning(login: string, segmentCode: string, periodId: number): Promise<LoadPlanningResult | null> {
  try {
    const params = new URLSearchParams({ login, segmentCode, periodId: String(periodId) });
    const res = await fetch(`/api/planning?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
