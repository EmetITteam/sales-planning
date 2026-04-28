import type { ForecastRow, GapClosureRow, GapActions } from './types';

interface SavePlanningParams {
  userId: number;
  segmentCode: string;
  periodId: number;
  forecasts: ForecastRow[];
  gapClosures: GapClosureRow[];
  monthForecastPct: string;
  monthForecastUsd: string;
  gapActions: GapActions;
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

export async function savePlanning(params: SavePlanningParams): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        segmentCode: params.segmentCode,
        periodId: params.periodId,
        forecasts: params.forecasts.map(f => ({
          clientId1c: f.clientId1c,
          clientName: f.clientName,
          forecastAmount: f.forecastAmount,
          stage: f.stage,
          stageComment: f.stageComment,
          completed: f.completed,
          manuallyAdded: f.manuallyAdded || false,
        })),
        gapClosures: params.gapClosures.map(g => ({
          clientId1c: g.clientId1c,
          clientName: g.clientName,
          category: g.category,
          potentialAmount: g.potentialAmount,
          action: packGapAction(g),
          deadline: g.deadline,
          manuallyAdded: g.manuallyAdded || false,
        })),
        summary: {
          monthForecastPct: parseFloat(params.monthForecastPct) || null,
          monthForecastUsd: parseFloat(params.monthForecastUsd) || null,
          gapAction1: params.gapActions.action1 || null,
          gapAction2: params.gapActions.action2 || null,
          gapAction3: params.gapActions.action3 || null,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true };
  } catch {
    return { success: false, error: 'Помилка мережі' };
  }
}

interface LoadPlanningResult {
  forecasts: Array<{
    id: number;
    client_id_1c: string;
    client_name: string;
    forecast_amount: number;
    stage: string | null;
    stage_comment: string | null;
    completed: boolean;
    manually_added: boolean;
  }>;
  gapClosures: Array<{
    id: number;
    client_id_1c: string;
    client_name: string;
    category: string | null;
    potential_amount: number;
    action: string | null;
    deadline: string | null;
    manually_added: boolean;
  }>;
  summary: {
    month_forecast_pct: number | null;
    month_forecast_usd: number | null;
    gap_action_1: string | null;
    gap_action_2: string | null;
    gap_action_3: string | null;
  } | null;
}

export async function loadPlanning(userId: number, segmentCode: string, periodId: number): Promise<LoadPlanningResult | null> {
  try {
    const res = await fetch(`/api/planning?userId=${userId}&segmentCode=${segmentCode}&periodId=${periodId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
