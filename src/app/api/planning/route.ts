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

  if (forecasts.error) {
    console.error('[planning.GET] forecasts error:', { uid, pid, segmentCode, error: forecasts.error.message });
    return Response.json({ error: forecasts.error.message }, { status: 500 });
  }
  if (gapClosures.error) {
    console.error('[planning.GET] gap_closures error:', { uid, pid, segmentCode, error: gapClosures.error.message });
    return Response.json({ error: gapClosures.error.message }, { status: 500 });
  }

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

  const { userId, segmentCode, periodId, period, userMeta, forecasts, gapClosures, summary } = body;

  if (!userId || !segmentCode || !periodId) {
    return Response.json({ error: 'Missing: userId, segmentCode, periodId' }, { status: 400 });
  }

  const pid = parseInt(String(periodId), 10);
  const uid = parseInt(String(userId), 10);
  if (isNaN(pid) || isNaN(uid)) {
    return Response.json({ error: 'userId and periodId must be numbers' }, { status: 400 });
  }

  const errors: string[] = [];
  const ctx = { uid, pid, segmentCode };

  // ---- 0. Pre-validate (підготувати рядки до інсерту) ----
  // Робимо це ДО будь-яких записів, щоб 400 не залишав сміття у БД.
  type FRow = {
    clientId1c: string; clientName: string; forecastAmount: number;
    stage: string; stageComment: string; completed: boolean; manuallyAdded?: boolean;
  };
  type GRow = {
    clientId1c: string; clientName: string; category: string;
    potentialAmount: number; action: string; deadline: string; manuallyAdded?: boolean;
  };
  const forecastRows = (forecasts as FRow[] | undefined ?? []).map(f => ({
    period_id: pid, user_id: uid, segment_code: segmentCode,
    client_id_1c: f.clientId1c, client_name: f.clientName,
    forecast_amount: f.forecastAmount, stage: f.stage || null,
    stage_comment: f.stageComment || null, completed: f.completed || false,
    manually_added: f.manuallyAdded || false,
  }));
  const gapRows = (gapClosures as GRow[] | undefined ?? []).map(g => ({
    period_id: pid, user_id: uid, segment_code: segmentCode,
    client_id_1c: g.clientId1c || `manual_${uid}_${Date.now()}`,
    client_name: g.clientName, category: g.category || null,
    potential_amount: g.potentialAmount, action: g.action || null,
    deadline: g.deadline || null, manually_added: g.manuallyAdded || false,
  }));

  // ---- 1. Upsert period (FK для forecasts/gap_closures) ----
  if (period?.weekStart && period?.weekEnd && period?.month) {
    const { error: e } = await supabase.from('periods').upsert({
      id: pid, week_start: period.weekStart, week_end: period.weekEnd, month: period.month,
    }, { onConflict: 'id' });
    if (e) { errors.push(`Upsert period: ${e.message}`); console.error('[planning.POST] period error:', { ...ctx, error: e.message }); }
  } else {
    errors.push('Missing period metadata (weekStart/weekEnd/month)');
  }

  // ---- 2. Upsert user (FK) ----
  if (!errors.length && userMeta?.login) {
    const { error: e } = await supabase.from('users').upsert({
      id: uid, login: userMeta.login, full_name: userMeta.fullName || userMeta.login,
      role: userMeta.role || null, region: userMeta.region || null, region_code: userMeta.regionCode || null,
    }, { onConflict: 'id' });
    if (e) { errors.push(`Upsert user: ${e.message}`); console.error('[planning.POST] user error:', { ...ctx, error: e.message }); }
  }

  // ---- 3. INSERT-FIRST стратегія: спочатку записуємо НОВІ рядки ----
  // Якщо INSERT падає — нічого не видаляємо, старі дані лишаються неушкодженими.
  // (До моменту наступного успішного save можуть співіснувати старі+нові.
  //  GET-handler вирішує це обираючи останній рядок per (segment, client).)
  // Запам'ятовуємо межу часу через client-side now() — потім видаляємо
  // тільки рядки старіші за цю межу.
  const cutoffMs = Date.now() - 1000; // -1с буфер на clock skew
  const cutoffIso = new Date(cutoffMs).toISOString();

  if (!errors.length && forecastRows.length > 0) {
    const { error: e } = await supabase.from('forecasts').insert(forecastRows);
    if (e) { errors.push(`Insert forecasts: ${e.message}`); console.error('[planning.POST] insert forecasts error:', { ...ctx, count: forecastRows.length, error: e.message }); }
  }
  if (!errors.length && gapRows.length > 0) {
    const { error: e } = await supabase.from('gap_closures').insert(gapRows);
    if (e) { errors.push(`Insert gap_closures: ${e.message}`); console.error('[planning.POST] insert gap_closures error:', { ...ctx, count: gapRows.length, error: e.message }); }
  }

  // ---- 4. DELETE старі тільки після успішного INSERT ----
  // Якщо INSERT впав вище — errors уже непорожній і ми сюди не потрапимо,
  // старі дані лишаються (краще «дубль» чи «застаріле» ніж «втрачено»).
  if (!errors.length) {
    const { error: e } = await supabase.from('forecasts').delete()
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .lt('created_at', cutoffIso);
    if (e) { errors.push(`Delete old forecasts: ${e.message}`); console.error('[planning.POST] delete forecasts error:', { ...ctx, error: e.message }); }
  }
  if (!errors.length) {
    const { error: e } = await supabase.from('gap_closures').delete()
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .lt('created_at', cutoffIso);
    if (e) { errors.push(`Delete old gap_closures: ${e.message}`); console.error('[planning.POST] delete gap_closures error:', { ...ctx, error: e.message }); }
  }

  // ---- 5. Upsert підсумки ----
  if (!errors.length && summary) {
    const { error: e } = await supabase.from('period_summaries').upsert({
      period_id: pid, user_id: uid, segment_code: segmentCode,
      gap_action_1: summary.gapAction1 || null,
      gap_action_2: summary.gapAction2 || null,
      gap_action_3: summary.gapAction3 || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'period_id,user_id,segment_code' });
    if (e) { errors.push(`Upsert summary: ${e.message}`); console.error('[planning.POST] upsert summary error:', { ...ctx, error: e.message }); }
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }
  return Response.json({ success: true });
}
