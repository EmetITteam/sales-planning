import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

// GET — завантажити дані планування
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  // login query-параметр приймаємо для drill-down (РМ → менеджер; Director → будь-кого).
  // Director може бачити план будь-якого менеджера компанії (через CompanyDashboard
  // drill-down). RM/Manager — тільки свій + managedUsers.
  const requestedLogin = searchParams.get('login') || session.login;
  if (requestedLogin !== session.login
      && session.role !== 'director'
      && !session.managedUsers.includes(requestedLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  const segmentCode = searchParams.get('segmentCode');
  const periodIdStr = searchParams.get('periodId');

  if (!segmentCode || !periodIdStr) {
    return Response.json({ error: 'Missing: segmentCode, periodId' }, { status: 400 });
  }
  const pid = parseInt(periodIdStr, 10);
  if (isNaN(pid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }
  // SECURITY: user_id це сам login (M5) — клієнт не може запросити чужі дані
  // бо login приходить ТІЛЬКИ з підписаної cookie.
  const uid = requestedLogin;

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

  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { segmentCode, periodId, period, userMeta, forecasts, gapClosures, summary, clearAll, targetLogin } = body;

  if (!segmentCode || !periodId) {
    return Response.json({ error: 'Missing: segmentCode, periodId' }, { status: 400 });
  }

  const pid = parseInt(String(periodId), 10);
  if (isNaN(pid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }

  // SECURITY: login беремо ТІЛЬКИ з підписаної сесії (cookie). body.userMeta
  // використовуємо лише для метаданих профілю (fullName/region) при upsert у users.
  // Drill-down: targetLogin → перевіряємо scope (Director: будь-хто; RM/Manager: managedUsers).
  const effectiveLogin = targetLogin && targetLogin !== session.login
    ? targetLogin
    : session.login;
  if (effectiveLogin !== session.login
      && session.role !== 'director'
      && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  // M5: user_id = login (раніше було hash через loginToUserId)
  const uid = effectiveLogin;

  const errors: string[] = [];
  const ctx = { uid, pid, segmentCode };

  // ---- 0. Pre-validate (підготувати рядки до інсерту) ----
  // Робимо це ДО будь-яких записів, щоб 400 не залишав сміття у БД.
  // Після migration M3 (2026-05-08) пишемо у нові колонки замість JSON-pack.
  type FRow = {
    clientId1c: string; clientName: string; forecastAmount: number | string;
    stage: string; stageComment: string; completed: boolean; manuallyAdded?: boolean;
    trainingId?: string; trainingName?: string; trainingDate?: string;
    stageDone?: boolean;
  };
  type GRow = {
    clientId1c: string; clientName: string; category: string;
    potentialAmount: number | string; deadline: string; manuallyAdded?: boolean;
    stage?: string; stageComment?: string; stageDone?: boolean;
    closureCompleted?: boolean;
    trainingId?: string; trainingName?: string; trainingDate?: string;
  };
  // Number coerce. Reject non-finite (NaN/Infinity) — це справжній invalid input.
  // Negative значення допускаємо: 1С іноді віддає від'ємний lastPurchaseAmount
  // (повернення/refund), і коли auto-populate підставляє його у forecast —
  // блокувати save через це не варто.
  const toFiniteAmount = (v: unknown, label: string): number | null => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    if (!Number.isFinite(n)) {
      errors.push(`Invalid ${label}: ${JSON.stringify(v)}`);
      return null;
    }
    return n;
  };
  const forecastRows = (forecasts as FRow[] | undefined ?? []).map(f => {
    if (!f.clientId1c) { errors.push('Forecast row missing clientId1c'); return null; }
    const amount = toFiniteAmount(f.forecastAmount, `forecast_amount for ${f.clientId1c}`);
    if (amount === null) return null;
    return {
      period_id: pid, user_id: uid, segment_code: segmentCode,
      client_id_1c: f.clientId1c, client_name: f.clientName,
      forecast_amount: amount, stage: f.stage || null,
      stage_comment: f.stageComment || null, completed: f.completed || false,
      manually_added: f.manuallyAdded || false,
      training_id: f.trainingId || null,
      training_name: f.trainingName || null,
      training_date: f.trainingDate || null,
      stage_done: f.stageDone || false,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  const gapRows = (gapClosures as GRow[] | undefined ?? []).map(g => {
    const amount = toFiniteAmount(g.potentialAmount, `potential_amount for ${g.clientId1c || g.clientName}`);
    if (amount === null) return null;
    return {
      period_id: pid, user_id: uid, segment_code: segmentCode,
      client_id_1c: g.clientId1c || `manual_${uid}_${Date.now()}`,
      client_name: g.clientName, category: g.category || null,
      potential_amount: amount,
      deadline: g.deadline || null, manually_added: g.manuallyAdded || false,
      stage: g.stage || null,
      stage_comment: g.stageComment || null,
      stage_done: g.stageDone || false,
      closure_completed: g.closureCompleted || false,
      training_id: g.trainingId || null,
      training_name: g.trainingName || null,
      training_date: g.trainingDate || null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Якщо валідатор знайшов проблеми — повертаємо 400, не пишемо нічого.
  if (errors.length > 0) {
    console.warn('[planning.POST] validation failed:', { ...ctx, errors });
    return Response.json({ error: errors.join('; ') }, { status: 400 });
  }

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
  // Профіль беремо з session (якщо це сам менеджер зберігає) або з body.userMeta
  // (якщо РМ зберігає за свого менеджера — тоді у session дані РМ, не цільового).
  if (!errors.length) {
    const profile = effectiveLogin === session.login
      ? { full_name: session.fullName, role: session.role, region: session.region, region_code: session.regionCode }
      : {
          full_name: userMeta?.fullName || effectiveLogin,
          role: userMeta?.role || null,
          region: userMeta?.region || null,
          region_code: userMeta?.regionCode || null,
        };
    const { error: e } = await supabase.from('users').upsert({
      id: uid, login: effectiveLogin, ...profile,
    }, { onConflict: 'id' });
    if (e) { errors.push(`Upsert user: ${e.message}`); console.error('[planning.POST] user error:', { ...ctx, error: e.message }); }
  }

  // ---- 3. BATCH UPSERT — один POST на таблицю замість N послідовних ----
  // У forecasts/gap_closures є unique constraint
  // (period_id, user_id, segment_code, client_id_1c) — використовуємо як onConflict.
  // PostgREST приймає масив у тілі і атомарно мерджить (resolution=merge-duplicates).
  const upsertConflict = { onConflict: 'period_id,user_id,segment_code,client_id_1c' };
  if (!errors.length && forecastRows.length > 0) {
    const { error: e } = await supabase.from('forecasts').upsert(forecastRows, upsertConflict);
    if (e) { errors.push(`Upsert forecasts (batch ${forecastRows.length}): ${e.message}`); console.error('[planning.POST] upsert forecasts batch error:', { ...ctx, count: forecastRows.length, error: e.message }); }
  }
  if (!errors.length && gapRows.length > 0) {
    const { error: e } = await supabase.from('gap_closures').upsert(gapRows, upsertConflict);
    if (e) { errors.push(`Upsert gap_closures (batch ${gapRows.length}): ${e.message}`); console.error('[planning.POST] upsert gap batch error:', { ...ctx, count: gapRows.length, error: e.message }); }
  }

  // ---- 4. DELETE рядків яких більше нема в новому списку ----
  // ⚠️ SAFETY: якщо клієнт прислав ПОРОЖНІЙ масив без явного `clearAll: true` —
  // НЕ виконуємо DELETE. Це захист від race / state-bug, де клієнт міг
  // post-нути порожньо до того як завантажились дані з Supabase. Повний wipe
  // має бути свідомим (UI клавіша «Очистити весь сегмент» → clearAll=true).
  // notIn з пустим списком + clearAll=true = no filter → DELETE усіх (запланована поведінка).
  if (!errors.length) {
    const keepClientIds = forecastRows.map(r => r.client_id_1c);
    if (keepClientIds.length === 0 && !clearAll) {
      console.warn('[planning.POST] skip DELETE forecasts: empty list without clearAll=true', ctx);
    } else {
      const { error: e } = await supabase.from('forecasts').delete()
        .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
        .notIn('client_id_1c', keepClientIds);
      if (e) { errors.push(`Delete stale forecasts: ${e.message}`); console.error('[planning.POST] delete forecasts error:', { ...ctx, error: e.message }); }
    }
  }
  if (!errors.length) {
    const keepClientIds = gapRows.map(r => r.client_id_1c);
    if (keepClientIds.length === 0 && !clearAll) {
      console.warn('[planning.POST] skip DELETE gap_closures: empty list without clearAll=true', ctx);
    } else {
      const { error: e } = await supabase.from('gap_closures').delete()
        .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
        .notIn('client_id_1c', keepClientIds);
      if (e) { errors.push(`Delete stale gap_closures: ${e.message}`); console.error('[planning.POST] delete gaps error:', { ...ctx, error: e.message }); }
    }
  }

  // ---- 5. Upsert / Delete підсумки ----
  // Якщо summary прийшов — upsert. Якщо `clearAll=true` ТА summary немає —
  // видаляємо «осиротілий» рядок period_summaries (інакше залишається назавжди).
  if (!errors.length && summary) {
    const { error: e } = await supabase.from('period_summaries').upsert({
      period_id: pid, user_id: uid, segment_code: segmentCode,
      gap_action_1: summary.gapAction1 || null,
      gap_action_2: summary.gapAction2 || null,
      gap_action_3: summary.gapAction3 || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'period_id,user_id,segment_code' });
    if (e) { errors.push(`Upsert summary: ${e.message}`); console.error('[planning.POST] upsert summary error:', { ...ctx, error: e.message }); }
  } else if (!errors.length && clearAll) {
    const { error: e } = await supabase.from('period_summaries').delete()
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode);
    if (e) { errors.push(`Delete summary: ${e.message}`); console.error('[planning.POST] delete summary error:', { ...ctx, error: e.message }); }
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }
  return Response.json({ success: true });
}
