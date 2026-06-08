/**
 * POST /api/admin/sync-meetings-now — manual trigger для admin/director.
 *
 * Робить ТЕ САМЕ що cron-worker /api/cron/sync-meetings, але авторизація
 * через session (admin only) замість CRON_SECRET. Корисно:
 *  - На preview deployment де Vercel cron не запускається
 *  - Для оперативного recovery застряглих pending після cron-аварії
 *  - Для дебагу payload/response у Vercel logs (формат [ШАГ 1]/[ШАГ 2])
 *
 * Returns SyncResult (processed/succeeded/failed/skipped/durationMs).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
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

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'director') {
    return Response.json({ error: 'Forbidden — admin/director only' }, { status: 403 });
  }

  const started = Date.now();
  const dryRun = process.env.MEETINGS_SYNC_DRY_RUN === 'true';
  const result: SyncResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    durationMs: 0,
  };

  console.log(`[manual-sync] triggered by ${session.login} (role=${session.role})`);

  // Беремо pending + failed (admin-trigger дає ще шанс failed rows).
  // Cron-worker звичайно тільки pending; це його admin-розширення.
  const { data: pendingRaw, error: selErr } = await supabase
    .from('meeting_syncs')
    .select('*')
    .in('status', ['pending', 'failed'])
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
      await markSynced(row.id, { skipped: true });
      result.skipped++;
      continue;
    }

    // Atomic claim з reset retry_count (admin дає ще шанс failed rows).
    // CAS-pattern: UPDATE WHERE id=X AND status IN (pending,failed). Якщо
    // інший виконавець (cron чи паралельний admin-click) уже взяв цю row —
    // повернеться 0 rows → skip. Запобігає 2-разовому sync і race conditions.
    const { data: claimed } = await supabase
      .from('meeting_syncs')
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .update({ status: 'syncing', retry_count: 0 });
    const claimedRows = Array.isArray(claimed) ? claimed : [];
    if (claimedRows.length === 0) {
      console.log(`[manual-sync] sync ${row.id} вже claimed іншим процесом → skip`);
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[ШАГ 1 DRY] Відправка в 1С для дії "${call.action}":`, JSON.stringify(call.payload, null, 2));
      console.log('[ШАГ 2 DRY] dryRun=true');
      await markSynced(row.id, { dryRun: true });
      result.succeeded++;
      continue;
    }

    console.log(`[ШАГ 1] Відправка в 1С для дії "${call.action}" (sync ${row.id}):`, JSON.stringify(call.payload, null, 2));
    const callStarted = Date.now();
    const oneCRes = await callOneCServer(call.action, call.payload);
    const callDuration = Date.now() - callStarted;
    if (oneCRes.ok) {
      console.log(`[ШАГ 2] Відповідь від 1С "${call.action}" OK (${callDuration}ms):`, JSON.stringify(oneCRes.data, null, 2));
      await markSynced(row.id, oneCRes.data);
      // Симетрично з cron — після save оновлюємо meetings.legacy_1c_id.
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

async function markSynced(id: string, response: unknown = null): Promise<void> {
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
    { id, status: 'failed', failure_reason: reason },
    { onConflict: 'id' },
  );
}
