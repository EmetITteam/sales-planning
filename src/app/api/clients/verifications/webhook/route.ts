/**
 * POST /api/clients/verifications/webhook
 *
 * Внутрішній endpoint для reclamation-app Python webhook.
 * Викликається при зміні статусу Bitrix SPA 1048 item.
 *
 * Auth: X-Internal-Secret header (той самий що /api/notifications/internal).
 *
 * Body:
 *   {
 *     bitrixItemId: number,    // ID картки у Bitrix
 *     stageId: string,         // новий stage (DT1048_10:UC_119I4U тощо)
 *     comment?: string,        // коментар КЦ при rejected/clarification
 *   }
 *
 * Дія:
 *   1. Знаходимо запис у БД за bitrix_item_id
 *   2. Mapping stage → status, оновлюємо
 *   3. Створюємо нотифікацію для менеджера-ініціатора з відповідним типом
 *      (через internal /api/notifications/internal flow дублюємо логіку
 *       inline бо ми вже на серверній стороні)
 */

import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabase } from '@/lib/supabase';
import {
  STAGE_TO_STATUS,
  isFinalStatus,
  type ClientVerificationRow,
  type ClientVerificationStatus,
} from '@/lib/client-verifications/types';

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: NextRequest) {
  // Auth: shared secret
  const secret = process.env.NOTIFICATIONS_INTERNAL_SECRET;
  if (!secret) {
    return Response.json({ error: 'Server not configured' }, { status: 500 });
  }
  const provided = request.headers.get('x-internal-secret') ?? '';
  if (!constantTimeEquals(secret, provided)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { bitrixItemId?: number; stageId?: string; comment?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const bitrixItemId = Number(body.bitrixItemId);
  const stageId = String(body.stageId ?? '').trim();
  const comment = body.comment ? String(body.comment).trim().slice(0, 1000) : null;

  if (!Number.isFinite(bitrixItemId) || bitrixItemId <= 0) {
    return Response.json({ error: 'bitrixItemId required' }, { status: 400 });
  }
  if (!stageId) {
    return Response.json({ error: 'stageId required' }, { status: 400 });
  }

  const newStatus: ClientVerificationStatus | undefined = STAGE_TO_STATUS[stageId];
  if (!newStatus) {
    // Невідомий stage — мабуть нова стадія яку додали у Bitrix.
    // Логуємо, ігноруємо подію (idempotent: webhook reтраї не плодять помилки).
    console.warn('[verifications.webhook] unknown stageId, ignoring:', stageId);
    return Response.json({ ok: true, ignored: true });
  }

  // 1. Знайти запис
  const { data: rows, error: selErr } = await supabase
    .from('client_verifications')
    .select('*')
    .eq('bitrix_item_id', bitrixItemId);
  if (selErr) {
    console.error('[verifications.webhook.select]', selErr.message);
    return Response.json({ error: selErr.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    // Невідомий Bitrix item. Можливо КЦ створив картку вручну, не через
    // нашу систему. Не помилка — мовчки ігноруємо.
    return Response.json({ ok: true, unknown: true });
  }

  const record = rows[0] as unknown as ClientVerificationRow;

  // 2. Idempotency: якщо статус той самий — нічого не робимо
  if (record.status === newStatus) {
    return Response.json({ ok: true, unchanged: true });
  }

  // 3. Update
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 });
  }

  const updateBody: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (newStatus === 'rejected' && comment) {
    updateBody.rejection_reason = comment;
  }
  if (isFinalStatus(newStatus)) {
    updateBody.completed_at = new Date().toISOString();
  }

  const ur = await fetch(`${URL_BASE}/rest/v1/client_verifications?id=eq.${record.id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(updateBody),
  });
  if (!ur.ok) {
    const text = await ur.text().catch(() => '');
    console.error('[verifications.webhook.update]', { status: ur.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${ur.status}` }, { status: 500 });
  }

  // 4. Створити нотифікацію
  const notificationType =
    newStatus === 'verified' ? 'client_verified' :
    newStatus === 'rejected' ? 'client_rejected' :
    newStatus === 'clarification' ? 'client_clarification' :
    null;

  if (notificationType) {
    const title =
      newStatus === 'verified' ? `Клієнт «${record.client_name}» верифіковано` :
      newStatus === 'rejected' ? `Клієнт «${record.client_name}» відхилено` :
      `Уточнення по клієнту «${record.client_name}»`;

    const message = comment || null;

    const dedupKey = `bitrix:verification:${record.id}:${newStatus}`;

    const nr = await fetch(`${URL_BASE}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify({
        user_login: record.manager_login,
        type: notificationType,
        title,
        message,
        link: `/clients?focus=${encodeURIComponent(record.client_id_1c)}`,
        meta: { verificationId: record.id, bitrixItemId, stageId },
        dedup_key: dedupKey,
      }),
    });
    if (!nr.ok) {
      const text = await nr.text().catch(() => '');
      // Не падаємо — основне (status update) вже відбулось.
      console.error('[verifications.webhook.notif]', { status: nr.status, body: text.slice(0, 200) });
    }
  }

  return Response.json({ ok: true, status: newStatus });
}
