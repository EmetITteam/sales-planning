/**
 * GET /api/cron/sync-meetings — Vercel cron worker (Sprint 1.5.3).
 *
 * Кожну хвилину бере до 50 `pending` рядків з `meeting_syncs`, шле у 1С
 * через відповідний action, оновлює статус (`synced` / `failed`).
 *
 * Аутентифікація: `Authorization: Bearer ${CRON_SECRET}` — Vercel cron
 * шле автоматично коли env `CRON_SECRET` встановлений. Manual виклик
 * для debug — той самий header.
 *
 * Idempotency: ставимо `syncing` ПЕРЕД викликом 1С. Якщо worker впав посеред
 * виклику — наступний запуск побачить `syncing` старіше N хвилин і поверне
 * у `pending` для retry. Поки що цю частину reconciliation — TODO Sprint 1.5.x.
 *
 * DRY_RUN: коли `MEETINGS_SYNC_DRY_RUN=true` — лог payload + одразу `synced`
 * БЕЗ HTTP-виклику до 1С. Дефолт FALSE — actions уже live у meeting-app, shape
 * співпадає (див. `meeting-app/js/meetings.js` save/update/start flow).
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { callOneCServer } from '@/lib/onec-server';
import {
  mapBufferOpToOneC,
  type BufferSnapshot,
} from '@/lib/meetings/sync-mapping';
import type {
  MeetingSyncRowDb,
  MeetingSyncOperation,
} from '@/lib/meetings/types';

// BATCH_SIZE: до 10 рядків за tick. Обробляються паралельно (group by
// meeting_id, sequential within group). Within group sequential обов'язково:
// save → start → finish мають правильний порядок (інакше 1С не знайде meetingId).
const BATCH_SIZE = 10;
const MAX_RETRIES = 2;
// Vercel Pro plan: до 300с. Залишаємо запас для cold-start + 1С повільне
// (5-15с per row). 60с не вистачало навіть на 12 паралельних викликів.
export const maxDuration = 300;
// Recovery: якщо рядок завис у status='syncing' більше N хв — функція вмерла
// у середині обробки. Скидаємо у pending щоб наступний tick підхопив.
const STALE_SYNCING_MIN = 5;

interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  durationMs: number;
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  // Auth
  const auth = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: 'CRON_SECRET env not configured' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = process.env.MEETINGS_SYNC_DRY_RUN === 'true';
  const result: SyncResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    durationMs: 0,
  };

  // === Recovery: stale syncing → pending ===
  // Якщо рядок завис у 'syncing' довше ніж STALE_SYNCING_MIN хв — функція
  // вмерла посередині (Vercel timeout, 1С тайм-аут). Скидаємо у 'pending' щоб
  // підхопила цей tick. Без цього рядки висіли вічно після першого збою.
  const staleThreshold = new Date(Date.now() - STALE_SYNCING_MIN * 60_000).toISOString();
  const { data: recovered } = await supabase
    .from('meeting_syncs')
    .eq('status', 'syncing')
    .lt('created_at', staleThreshold)
    .update({ status: 'pending' });
  const recoveredCount = Array.isArray(recovered) ? recovered.length : 0;
  if (recoveredCount > 0) {
    console.log(`[sync-meetings] recovered ${recoveredCount} stale syncing → pending`);
  }

  // Тягнемо pending
  const { data: pendingRaw, error: selErr } = await supabase
    .from('meeting_syncs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (selErr) {
    return Response.json({ error: `select pending: ${selErr.message}` }, { status: 500 });
  }

  const pending = ((pendingRaw ?? []) as unknown as MeetingSyncRowDb[]).slice(0, BATCH_SIZE);
  if (pending.length === 0) {
    result.durationMs = Date.now() - started;
    return Response.json(result);
  }

  // Group by meeting_id — save→start→finish ОДНОЇ зустрічі мають йти sequential,
  // інакше 1С не знайде meetingId на start (race з saveNewMeeting). Між зустрічами
  // обробляємо паралельно — Vercel timeout 60с не дозволяє >4 sequential калів 1С.
  const byMeeting = new Map<string, MeetingSyncRowDb[]>();
  for (const row of pending) {
    const key = row.meeting_id || row.id;
    const arr = byMeeting.get(key) ?? [];
    arr.push(row);
    byMeeting.set(key, arr);
  }
  result.processed = pending.length;

  // Counters треба інкрементувати атомарно з різних async-tasks
  const counters = { succeeded: 0, failed: 0, skipped: 0 };

  await Promise.allSettled(
    Array.from(byMeeting.values()).map(async (group) => {
      for (const row of group) {
        try {
          await processSyncRow(row, dryRun, counters);
        } catch (err) {
          // Глобальний catch — якщо щось у processSyncRow кинуло (мережа,
          // парсинг), маркуємо failed щоб рядок НЕ застряг у syncing.
          counters.failed++;
          const msg = (err as Error).message?.slice(0, 200) ?? 'unknown';
          console.error(`[sync-meetings] row ${row.id} throw:`, msg);
          await markFailed(row.id, `throw: ${msg}`).catch(() => undefined);
        }
      }
    }),
  );

  result.succeeded = counters.succeeded;
  result.failed = counters.failed;
  result.skipped = counters.skipped;

  result.durationMs = Date.now() - started;
  return Response.json(result);
}

/**
 * Обробка одного sync-row: claim → call 1С → markSynced/markFailed.
 * Усі помилки кидаються наверх — wrapper у GET перехоплює і робить markFailed.
 */
async function processSyncRow(
  row: MeetingSyncRowDb,
  dryRun: boolean,
  counters: { succeeded: number; failed: number; skipped: number },
): Promise<void> {
  const snapshot = row.payload_snapshot as unknown as BufferSnapshot | null;
  if (!snapshot) {
    await markFailed(row.id, 'payload_snapshot is null');
    counters.failed++;
    return;
  }

  const call = mapBufferOpToOneC(row.operation as MeetingSyncOperation, snapshot);
  if (!call) {
    await markSynced(row.id, { skipped: true });
    counters.skipped++;
    return;
  }

  // Atomic claim: PATCH WHERE id=X AND status='pending' RETURNING.
  // ⚠️ ВАЖЛИВО: даже якщо `claimed` повернувся порожнім (PostgREST може
  // не повернути тіло на 204), перечитуємо стан — якщо вже 'syncing',
  // вважаємо що ми його взяли і продовжуємо. Це закриває dead-lock
  // який ламав весь cron у червні 2026 (рядки висіли у `syncing` назавжди).
  const { data: claimed } = await supabase
    .from('meeting_syncs')
    .eq('id', row.id)
    .eq('status', 'pending')
    .update({ status: 'syncing' });
  const claimedRows = Array.isArray(claimed) ? claimed : [];
  if (claimedRows.length === 0) {
    // Re-read: можливо PostgREST повернула пусте тіло, але PATCH спрацював.
    const { data: cur } = await supabase
      .from('meeting_syncs')
      .select('status')
      .eq('id', row.id)
      .single();
    const curStatus = (cur as { status?: string } | null)?.status;
    if (curStatus !== 'syncing') {
      console.log(`[sync-meetings] sync ${row.id} вже не pending (status=${curStatus}) → skip`);
      return;
    }
    // Status вже syncing — це наш claim. Продовжуємо.
  }

  if (dryRun) {
    console.log(`[ШАГ 1 DRY] Відправка в 1С для дії "${call.action}":`, JSON.stringify(call.payload, null, 2));
    console.log('[ШАГ 2 DRY] Відповідь від 1С: dryRun=true (HTTP не викликано)');
    await markSynced(row.id, { dryRun: true });
    counters.succeeded++;
    return;
  }

  console.log(`[ШАГ 1] Відправка в 1С для дії "${call.action}" (sync ${row.id}):`, JSON.stringify(call.payload, null, 2));
  const callStarted = Date.now();
  const oneCRes = await callOneCServer(call.action, call.payload);
  const callDuration = Date.now() - callStarted;
  if (oneCRes.ok) {
    console.log(`[ШАГ 2] Відповідь від 1С "${call.action}" OK (${callDuration}ms):`, JSON.stringify(oneCRes.data, null, 2));
    await markSynced(row.id, oneCRes.data);
    // P0 fix: після успішного save у 1С пишемо legacy_1c_id = наш UUID
    // у meetings. Тоді подальші start/finish/cancel-операції шлють у 1С
    // правильний meetingId (не натирають NULL з snapshot.legacyOneCId).
    if (call.action === 'saveNewMeeting' && row.meeting_id) {
      const onecId =
        (oneCRes.data && typeof oneCRes.data === 'object' && (oneCRes.data as Record<string, unknown>).ID) ||
        (oneCRes.data && typeof oneCRes.data === 'object' && (oneCRes.data as Record<string, unknown>).meetingId);
      const legacyId = typeof onecId === 'string' && onecId.trim() ? onecId.trim() : row.meeting_id;
      await supabase
        .from('meetings')
        .eq('id', row.meeting_id)
        .update({ legacy_1c_id: legacyId });
    }
    counters.succeeded++;
  } else {
    console.error(`[ШАГ 2] Помилка 1С "${call.action}" (${callDuration}ms, HTTP ${oneCRes.httpStatus}):`, oneCRes.errorMessage);
    const newRetry = (row.retry_count ?? 0) + 1;
    const nextStatus = newRetry >= MAX_RETRIES ? 'failed' : 'pending';
    await supabase.from('meeting_syncs').upsert(
      {
        id: row.id,
        status: nextStatus,
        retry_count: newRetry,
        failure_reason: oneCRes.errorMessage ?? 'unknown error',
        onec_response: oneCRes.httpStatus ? { httpStatus: oneCRes.httpStatus } : null,
      },
      { onConflict: 'id' },
    );
    counters.failed++;
  }
}

async function markSynced(
  id: string,
  response: unknown = null,
): Promise<void> {
  await supabase.from('meeting_syncs').upsert(
    {
      id,
      status: 'synced',
      synced_at: new Date().toISOString(),
      onec_response: response as Record<string, unknown> | null,
      failure_reason: null,
    },
    { onConflict: 'id' },
  );
}

async function markFailed(id: string, reason: string): Promise<void> {
  await supabase.from('meeting_syncs').upsert(
    {
      id,
      status: 'failed',
      failure_reason: reason,
    },
    { onConflict: 'id' },
  );
}
