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
          action: g.action,
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
  } catch (err) {
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
