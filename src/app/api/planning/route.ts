import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid, monthlyPeriodMeta } from '@/lib/periods';
import { safeRole } from '@/lib/types';
import { isPlanningWritesAllowed } from '@/lib/feature-flags';
import { assertWindowAllowed } from '@/lib/window-guard';
import { NextRequest } from 'next/server';

/**
 * ⚠️ ARCH (2026-05-12): planning-дані зберігаються у monthly period_id (не тижневому).
 * Менеджер планує раз на місяць, тижневий фільтр — лише для expected % розрахунку.
 * Якщо клієнт прислав тижневий pid — сервер ремаппить у monthly через period.month
 * або, якщо month не передано, через SELECT periods.month WHERE id=pid.
 */
async function resolveMonthlyPid(
  rawPid: number,
  knownMonth?: string,
): Promise<{ pid: number; month: string | null; error?: string }> {
  // Швидкий шлях — клієнт передав period.month.
  if (knownMonth && /^\d{4}-\d{2}/.test(knownMonth)) {
    return { pid: monthlyPidFromMonth(knownMonth), month: knownMonth };
  }
  // Pure-фолбек: weekly pid 20260510 → '2026-05' → 20260531 (без DB hop).
  // Після міграції M7 у periods table нема weekly-рядків — SELECT повертає
  // null і ми ламали запити. Тепер компʼют чистий, БД не потрібна.
  const purePid = monthlyPidFromAnyPid(rawPid);
  if (purePid !== rawPid) {
    const year = Math.floor(rawPid / 10000);
    const monthIdx = Math.floor((rawPid % 10000) / 100);
    return { pid: purePid, month: `${year}-${String(monthIdx).padStart(2, '0')}-01` };
  }
  // Якщо purePid===rawPid — або вже monthly, або не-YYYYMMDD legacy id.
  // Для legacy лук-апимо month з periods table за rawPid (старі sequential id).
  const { data, error } = await supabase.from('periods').select('month').eq('id', rawPid).single();
  if (error || !data?.month) {
    return { pid: rawPid, month: null, error: error?.message };
  }
  const month = String(data.month);
  return { pid: monthlyPidFromMonth(month), month };
}

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
      && session.role !== 'admin'
      && !session.managedUsers.includes(requestedLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  const segmentCode = searchParams.get('segmentCode');
  const periodIdStr = searchParams.get('periodId');

  if (!segmentCode || !periodIdStr) {
    return Response.json({ error: 'Missing: segmentCode, periodId' }, { status: 400 });
  }
  const rawPid = parseInt(periodIdStr, 10);
  if (isNaN(rawPid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }
  // SECURITY: user_id це сам login (M5) — клієнт не може запросити чужі дані
  // бо login приходить ТІЛЬКИ з підписаної cookie.
  const uid = requestedLogin;

  // Ремап на канонічний monthly pid. Клієнт може передати тижневий pid у
  // ?periodId=...&month=YYYY-MM-DD — швидкий шлях; інакше SELECT periods.
  const monthQuery = searchParams.get('month') ?? undefined;
  const resolved = await resolveMonthlyPid(rawPid, monthQuery);
  const pid = resolved.pid;

  // ⚠️ M8 (2026-05-12): фільтр `archived_at IS NULL` — приховує soft-deleted
  // рядки baгaжу від M7 union'у weekly-pid саwes. Hard-DELETE через форму
  // (POST з clearAll=true) і далі видаляє з БД повністю.
  const [forecasts, gapClosures, summary] = await Promise.all([
    supabase.from('forecasts').select('*')
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .is('archived_at', null)
      .order('completed', { ascending: true }).order('client_name', { ascending: true }),
    supabase.from('gap_closures').select('*')
      .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
      .is('archived_at', null)
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

  // ⚠️ ТИМЧАСОВИЙ kill-switch (Пакет А Етап 0, 2026-05-13). Адмін (itd@emet.in.ua)
  // обходить. Видаляється після Етапу 3 коли window-lock перебере контроль.
  if (!isPlanningWritesAllowed(session.login)) {
    return Response.json({
      error: 'Триває оновлення системи. Планування тимчасово недоступне. Спробуйте пізніше.',
      code: 'PLANNING_DISABLED',
    }, { status: 503 });
  }

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

  const rawPid = parseInt(String(periodId), 10);
  if (isNaN(rawPid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }
  // ⚠️ ARCH: завжди пишемо у monthly pid (period.month → last day of month → id).
  // Якщо клієнт прислав тижневий pid 20260510 + period.month=2026-05-01 → pid=20260531.
  const resolved = await resolveMonthlyPid(rawPid, period?.month);
  const pid = resolved.pid;

  // SECURITY: login беремо ТІЛЬКИ з підписаної сесії (cookie). body.userMeta
  // використовуємо лише для метаданих профілю (fullName/region) при upsert у users.
  // Drill-down scope для WRITE:
  //   - admin: будь-хто
  //   - rm/manager: тільки свої managedUsers
  //   - director: ТІЛЬКИ власний логін (read-only роль; чужі плани не пише)
  const effectiveLogin = targetLogin && targetLogin !== session.login
    ? targetLogin
    : session.login;
  if (effectiveLogin !== session.login
      && session.role !== 'admin'
      && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  // M5: user_id = login (раніше було hash через loginToUserId)
  const uid = effectiveLogin;

  // ---- WINDOW-LOCK GUARD (Етап 3, 2026-05-13) ----
  // Admin обходить, інші проходять перевірку window_days + per-user locks.
  const winCheck = await assertWindowAllowed(session, uid, period?.month);
  if (winCheck.blocked) return winCheck.response;

  const errors: string[] = [];
  const ctx = { uid, pid, segmentCode };

  // ---- FINALIZATION GUARD (Етап 2, 2026-05-13) ----
  // Якщо план уже фіналізований і це не admin — переходимо у filtered mode:
  // дозволяємо тільки stage_comment + stage_done. Решта payload ігнорується.
  // Список клієнтів, суми, етап, тренінг — заморожено.
  const { data: finalRows } = await supabase
    .from('period_summaries')
    .select('finalized_at')
    .eq('period_id', pid)
    .eq('user_id', uid)
    .eq('segment_code', segmentCode);
  const finalRow = Array.isArray(finalRows) && finalRows.length > 0 ? finalRows[0] : null;
  const isFinalized = !!finalRow?.finalized_at;
  if (isFinalized && session.role !== 'admin') {
    // Filtered mode: тільки stage_comment + stage_done per existing row.
    // PATCH через direct REST (custom wrapper не має .update()).
    type IncomingStage = { clientId1c?: string; stageComment?: string; stageDone?: boolean };
    const fIncoming = (forecasts as IncomingStage[] | undefined ?? []);
    const gIncoming = (gapClosures as IncomingStage[] | undefined ?? []);

    const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!URL_BASE || !KEY) {
      return Response.json({ error: 'Supabase env missing' }, { status: 500 });
    }
    const patchRow = async (table: string, clientId: string, stageComment: string | null, stageDone: boolean) => {
      // ⚠️ НЕ використовуємо URLSearchParams — він double-encode email %40 → %2540.
      const qs = [
        `period_id=eq.${pid}`,
        `user_id=eq.${encodeURIComponent(uid)}`,
        `segment_code=eq.${encodeURIComponent(segmentCode)}`,
        `client_id_1c=eq.${encodeURIComponent(clientId)}`,
      ].join('&');
      const u = `${URL_BASE}/rest/v1/${table}?${qs}`;
      const r = await fetch(u, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ stage_comment: stageComment, stage_done: stageDone }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return `HTTP ${r.status}: ${text.slice(0, 100)}`;
      }
      return null;
    };

    let updated = 0;
    const updErrors: string[] = [];
    for (const row of fIncoming) {
      if (!row.clientId1c) continue;
      const e = await patchRow('forecasts', row.clientId1c, row.stageComment ?? null, row.stageDone ?? false);
      if (e) updErrors.push(`forecasts ${row.clientId1c}: ${e}`);
      else updated++;
    }
    for (const row of gIncoming) {
      if (!row.clientId1c) continue;
      const e = await patchRow('gap_closures', row.clientId1c, row.stageComment ?? null, row.stageDone ?? false);
      if (e) updErrors.push(`gap_closures ${row.clientId1c}: ${e}`);
      else updated++;
    }

    if (updErrors.length > 0) {
      console.error('[planning.POST finalized-filtered] errors:', { ...ctx, updErrors });
      return Response.json({ error: updErrors.join('; ') }, { status: 500 });
    }
    return Response.json({ success: true, filteredFinalized: true, updated });
  }

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
      // M8: явно скидаємо archived_at при ре-save — якщо менеджер заново
      // додає колись archived клієнта через форму, він стає активним.
      archived_at: null,
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
      // M8: revive on re-save (див. forecastRows вище)
      archived_at: null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Якщо валідатор знайшов проблеми — повертаємо 400, не пишемо нічого.
  if (errors.length > 0) {
    console.warn('[planning.POST] validation failed:', { ...ctx, errors });
    return Response.json({ error: errors.join('; ') }, { status: 400 });
  }

  // ---- 1. Upsert period (FK для forecasts/gap_closures) ----
  // Записуємо MONTHLY metadata (week_start='YYYY-MM-01', week_end=last_day),
  // не той тижневий який міг прийти від клієнта. Тоді фільтри тиждень↔місяць
  // у дашборді показують ОДИН той самий план.
  if (period?.month) {
    const meta = monthlyPeriodMeta(period.month);
    const { error: e } = await supabase.from('periods').upsert({
      id: meta.id, week_start: meta.weekStart, week_end: meta.weekEnd, month: meta.month,
    }, { onConflict: 'id' });
    if (e) { errors.push(`Upsert period: ${e.message}`); console.error('[planning.POST] period error:', { ...ctx, error: e.message }); }
  } else {
    errors.push('Missing period metadata (month)');
  }

  // ---- 2. Upsert user (FK) ----
  // Профіль беремо з session (якщо це сам менеджер зберігає) або з body.userMeta
  // (якщо РМ зберігає за свого менеджера — тоді у session дані РМ, не цільового).
  if (!errors.length) {
    const profile = effectiveLogin === session.login
      ? { full_name: session.fullName, role: session.role, region: session.region, region_code: session.regionCode }
      : {
          full_name: userMeta?.fullName || effectiveLogin,
          // ⚠️ safeRole — ENUM validation. Без цього Director міг через
          // userMeta.role='superadmin' записати чужому менеджеру довільну роль.
          role: safeRole(userMeta?.role, 'manager'),
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
  // ⚠️ M8: DELETE тільки АКТИВНІ рядки (`archived_at IS NULL`). Архівні
  // (soft-deleted) лишаються у БД для audit. Без цього фільтра наступний
  // save менеджера hard-видалив би усі archived рядки M8, втрачаючи
  // можливість відкату.
  if (!errors.length) {
    const keepClientIds = forecastRows.map(r => r.client_id_1c);
    if (keepClientIds.length === 0 && !clearAll) {
      console.warn('[planning.POST] skip DELETE forecasts: empty list without clearAll=true', ctx);
    } else {
      const { error: e } = await supabase.from('forecasts').delete()
        .eq('period_id', pid).eq('user_id', uid).eq('segment_code', segmentCode)
        .is('archived_at', null)
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
        .is('archived_at', null)
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
  return Response.json({
    success: true,
    counts: {
      forecasts: forecastRows.length,
      gaps: gapRows.length,
    },
    savedAt: new Date().toISOString(),
  });
}
