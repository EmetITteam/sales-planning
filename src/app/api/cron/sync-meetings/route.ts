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

const BATCH_SIZE = 50;
const MAX_RETRIES = 2;

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

  for (const row of pending) {
    result.processed++;

    const snapshot = row.payload_snapshot as unknown as BufferSnapshot | null;
    if (!snapshot) {
      await markFailed(row.id, 'payload_snapshot is null');
      result.failed++;
      continue;
    }

    const call = mapBufferOpToOneC(row.operation as MeetingSyncOperation, snapshot);
    if (!call) {
      // No-op operation: одразу synced
      await markSynced(row.id, { skipped: true });
      result.skipped++;
      continue;
    }

    // Atomic claim: UPDATE WHERE id=X AND status='pending' RETURNING.
    // Якщо інший виконавець (manual-sync чи попередній cron tick) вже взяв
    // цю row — повернеться 0 rows → skip (запобігає 2-разовому sync).
    const { data: claimed } = await supabase
      .from('meeting_syncs')
      .eq('id', row.id)
      .eq('status', 'pending')
      .update({ status: 'syncing' });
    const claimedRows = Array.isArray(claimed) ? claimed : [];
    if (claimedRows.length === 0) {
      console.log(`[sync-meetings] sync ${row.id} вже claimed іншим процесом → skip`);
      continue;
    }

    if (dryRun) {
      console.log(`[ШАГ 1 DRY] Відправка в 1С для дії "${call.action}":`, JSON.stringify(call.payload, null, 2));
      console.log('[ШАГ 2 DRY] Відповідь від 1С: dryRun=true (HTTP не викликано)');
      await markSynced(row.id, { dryRun: true });
      result.succeeded++;
      continue;
    }

    // Real 1С call — console-log sent → received (формат meeting-app)
    console.log(`[ШАГ 1] Відправка в 1С для дії "${call.action}" (sync ${row.id}):`, JSON.stringify(call.payload, null, 2));
    const callStarted = Date.now();
    const oneCRes = await callOneCServer(call.action, call.payload);
    const callDuration = Date.now() - callStarted;
    if (oneCRes.ok) {
      console.log(`[ШАГ 2] Відповідь від 1С "${call.action}" OK (${callDuration}ms):`, JSON.stringify(oneCRes.data, null, 2));
      await markSynced(row.id, oneCRes.data);
      result.succeeded++;
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
      result.failed++;
    }
  }

  result.durationMs = Date.now() - started;
  return Response.json(result);
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
