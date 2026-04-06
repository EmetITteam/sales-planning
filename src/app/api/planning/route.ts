import { supabase } from '@/lib/supabase';
import { NextRequest } from 'next/server';

// GET — завантажити дані планування для менеджера/ТМ/періоду
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get('userId');
  const segmentCode = searchParams.get('segmentCode');
  const periodId = searchParams.get('periodId');

  if (!userId || !segmentCode || !periodId) {
    return Response.json({ error: 'Missing params: userId, segmentCode, periodId' }, { status: 400 });
  }

  const pid = parseInt(periodId);
  const uid = parseInt(userId);

  // Прогнози
  const { data: forecasts, error: fErr } = await supabase
    .from('forecasts')
    .select('*')
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode)
    .order('completed', { ascending: true })
    .order('client_name', { ascending: true });

  if (fErr) return Response.json({ error: fErr.message }, { status: 500 });

  // Закриття розриву
  const { data: gapClosures, error: gErr } = await supabase
    .from('gap_closures')
    .select('*')
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode)
    .order('client_name', { ascending: true });

  if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

  // Підсумки періоду
  const { data: summary, error: sErr } = await supabase
    .from('period_summaries')
    .select('*')
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode)
    .single();

  return Response.json({
    forecasts: forecasts ?? [],
    gapClosures: gapClosures ?? [],
    summary: sErr ? null : summary,
  });
}

// POST — зберегти все планування одним запитом
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, segmentCode, periodId, forecasts, gapClosures, summary } = body;

  if (!userId || !segmentCode || !periodId) {
    return Response.json({ error: 'Missing: userId, segmentCode, periodId' }, { status: 400 });
  }

  const pid = parseInt(periodId);
  const uid = parseInt(userId);

  // 1. Видалити старі прогнози для цього менеджера/ТМ/періоду
  await supabase
    .from('forecasts')
    .delete()
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode);

  // 2. Вставити нові прогнози
  if (forecasts && forecasts.length > 0) {
    const forecastRows = forecasts.map((f: {
      clientId1c: string;
      clientName: string;
      forecastAmount: number;
      stage: string;
      stageComment: string;
      completed: boolean;
      manuallyAdded?: boolean;
    }) => ({
      period_id: pid,
      user_id: uid,
      segment_code: segmentCode,
      client_id_1c: f.clientId1c,
      client_name: f.clientName,
      forecast_amount: f.forecastAmount,
      stage: f.stage || null,
      stage_comment: f.stageComment || null,
      completed: f.completed || false,
      manually_added: f.manuallyAdded || false,
    }));

    const { error: insertErr } = await supabase.from('forecasts').insert(forecastRows);
    if (insertErr) return Response.json({ error: `Forecasts: ${insertErr.message}` }, { status: 500 });
  }

  // 3. Видалити старі gap closures
  await supabase
    .from('gap_closures')
    .delete()
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode);

  // 4. Вставити нові gap closures
  if (gapClosures && gapClosures.length > 0) {
    const gapRows = gapClosures.map((g: {
      clientId1c: string;
      clientName: string;
      category: string;
      potentialAmount: number;
      action: string;
      deadline: string;
      manuallyAdded?: boolean;
    }) => ({
      period_id: pid,
      user_id: uid,
      segment_code: segmentCode,
      client_id_1c: g.clientId1c || 'manual_' + Date.now(),
      client_name: g.clientName,
      category: g.category || null,
      potential_amount: g.potentialAmount,
      action: g.action || null,
      deadline: g.deadline || null,
      manually_added: g.manuallyAdded || false,
    }));

    const { error: gapErr } = await supabase.from('gap_closures').insert(gapRows);
    if (gapErr) return Response.json({ error: `GapClosures: ${gapErr.message}` }, { status: 500 });
  }

  // 5. Upsert підсумки періоду
  if (summary) {
    const { error: sumErr } = await supabase
      .from('period_summaries')
      .upsert({
        period_id: pid,
        user_id: uid,
        segment_code: segmentCode,
        month_forecast_pct: summary.monthForecastPct || null,
        month_forecast_usd: summary.monthForecastUsd || null,
        gap_action_1: summary.gapAction1 || null,
        gap_action_2: summary.gapAction2 || null,
        gap_action_3: summary.gapAction3 || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'period_id,user_id,segment_code',
      });

    if (sumErr) return Response.json({ error: `Summary: ${sumErr.message}` }, { status: 500 });
  }

  return Response.json({ success: true });
}
