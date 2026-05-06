import { supabase } from '@/lib/supabase';
import { validateApiRequest, validateRequiredParams } from '@/lib/api-auth';
import { loginToUserId } from '@/lib/login-to-user-id';
import { NextRequest } from 'next/server';

// GET — завантажити дані планування
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const login = searchParams.get('login');
  const segmentCode = searchParams.get('segmentCode');
  const periodIdStr = searchParams.get('periodId');

  if (!login || !segmentCode || !periodIdStr) {
    return Response.json({ error: 'Missing: login, segmentCode, periodId' }, { status: 400 });
  }
  const pid = parseInt(periodIdStr, 10);
  if (isNaN(pid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }
  // SECURITY: userId обчислюємо з login на сервері — клієнт не може запросити чужі дані.
  const uid = loginToUserId(login);

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

  const { userId: bodyUserId, segmentCode, periodId, period, userMeta, forecasts, gapClosures, summary } = body;

  if (!segmentCode || !periodId || !userMeta?.login) {
    return Response.json({ error: 'Missing: segmentCode, periodId, userMeta.login' }, { status: 400 });
  }

  const pid = parseInt(String(periodId), 10);
  if (isNaN(pid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }

  // SECURITY: userId завжди обчислюємо з userMeta.login на сервері.
  // Якщо клієнт прислав свій (з "user_id":42) — ігноруємо. Це гарантує що
  // зловмисник не може записати дані під чужим userId підмінивши body.
  const uid = loginToUserId(String(userMeta.login));
  if (bodyUserId !== undefined && parseInt(String(bodyUserId), 10) !== uid) {
    console.warn('[planning.POST] userId mismatch — using server-computed:', {
      bodyUserId, login: userMeta.login, computedUid: uid,
    });
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

  // ---- 3. UPSERT нових рядків ----
  // У forecasts/gap_closures є unique constraint
  // (period_id, user_id, segment_code, client_id_1c) — використовуємо як onConflict.
  // Це: якщо запис є — оновлюємо, якщо нема — вставляємо. Атомарно в межах батчу.
  // Наш кастомний supabase.upsert приймає 1 рядок за раз — циклимо.
  // (PostgREST взагалі-то підтримує батч upsert у POST; майбутньо можна
  // розширити src/lib/supabase.ts).
  const upsertConflict = { onConflict: 'period_id,user_id,segment_code,client_id_1c' };
  if (!errors.length) {
    for (let i = 0; i < forecastRows.length; i++) {
      const { error: ei } = await supabase.from('forecasts').upsert(forecastRows[i], upsertConflict);
      if (ei) { errors.push(`Upsert forecast row ${i}: ${ei.message}`); console.error('[planning.POST] upsert forecast row error:', { ...ctx, i, error: ei.message }); break; }
    }
  }
  if (!errors.length) {
    for (let i = 0; i < gapRows.length; i++) {
      const { error: ei } = await supabase.from('gap_closures').upsert(gapRows[i], upsertConflict);
      if (ei) { errors.push(`Upsert gap row ${i}: ${ei.message}`); console.error('[planning.POST] upsert gap error:', { ...ctx, i, error: ei.message }); break; }
    }
  }

  // ---- 4. DELETE рядків яких більше нема в новому списку ----
  // Тільки після успішного UPSERT (errors порожні) — інакше пропускаємо.
  // notIn з пустим списком = no filter → DELETE усіх (саме те потрібно
  // коли користувач очистив весь розділ).
  if (!errors.length) {
    const keepClientIds = forecastRows.map(r => r.client_id_1c);
    const { error: e } = await supabase.from('forecasts').delete()
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .notIn('client_id_1c', keepClientIds);
    if (e) { errors.push(`Delete stale forecasts: ${e.message}`); console.error('[planning.POST] delete forecasts error:', { ...ctx, error: e.message }); }
  }
  if (!errors.length) {
    const keepClientIds = gapRows.map(r => r.client_id_1c);
    const { error: e } = await supabase.from('gap_closures').delete()
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .notIn('client_id_1c', keepClientIds);
    if (e) { errors.push(`Delete stale gap_closures: ${e.message}`); console.error('[planning.POST] delete gaps error:', { ...ctx, error: e.message }); }
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
