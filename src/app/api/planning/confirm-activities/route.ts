/**
 * POST /api/planning/confirm-activities
 *
 * Пише ДВА типи даних з 1С Action 7 (`checkActivities`):
 *
 *   1. stage_done — ставиться TRUE коли planned stage співпадає з фактом:
 *        stage='Дзвінок'  + hasCall=true → stage_done=true
 *        stage='Зустріч'  + hasMeeting=true → stage_done=true
 *      ONE-WAY: stage_done=true ніколи не скидається з 1С (поважаємо
 *      ручну позначку менеджера).
 *
 *   2. actual_had_call / actual_had_meeting / actual_first_seen_at —
 *      фіксують РЕАЛЬНІ активності НЕЗАЛЕЖНО від запланованого етапу.
 *      Якщо менеджер планував дзвінок, а зробив зустріч —
 *      actual_had_meeting=true; це дає аналітиці чіткий план/факт-зріз.
 *      ONE-WAY: actual_had_* теж не скидається.
 *
 * Запит:
 *   {
 *     periodId: number,
 *     period?: { month: 'YYYY-MM-DD' },
 *     segmentCode: string,
 *     targetLogin?: string,
 *     confirmations: Array<{
 *       block: 'forecast' | 'gap',
 *       clientId1c: string,
 *       hasCall?: boolean,        // факт з 1С Action 7
 *       hasMeeting?: boolean,     // факт з 1С Action 7
 *       plannedStage?: string,    // 'Дзвінок' | 'Зустріч' | '' — як у state форми
 *     }>,
 *   }
 *
 * Запис per item (PATCH):
 *   - Якщо hasCall → actual_had_call=true, first_seen якщо NULL
 *   - Якщо hasMeeting → actual_had_meeting=true, first_seen якщо NULL
 *   - Якщо (plannedStage='Дзвінок' && hasCall) || (plannedStage='Зустріч' && hasMeeting)
 *     → stage_done=true (плюс попередні два)
 *
 * Якщо hasCall=false AND hasMeeting=false для item — пропускаємо (no-op).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';
import { isPlanningWritesAllowed, MULTI_REGION_RM_OVERRIDES } from '@/lib/feature-flags';
import { assertWindowAllowed } from '@/lib/window-guard';

interface Confirmation {
  block: 'forecast' | 'gap';
  clientId1c: string;
  hasCall?: boolean;
  hasMeeting?: boolean;
  plannedStage?: string;
}

interface PatchPayload {
  stage_done?: boolean;
  actual_had_call?: boolean;
  actual_had_meeting?: boolean;
  actual_first_seen_at?: string;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isPlanningWritesAllowed(session.login)) {
    return Response.json({
      error: 'Триває оновлення системи. Підтвердження активностей тимчасово недоступне.',
      code: 'PLANNING_DISABLED',
    }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { periodId, period, segmentCode, targetLogin, confirmations } = body ?? {};
  if (!segmentCode || typeof periodId !== 'number') {
    return Response.json({ error: 'segmentCode + periodId required' }, { status: 400 });
  }
  if (!Array.isArray(confirmations)) {
    return Response.json({ error: 'confirmations must be array' }, { status: 400 });
  }
  if (confirmations.length === 0) {
    return Response.json({ success: true, updated: { forecasts: 0, gaps: 0 } });
  }
  if (confirmations.length > 200) {
    return Response.json({ error: 'too many confirmations (max 200)' }, { status: 400 });
  }

  // Ремап на monthly pid.
  let monthlyPid = periodId;
  if (period?.month && /^\d{4}-\d{2}/.test(String(period.month))) {
    monthlyPid = monthlyPidFromMonth(String(period.month));
  } else {
    const purePid = monthlyPidFromAnyPid(periodId);
    if (purePid !== periodId) monthlyPid = purePid;
  }

  const effectiveLogin = targetLogin && targetLogin !== session.login ? targetLogin : session.login;
  const isMultiRegionRM = !!MULTI_REGION_RM_OVERRIDES[session.login.toLowerCase().trim()];
  if (effectiveLogin !== session.login
      && session.role !== 'admin'
      && !isMultiRegionRM
      && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  const uid = effectiveLogin;

  const winCheck = await assertWindowAllowed(session, uid, period?.month);
  if (winCheck.blocked) return winCheck.response;

  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  /** Будує per-item PATCH payload. Якщо немає що писати — повертає null. */
  function buildPatch(c: Confirmation): PatchPayload | null {
    const hasCall = c.hasCall === true;
    const hasMeeting = c.hasMeeting === true;
    if (!hasCall && !hasMeeting) return null;

    const patch: PatchPayload = { actual_first_seen_at: nowIso };
    if (hasCall) patch.actual_had_call = true;
    if (hasMeeting) patch.actual_had_meeting = true;

    // stage_done — cross-channel separation: plannedStage='Дзвінок' + hasCall
    // АБО plannedStage='Зустріч' + hasMeeting. Решта — stage_done не чіпаємо.
    if ((c.plannedStage === 'Дзвінок' && hasCall)
        || (c.plannedStage === 'Зустріч' && hasMeeting)) {
      patch.stage_done = true;
    }
    return patch;
  }

  /** PATCH одного рядка. Сервер виставляє ONE-WAY поля — якщо колонка вже
   *  true, PATCH=true → no-op (Postgres UPDATE з тим самим значенням).
   *  actual_first_seen_at пишемо лише якщо у БД ще NULL → COALESCE через
   *  фільтр у URL: `actual_first_seen_at=is.null` (виконається лише раз). */
  async function patchOne(table: string, clientId: string, patch: PatchPayload): Promise<string | null> {
    // PATCH 1 — actual_first_seen_at (тільки якщо ще NULL).
    if (patch.actual_first_seen_at) {
      const qs1 = [
        `period_id=eq.${monthlyPid}`,
        `user_id=eq.${encodeURIComponent(uid)}`,
        `segment_code=eq.${encodeURIComponent(segmentCode)}`,
        `client_id_1c=eq.${encodeURIComponent(clientId)}`,
        `actual_first_seen_at=is.null`,
      ].join('&');
      await fetch(`${URL_BASE}/rest/v1/${table}?${qs1}`, {
        method: 'PATCH',
        headers: {
          apikey: KEY!, Authorization: `Bearer ${KEY!}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ actual_first_seen_at: patch.actual_first_seen_at }),
      });
    }

    // PATCH 2 — основні one-way прапори (без first_seen щоб не перетерти).
    const main: PatchPayload = { ...patch };
    delete main.actual_first_seen_at;
    if (Object.keys(main).length === 0) return null;

    const qs2 = [
      `period_id=eq.${monthlyPid}`,
      `user_id=eq.${encodeURIComponent(uid)}`,
      `segment_code=eq.${encodeURIComponent(segmentCode)}`,
      `client_id_1c=eq.${encodeURIComponent(clientId)}`,
    ].join('&');
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${qs2}`, {
      method: 'PATCH',
      headers: {
        apikey: KEY!, Authorization: `Bearer ${KEY!}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(main),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return `HTTP ${r.status}: ${text.slice(0, 100)}`;
    }
    return null;
  }

  let updatedF = 0, updatedG = 0;
  const errors: string[] = [];

  // Розкладаємо confirmations + обчислюємо patch, виконуємо паралельно.
  const tasks: Array<{ table: 'forecasts' | 'gap_closures'; clientId: string; patch: PatchPayload }> = [];
  for (const c of confirmations as Confirmation[]) {
    if (!c || typeof c.clientId1c !== 'string' || !c.clientId1c) continue;
    if (c.block !== 'forecast' && c.block !== 'gap') continue;
    const patch = buildPatch(c);
    if (!patch) continue;
    tasks.push({
      table: c.block === 'forecast' ? 'forecasts' : 'gap_closures',
      clientId: c.clientId1c,
      patch,
    });
  }

  // Концурентність — невелика (макс 200 items, на практиці 10-30).
  // Запускаємо все паралельно — Vercel дає достатньо connections.
  const results = await Promise.all(tasks.map(t => patchOne(t.table, t.clientId, t.patch).then(err => ({ t, err }))));
  for (const { t, err } of results) {
    if (err) errors.push(`${t.table} ${t.clientId}: ${err}`);
    else if (t.table === 'forecasts') updatedF++;
    else updatedG++;
  }

  if (errors.length > 0) {
    console.error('[confirm-activities] errors:', errors);
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }
  return Response.json({ success: true, updated: { forecasts: updatedF, gaps: updatedG } });
}
