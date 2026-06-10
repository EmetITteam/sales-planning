/**
 * POST /api/notifications/internal — створити сповіщення з зовнішнього webhook.
 *
 * Auth: shared secret `NOTIFICATIONS_INTERNAL_SECRET` у env. Header
 * `X-Internal-Secret`. Це НЕ user-session — викликається з Python webhook
 * чи інших backend systems які не мають JWT cookie.
 *
 * Дедуплікація: payload може містити `dedupKey` (наприклад
 * `bitrix:claim:12:comment:9876`). При повторному POST з тим самим key
 * INSERT на UNIQUE INDEX `notifications_dedup_uniq` фейлить → ми ловимо
 * як ok=true (idempotent). Захищає від retry-loop у webhook.
 *
 * Body:
 * ```
 * {
 *   "userLogin": "sm.dnepr2@emet.in.ua",
 *   "type": "claim_new_comment",
 *   "title": "Новий коментар у рекламації #12",
 *   "message": "Мед-відділ: уточніть LOT",
 *   "link": "/claims/12",
 *   "meta": { "claimId": 12, "commentId": 9876 },
 *   "dedupKey": "bitrix:claim:12:comment:9876"
 * }
 * ```
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { NOTIFICATION_TYPES } from '@/lib/notifications/types';

const VALID_TYPES = new Set<string>(NOTIFICATION_TYPES);

interface InternalPayload {
  userLogin?: string;
  type?: string;
  title?: string;
  message?: string;
  link?: string;
  meta?: Record<string, unknown>;
  dedupKey?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATIONS_INTERNAL_SECRET;
  if (!secret) {
    return Response.json(
      { error: 'NOTIFICATIONS_INTERNAL_SECRET not configured' },
      { status: 500 },
    );
  }
  const provided = request.headers.get('x-internal-secret');
  if (provided !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: InternalPayload;
  try {
    body = (await request.json()) as InternalPayload;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const userLogin = String(body.userLogin ?? '').toLowerCase().trim();
  const type = String(body.type ?? '').trim();
  const title = String(body.title ?? '').trim();

  if (!userLogin || !userLogin.includes('@')) {
    return Response.json({ error: 'userLogin required (email)' }, { status: 400 });
  }
  if (!type || !VALID_TYPES.has(type)) {
    return Response.json(
      { error: `type invalid. Allowed: ${Array.from(VALID_TYPES).join(', ')}` },
      { status: 400 },
    );
  }
  if (!title) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }

  const row = {
    user_login: userLogin,
    type,
    title,
    message: body.message ?? null,
    link: body.link ?? null,
    meta: body.meta ?? {},
    dedup_key: body.dedupKey ?? null,
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert([row])
    .select('id')
    .single();

  if (error) {
    // PostgREST повертає error.message склеєний рядок з кодом у `[23505]`.
    // Якщо це UNIQUE-violation (dedup) — повертаємо ok=true (idempotent).
    if (error.message.includes('[23505]') || error.message.includes('duplicate key')) {
      return Response.json({ success: true, deduplicated: true });
    }
    console.error('[notifications/internal] insert error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const insertedId = (data as { id?: string } | null)?.id;
  return Response.json({ success: true, id: insertedId });
}
