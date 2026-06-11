/**
 * DELETE /api/clients/comments/[id] — soft-delete коментаря.
 *
 * Дозволено: тільки автору (порівнюємо author_login з session.login).
 * Admin може видалити будь-який (на майбутнє — поки той самий guard).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Перевіряємо що коментар існує і належить юзеру (admin може будь-який).
  const { data: rows, error: selErr } = await supabase
    .from('client_comments')
    .select('author_login, deleted_at')
    .eq('id', idNum);

  if (selErr) {
    console.error('[clients/comments.DELETE.select]', selErr.message);
    return Response.json({ error: selErr.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const row = rows[0] as { author_login: string; deleted_at: string | null };
  if (row.deleted_at) {
    // Ідемпотентно — повертаємо ok без зміни.
    return Response.json({ ok: true });
  }

  const sessionLogin = session.login.toLowerCase().trim();
  const authorLogin = row.author_login.toLowerCase().trim();
  if (sessionLogin !== authorLogin && session.role !== 'admin') {
    return Response.json({ error: 'Можна видаляти тільки свої коментарі' }, { status: 403 });
  }

  // Soft-delete: PATCH deleted_at = NOW()
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 });
  }

  const r = await fetch(`${URL_BASE}/rest/v1/client_comments?id=eq.${idNum}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[clients/comments.DELETE.patch]', { status: r.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${r.status}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
