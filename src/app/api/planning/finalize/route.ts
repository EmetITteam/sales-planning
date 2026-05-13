/**
 * POST   /api/planning/finalize    — фіналізувати план (manager × segment × month).
 * DELETE /api/planning/finalize    — розфіналізувати (тільки admin).
 *
 * POST body:
 *   {
 *     periodId: number,                     // monthly canonical (ремапиться)
 *     period?: { month: 'YYYY-MM-DD' },     // підказка для resolveMonthlyPid
 *     segmentCode: string,
 *     targetLogin?: string,                 // admin/rm — для чужого
 *   }
 *
 * Поведінка:
 *   - INSERT/UPSERT у period_summaries: finalized_at=NOW(), finalized_by=session.login
 *   - Якщо рядок period_summaries ще не існує — створює його
 *   - Якщо уже фіналізований — no-op (повертає поточний finalized_at)
 *
 * SECURITY:
 *   - Manager / RM: тільки свій логін + managedUsers
 *   - Admin: будь-хто
 *   - Director: ТІЛЬКИ свій (read-only роль; чужих не фіналізує)
 *   - Maintenance kill-switch (PLANNING_DISABLED) — admin обходить, інші 503
 *
 * DELETE body — те саме що POST. Дозволено ТІЛЬКИ session.role='admin'.
 * Скидає finalized_at=NULL, finalized_by=NULL.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';
import { isPlanningWritesAllowed } from '@/lib/feature-flags';
import { assertWindowAllowed } from '@/lib/window-guard';

interface FinalizeBody {
  periodId?: number;
  period?: { month?: string };
  segmentCode?: string;
  targetLogin?: string;
}

async function parseAndAuthorize(request: NextRequest, requireAdmin: boolean) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return { error: Response.json({ error: auth.error }, { status: 401 }) };
  const session = await getSession();
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  if (!isPlanningWritesAllowed(session.login)) {
    return {
      error: Response.json({
        error: 'Триває оновлення системи. Фіналізація тимчасово недоступна.',
        code: 'PLANNING_DISABLED',
      }, { status: 503 }),
    };
  }

  if (requireAdmin && session.role !== 'admin') {
    return { error: Response.json({ error: 'Розфіналізація доступна лише адміну' }, { status: 403 }) };
  }

  let body: FinalizeBody;
  try { body = await request.json(); }
  catch { return { error: Response.json({ error: 'Invalid JSON' }, { status: 400 }) }; }

  const { periodId, period, segmentCode, targetLogin } = body;
  if (!segmentCode || typeof periodId !== 'number') {
    return { error: Response.json({ error: 'segmentCode + periodId required' }, { status: 400 }) };
  }

  // Resolve monthly pid (паритет з /api/planning).
  let monthlyPid = periodId;
  if (period?.month && /^\d{4}-\d{2}/.test(String(period.month))) {
    monthlyPid = monthlyPidFromMonth(String(period.month));
  } else {
    const purePid = monthlyPidFromAnyPid(periodId);
    if (purePid !== periodId) monthlyPid = purePid;
  }

  // Scope: admin → будь-хто, RM/Manager → managedUsers, Director → тільки свій.
  const effectiveLogin = targetLogin && targetLogin !== session.login ? targetLogin : session.login;
  if (effectiveLogin !== session.login
      && session.role !== 'admin'
      && !session.managedUsers.includes(effectiveLogin)) {
    return { error: Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 }) };
  }

  // Window-lock guard (Етап 3): admin обходить, інші перевіряються.
  // POST (фіналізувати) перевіряємо. DELETE (розфіналізувати) — лише admin,
  // не потрапить сюди як non-admin.
  const winCheck = await assertWindowAllowed(session, effectiveLogin, period?.month);
  if (winCheck.blocked) return { error: winCheck.response };

  return { session, monthlyPid, segmentCode, effectiveLogin };
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndAuthorize(request, false);
  if ('error' in parsed) return parsed.error;
  const { session, monthlyPid, segmentCode, effectiveLogin } = parsed;

  // SELECT existing (custom Supabase wrapper не має maybeSingle — використовуємо
  // звичайний select і беремо первый рядок).
  const { data: existingRows, error: selErr } = await supabase
    .from('period_summaries')
    .select('finalized_at, finalized_by')
    .eq('period_id', monthlyPid)
    .eq('user_id', effectiveLogin)
    .eq('segment_code', segmentCode);

  if (selErr) {
    console.error('[finalize.POST] select error', { effectiveLogin, monthlyPid, segmentCode, error: selErr.message });
    return Response.json({ error: selErr.message }, { status: 500 });
  }

  const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
  if (existing?.finalized_at) {
    // Уже фіналізовано — no-op, повертаємо існуючі значення.
    return Response.json({
      success: true,
      alreadyFinalized: true,
      finalizedAt: existing.finalized_at,
      finalizedBy: existing.finalized_by,
    });
  }

  const finalizedAt = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('period_summaries')
    .upsert({
      period_id: monthlyPid,
      user_id: effectiveLogin,
      segment_code: segmentCode,
      finalized_at: finalizedAt,
      finalized_by: session.login,
    }, { onConflict: 'period_id,user_id,segment_code' });

  if (upErr) {
    console.error('[finalize.POST] upsert error', { effectiveLogin, monthlyPid, segmentCode, error: upErr.message });
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({ success: true, finalizedAt, finalizedBy: session.login });
}

export async function DELETE(request: NextRequest) {
  const parsed = await parseAndAuthorize(request, true); // admin only
  if ('error' in parsed) return parsed.error;
  const { monthlyPid, segmentCode, effectiveLogin } = parsed;

  // PATCH через direct REST (custom wrapper не має .update()).
  // ⚠️ НЕ використовуємо URLSearchParams — він робить ДРУГЕ encode на
  // вже-encoded значення (email %40 → %2540 → PostgREST не знаходить рядок).
  // Той самий патерн що у lib/supabase.ts: ручний conн queryParts.
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) return Response.json({ error: 'Supabase env missing' }, { status: 500 });

  const qs = [
    `period_id=eq.${monthlyPid}`,
    `user_id=eq.${encodeURIComponent(effectiveLogin)}`,
    `segment_code=eq.${encodeURIComponent(segmentCode)}`,
  ].join('&');
  const url = `${URL_BASE}/rest/v1/period_summaries?${qs}`;

  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ finalized_at: null, finalized_by: null }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[finalize.DELETE] error', { effectiveLogin, monthlyPid, segmentCode, status: r.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${r.status}: ${text.slice(0, 200)}` }, { status: 500 });
  }

  return Response.json({ success: true });
}

// GET — поточний статус (для UI banner).
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const periodIdStr = searchParams.get('periodId');
  const segmentCode = searchParams.get('segmentCode');
  const monthHint = searchParams.get('month');
  const requestedLogin = searchParams.get('login') || session.login;
  if (!segmentCode || !periodIdStr) {
    return Response.json({ error: 'segmentCode + periodId required' }, { status: 400 });
  }
  const rawPid = parseInt(periodIdStr, 10);
  if (isNaN(rawPid)) {
    return Response.json({ error: 'periodId must be a number' }, { status: 400 });
  }

  let monthlyPid = rawPid;
  if (monthHint && /^\d{4}-\d{2}/.test(monthHint)) {
    monthlyPid = monthlyPidFromMonth(monthHint);
  } else {
    const purePid = monthlyPidFromAnyPid(rawPid);
    if (purePid !== rawPid) monthlyPid = purePid;
  }

  // Scope: admin / director — будь-хто. RM/Manager — свої.
  if (requestedLogin !== session.login
      && session.role !== 'admin'
      && session.role !== 'director'
      && !session.managedUsers.includes(requestedLogin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('period_summaries')
    .select('finalized_at, finalized_by')
    .eq('period_id', monthlyPid)
    .eq('user_id', requestedLogin)
    .eq('segment_code', segmentCode);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return Response.json({
    finalizedAt: row?.finalized_at ?? null,
    finalizedBy: row?.finalized_by ?? null,
  });
}
