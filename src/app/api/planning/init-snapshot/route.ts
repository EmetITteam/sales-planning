/**
 * Endpoint фіксації первинного списку клієнтів менеджера на початок місяця.
 *
 * Викликається:
 *   1. Frontend (planning-form.tsx) ОДИН РАЗ після того як 1С повернула
 *      activeClients + sleepingClients для (manager × segment × period).
 *   2. Backfill-script для існуючих менеджерів — той самий endpoint.
 *
 * Семантика:
 *   - INSERT з ON CONFLICT DO NOTHING — snapshot фіксується ОДИН РАЗ.
 *   - Якщо запис уже існує (повторний виклик) — нічого не міняється.
 *   - Видаляти / редагувати snapshot UI не може. Тільки backfill з
 *     `source='manual'` може створити, але не оновити.
 *
 * Запит:
 *   POST /api/planning/init-snapshot
 *   {
 *     periodId: number,
 *     period?: { weekStart, weekEnd, month },  // для FK upsert якщо потрібно
 *     segmentCode: string,
 *     targetLogin?: string,           // drill-down (РМ за свого менеджера)
 *     userMeta?: { fullName, role, region, regionCode },
 *     forecasts: Array<{ clientId1c, clientName, category1c?, lastPurchaseDate?, lastPurchaseAmount? }>,
 *     gapClosures: Array<{ clientId1c, clientName, category1c?, lastPurchaseDate?, lastPurchaseAmount? }>,
 *     source?: 'auto-populate' | 'backfill' | 'manual'  // default 'auto-populate'
 *   }
 *
 * Відповідь: { success: true, inserted: { forecast: N, gap: M } }
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPeriodMeta } from '@/lib/periods';

interface SnapshotClient {
  clientId1c: string;
  clientName: string;
  category1c?: string | null;
  lastPurchaseDate?: string | null;
  lastPurchaseAmount?: number | string | null;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { periodId, period, segmentCode, targetLogin, userMeta, forecasts, gapClosures, source } = body ?? {};
  if (!segmentCode || typeof periodId !== 'number') {
    return Response.json({ error: 'segmentCode + periodId required' }, { status: 400 });
  }
  // ⚠️ ARCH (2026-05-12): snapshots зберігаємо у monthly pid (як forecasts/gap_closures).
  // Якщо клієнт прислав тижневий — ремаппимо через period.month або через SELECT periods.
  let monthlyPid = periodId;
  if (period?.month && /^\d{4}-\d{2}/.test(String(period.month))) {
    monthlyPid = monthlyPidFromMonth(String(period.month));
  } else {
    const { data: pRow } = await supabase.from('periods').select('month').eq('id', periodId).single();
    if (pRow?.month) monthlyPid = monthlyPidFromMonth(String(pRow.month));
  }
  const allowedSources = new Set(['auto-populate', 'backfill', 'manual']);
  const safeSource = allowedSources.has(source) ? source : 'auto-populate';

  // SECURITY:
  //   - Director: будь-який targetLogin (аналогічно /api/onec/region-stats)
  //   - RM/Manager: тільки свій login або з managedUsers
  // Snapshot — read-mostly архів аудиту, не змінює існуючих операційних
  // даних. Director має право заповнити по всій компанії (backfill).
  const effectiveLogin = targetLogin && targetLogin !== session.login
    ? targetLogin
    : session.login;
  if (effectiveLogin !== session.login && session.role !== 'director' && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden: not your managed user' }, { status: 403 });
  }
  const uid = effectiveLogin;
  const ctx = { uid, pid: monthlyPid, segmentCode };

  // FK setup: period + user мають існувати. UPSERT-имо саме MONTHLY meta,
  // не тижневий (бо все пишемо у monthly pid).
  if (period?.month) {
    const meta = monthlyPeriodMeta(String(period.month));
    const { error: e } = await supabase.from('periods').upsert({
      id: meta.id, week_start: meta.weekStart, week_end: meta.weekEnd, month: meta.month,
    }, { onConflict: 'id' });
    if (e) {
      console.error('[init-snapshot] period upsert error:', { ...ctx, error: e.message });
      return Response.json({ error: `period: ${e.message}` }, { status: 500 });
    }
  }
  // ⚠️ Upsert user — обережно з NOT NULL constraints. Якщо це Director дивиться
  // чужого менеджера, userMeta.role може бути undefined → null → constraint
  // violation. Використовуємо ignoreDuplicates щоб НЕ перезаписувати existing
  // record. Snapshot — read-mostly, профіль user-а тут оновлювати НЕ потрібно.
  // Якщо record не існує — потрібен role (manager як дефолт для targetLogin).
  const profile = effectiveLogin === session.login
    ? { full_name: session.fullName, role: session.role, region: session.region, region_code: session.regionCode }
    : {
        full_name: userMeta?.fullName || effectiveLogin,
        role: userMeta?.role || 'manager', // default — менеджер (Director дивиться чужого)
        region: userMeta?.region || null,
        region_code: userMeta?.regionCode || null,
      };
  const { error: ue } = await supabase.from('users').upsert({
    id: uid, login: effectiveLogin, ...profile,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (ue) {
    console.error('[init-snapshot] user upsert error:', { ...ctx, error: ue.message });
    return Response.json({ error: `user: ${ue.message}` }, { status: 500 });
  }

  const toAmount = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const buildRow = (c: SnapshotClient, blockType: 'forecast' | 'gap') => ({
    period_id: monthlyPid,
    user_id: uid,
    segment_code: segmentCode,
    block_type: blockType,
    client_id_1c: c.clientId1c,
    client_name: c.clientName,
    category_1c: c.category1c || null,
    last_purchase_date: c.lastPurchaseDate || null,
    last_purchase_amount: toAmount(c.lastPurchaseAmount),
    source: safeSource,
  });

  const forecastRows = (forecasts as SnapshotClient[] | undefined ?? [])
    .filter(c => c && c.clientId1c)
    .map(c => buildRow(c, 'forecast'));
  const gapRows = (gapClosures as SnapshotClient[] | undefined ?? [])
    .filter(c => c && c.clientId1c)
    .map(c => buildRow(c, 'gap'));
  const allRows = [...forecastRows, ...gapRows];

  if (allRows.length === 0) {
    return Response.json({ success: true, inserted: { forecast: 0, gap: 0 }, note: 'empty input' });
  }

  // INSERT з ON CONFLICT DO NOTHING — snapshot фіксується ОДИН РАЗ.
  // Повторні виклики лишають оригінальний snapshot.
  const { error: insErr, data: insData } = await supabase
    .from('planning_snapshots')
    .upsert(allRows, {
      onConflict: 'period_id,user_id,segment_code,block_type,client_id_1c',
      ignoreDuplicates: true,
    })
    .select('id, block_type');

  if (insErr) {
    console.error('[init-snapshot] insert error:', { ...ctx, error: insErr.message });
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  const inserted = {
    forecast: (insData ?? []).filter(r => r.block_type === 'forecast').length,
    gap: (insData ?? []).filter(r => r.block_type === 'gap').length,
  };
  return Response.json({ success: true, inserted });
}
