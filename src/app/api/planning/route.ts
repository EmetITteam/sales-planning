import { supabase } from '@/lib/supabase';
import { validateApiRequest, validateRequiredParams } from '@/lib/api-auth';
import { NextRequest } from 'next/server';

// GET — завантажити дані планування
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const validation = validateRequiredParams(
    { userId: searchParams.get('userId'), segmentCode: searchParams.get('segmentCode'), periodId: searchParams.get('periodId') },
    ['userId', 'periodId']
  );
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

  const pid = validation.parsed.periodId;
  const uid = validation.parsed.userId;
  const segmentCode = searchParams.get('segmentCode')!;

  const [forecasts, gapClosures, summary] = await Promise.all([
    supabase.from('forecasts').select('*')
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .order('completed', { ascending: true }).order('client_name', { ascending: true }),
    supabase.from('gap_closures').select('*')
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .order('client_name', { ascending: true }),
    supabase.from('period_summaries').select('*')
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .single(),
  ]);

  if (forecasts.error) return Response.json({ error: forecasts.error.message }, { status: 500 });
  if (gapClosures.error) return Response.json({ error: gapClosures.error.message }, { status: 500 });

  return Response.json({
    forecasts: forecasts.data ?? [],
    gapClosures: gapClosures.data ?? [],
    summary: summary.error ? null : summary.data,
  });
}

// POST — зберегти все планування
export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, segmentCode, periodId, forecasts, gapClosures, summary } = body;

  if (!userId || !segmentCode || !periodId) {
    return Response.json({ error: 'Missing: userId, segmentCode, periodId' }, { status: 400 });
  }

  const pid = parseInt(String(periodId), 10);
  const uid = parseInt(String(userId), 10);
  if (isNaN(pid) || isNaN(uid)) {
    return Response.json({ error: 'userId and periodId must be numbers' }, { status: 400 });
  }

  const errors: string[] = [];

  // 1. Видалити старі прогнози
  const { error: delForecasts } = await supabase
    .from('forecasts').delete()
    .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode);
  if (delForecasts) errors.push(`Delete forecasts: ${delForecasts.message}`);

  // 2. Вставити нові прогнози
  if (!errors.length && forecasts?.length > 0) {
    const forecastRows = forecasts.map((f: {
      clientId1c: string; clientName: string; forecastAmount: number;
      stage: string; stageComment: string; completed: boolean; manuallyAdded?: boolean;
    }) => ({
      period_id: pid, user_id: uid, segment_code: segmentCode,
      client_id_1c: f.clientId1c, client_name: f.clientName,
      forecast_amount: f.forecastAmount, stage: f.stage || null,
      stage_comment: f.stageComment || null, completed: f.completed || false,
      manually_added: f.manuallyAdded || false,
    }));

    const { error } = await supabase.from('forecasts').insert(forecastRows);
    if (error) errors.push(`Insert forecasts: ${error.message}`);
  }

  // 3. Видалити старі gap closures
  const { error: delGaps } = await supabase
    .from('gap_closures').delete()
    .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode);
  if (delGaps) errors.push(`Delete gap_closures: ${delGaps.message}`);

  // 4. Вставити нові gap closures
  if (!errors.length && gapClosures?.length > 0) {
    const gapRows = gapClosures.map((g: {
      clientId1c: string; clientName: string; category: string;
      potentialAmount: number; action: string; deadline: string; manuallyAdded?: boolean;
    }) => ({
      period_id: pid, user_id: uid, segment_code: segmentCode,
      client_id_1c: g.clientId1c || `manual_${uid}_${Date.now()}`,
      client_name: g.clientName, category: g.category || null,
      potential_amount: g.potentialAmount, action: g.action || null,
      deadline: g.deadline || null, manually_added: g.manuallyAdded || false,
    }));

    const { error } = await supabase.from('gap_closures').insert(gapRows);
    if (error) errors.push(`Insert gap_closures: ${error.message}`);
  }

  // 5. Upsert підсумки (тільки текстові дії; ручні monthForecastPct/Usd прибрані)
  if (!errors.length && summary) {
    const { error } = await supabase.from('period_summaries').upsert({
      period_id: pid, user_id: uid, segment_code: segmentCode,
      gap_action_1: summary.gapAction1 || null,
      gap_action_2: summary.gapAction2 || null,
      gap_action_3: summary.gapAction3 || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'period_id,user_id,segment_code' });

    if (error) errors.push(`Upsert summary: ${error.message}`);
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }

  return Response.json({ success: true });
}
