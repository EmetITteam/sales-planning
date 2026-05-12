/**
 * POST /api/planning/confirm-activities
 *
 * Minimal endpoint що persист-ить `stage_done=true` для рядків плану що
 * 1С Action 7 (`checkActivities`) автоматично підтвердив (Дзвінок/Зустріч).
 *
 * НЕ робить save повного плану — лише UPDATE одного поля на конкретних
 * рядках. Це безпечно навіть коли менеджер посеред редагування інших
 * полів (не перетирає її незбережені зміни).
 *
 * Запит:
 *   {
 *     periodId: number,                  // monthly canonical (ремаппиться)
 *     period?: { month: 'YYYY-MM-DD' },
 *     segmentCode: string,
 *     targetLogin?: string,
 *     confirmations: Array<{
 *       block: 'forecast' | 'gap',
 *       clientId1c: string,
 *     }>,
 *   }
 *
 * Логіка UPDATE:
 *   - WHERE (period_id, user_id, segment_code, client_id_1c)
 *   - AND archived_at IS NULL
 *   - AND stage_done = false  (no-op якщо вже true)
 *   - AND stage IN ('Дзвінок', 'Зустріч')  (захист від випадкового update)
 *   - SET stage_done = true
 *
 * Захист:
 *   - Session required + scope check (як у /api/planning POST)
 *   - confirmations.length ≤ 200 (одна форма не може бути більшою)
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';

interface Confirmation {
  block: 'forecast' | 'gap';
  clientId1c: string;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

  // Ремап на monthly pid (паритет з planning/aggregate routes).
  let monthlyPid = periodId;
  if (period?.month && /^\d{4}-\d{2}/.test(String(period.month))) {
    monthlyPid = monthlyPidFromMonth(String(period.month));
  } else {
    const purePid = monthlyPidFromAnyPid(periodId);
    if (purePid !== periodId) monthlyPid = purePid;
  }

  // SECURITY scope: як у /api/planning POST.
  const effectiveLogin = targetLogin && targetLogin !== session.login ? targetLogin : session.login;
  if (effectiveLogin !== session.login
      && session.role !== 'director'
      && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  const uid = effectiveLogin;

  // Розкладаємо confirmations по таблицях.
  const forecastIds: string[] = [];
  const gapIds: string[] = [];
  for (const c of confirmations as Confirmation[]) {
    if (!c || typeof c.clientId1c !== 'string' || !c.clientId1c) continue;
    if (c.block === 'forecast') forecastIds.push(c.clientId1c);
    else if (c.block === 'gap') gapIds.push(c.clientId1c);
  }

  const errors: string[] = [];
  let updatedF = 0, updatedG = 0;

  // UPDATE forecasts SET stage_done=true WHERE ... (тільки stage IN Дзвінок/Зустріч + не archived + не done)
  if (forecastIds.length > 0) {
    // Supabase wrapper не має .neq/.in для UPDATE — використовуємо PATCH через REST direct.
    // Але наш SDK дозволяє ланцюжки `.eq().in().is()` для UPDATE? Перевіримо.
    // Спробуємо через окремий REST fetch — простіше і явніше.
    const r = await directPatch('forecasts', {
      period_id: monthlyPid,
      user_id: uid,
      segment_code: segmentCode,
      archived_at: null,
      stage_done: false,
      client_ids: forecastIds,
      stages: ['Дзвінок', 'Зустріч'],
    });
    if (!r.ok) errors.push(`forecasts: ${r.error}`);
    else updatedF = r.updated;
  }
  if (gapIds.length > 0) {
    const r = await directPatch('gap_closures', {
      period_id: monthlyPid,
      user_id: uid,
      segment_code: segmentCode,
      archived_at: null,
      stage_done: false,
      client_ids: gapIds,
      stages: ['Дзвінок', 'Зустріч'],
    });
    if (!r.ok) errors.push(`gap_closures: ${r.error}`);
    else updatedG = r.updated;
  }

  if (errors.length > 0) {
    console.error('[confirm-activities] errors:', errors);
    return Response.json({ error: errors.join('; ') }, { status: 500 });
  }
  return Response.json({ success: true, updated: { forecasts: updatedF, gaps: updatedG } });
}

// Direct PostgREST PATCH — використовуємо тут бо наш custom SDK не підтримує
// `.in()` + `.is()` + `.eq()` для PATCH. Цей endpoint — єдиний що потребує
// складного WHERE в UPDATE, тож не варто розширювати SDK заради одного місця.
async function directPatch(table: string, opts: {
  period_id: number;
  user_id: string;
  segment_code: string;
  archived_at: null;
  stage_done: boolean;
  client_ids: string[];
  stages: string[];
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) return { ok: false, error: 'Supabase env missing' };

  const escapeListValue = (v: string) =>
    /[,()"\\]/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : encodeURIComponent(v);
  const inList = opts.client_ids.map(escapeListValue).join(',');
  const stagesList = opts.stages.map(escapeListValue).join(',');

  const params = new URLSearchParams();
  params.append('period_id', `eq.${opts.period_id}`);
  params.append('user_id', `eq.${encodeURIComponent(opts.user_id)}`);
  params.append('segment_code', `eq.${opts.segment_code}`);
  params.append('archived_at', 'is.null');
  params.append('stage_done', `eq.${opts.stage_done}`);

  // PostgREST `in.()` синтаксис — конструюємо вручну бо URLSearchParams encode-ить дужки
  const url = `${URL}/rest/v1/${table}?${params.toString()}&client_id_1c=in.(${inList})&stage=in.(${stagesList})`;

  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ stage_done: true }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}` };
  }
  const rows = await r.json().catch(() => []);
  return { ok: true, updated: Array.isArray(rows) ? rows.length : 0 };
}
