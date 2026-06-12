/**
 * GET  /api/clients/verifications  — список верифікацій для поточного менеджера
 *                                    (для бейджа на картці клієнта і фільтра «На верифікації»).
 * POST /api/clients/verifications  — створити Bitrix-картку + insert у БД.
 *                                    Викликається після успішного `registerNewClient` у 1С.
 *
 * Webhook handler (приходить з reclamation-app) — окремий endpoint:
 *   POST /api/clients/verifications/webhook (X-Internal-Secret).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { adaptClientVerification, type ClientVerificationRow } from '@/lib/client-verifications/types';
import { createVerificationRequest } from '@/lib/bitrix-verification';

const MAX_NAME_LENGTH = 500;

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Підтримуємо два режими:
  //   ?clientId1c=XXX — повертає верифікацію конкретного клієнта (для UI бейджа)
  //   без параметра    — повертає всі pending+in_progress+clarification для менеджера
  const clientId1c = request.nextUrl.searchParams.get('clientId1c');

  let query = supabase.from('client_verifications').select('*');

  if (clientId1c) {
    // Один клієнт — повертаємо останню (latest createdAt) бо теоретично
    // можуть бути дублі при ретраях.
    query = query.eq('client_id_1c', clientId1c).order('created_at', { ascending: false }).limit(1);
  } else {
    // Список менеджера — лише активні (не verified/rejected).
    query = query
      .eq('manager_login', session.login)
      .in('status', ['pending', 'in_progress', 'clarification'])
      .order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    console.error('[verifications.GET]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ClientVerificationRow[];
  const verifications = rows.map(adaptClientVerification);
  return Response.json({ verifications });
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    clientId1c?: string;
    clientName?: string;
    clientPhone?: string;
    clientAddress?: string;
    files?: Array<{ name?: string; contentBase64?: string }>;
  };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const clientId1c = String(body.clientId1c ?? '').trim();
  const clientName = String(body.clientName ?? '').trim().slice(0, MAX_NAME_LENGTH);
  const clientPhone = String(body.clientPhone ?? '').trim();
  const clientAddress = String(body.clientAddress ?? '').trim();

  if (!clientId1c || !clientName) {
    return Response.json({ error: 'clientId1c and clientName required' }, { status: 400 });
  }

  // 1. Створюємо у Bitrix
  let bitrixItemId: number | null = null;
  let bitrixError: string | null = null;
  try {
    // Файли — фільтруємо валідні (name + non-empty base64). Bitrix приймає
    // масив пар [name, base64] — формат той самий що у reclamation-app.
    const validFiles = (body.files ?? [])
      .filter((f): f is { name: string; contentBase64: string } =>
        !!f && typeof f.name === 'string' && typeof f.contentBase64 === 'string' && f.contentBase64.length > 0
      );

    const result = await createVerificationRequest({
      clientId1c,
      clientName,
      clientPhone,
      clientAddress,
      managerLogin: session.login,
      files: validFiles,
    });
    bitrixItemId = result.bitrixItemId;
  } catch (e) {
    // НЕ блокуємо — клієнт у 1С вже зареєстрований. Логуємо, продовжуємо.
    // Adminка зможе побачити такі записи з bitrix_item_id=NULL і вручну
    // створити картку у Bitrix.
    bitrixError = e instanceof Error ? e.message : String(e);
    console.error('[verifications.POST] Bitrix create failed:', bitrixError);
  }

  // 2. Insert у БД
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 });
  }

  const insertBody = {
    client_id_1c: clientId1c,
    bitrix_item_id: bitrixItemId,
    manager_login: session.login,
    client_name: clientName,
    status: 'pending',
  };

  const r = await fetch(`${URL_BASE}/rest/v1/client_verifications`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(insertBody),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[verifications.POST] insert failed:', { status: r.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${r.status}` }, { status: 500 });
  }

  const inserted = await r.json();
  const row = (Array.isArray(inserted) ? inserted[0] : inserted) as ClientVerificationRow;

  return Response.json({
    verification: adaptClientVerification(row),
    bitrixError, // null якщо Bitrix create вдався; повідомлення для логу інакше
  });
}
