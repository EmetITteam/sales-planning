/**
 * GET  /api/clients/comments?clientId1c=XXX  — список коментарів по клієнту
 * POST /api/clients/comments                 — додати коментар
 *
 * Хто може писати: будь-який залогінений юзер (manager + RM + director + admin).
 * Підстава: РМ/director можуть лишити підказку менеджеру.
 *
 * Хто може читати: те саме.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { adaptClientComment, type ClientCommentRow } from '@/lib/client-comments/types';

const MAX_LENGTH = 2000;
const MIN_LENGTH = 1;

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId1c = request.nextUrl.searchParams.get('clientId1c');
  if (!clientId1c) {
    return Response.json({ error: 'clientId1c is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_comments')
    .select('*')
    .eq('client_id_1c', clientId1c)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[clients/comments.GET] supabase error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ClientCommentRow[];
  const comments = rows.map(r => adaptClientComment(r, session.login));
  return Response.json({ comments });
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { clientId1c?: string; comment?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const clientId1c = String(body.clientId1c ?? '').trim();
  const comment = String(body.comment ?? '').trim();

  if (!clientId1c) {
    return Response.json({ error: 'clientId1c required' }, { status: 400 });
  }
  if (comment.length < MIN_LENGTH || comment.length > MAX_LENGTH) {
    return Response.json(
      { error: `Коментар має бути від ${MIN_LENGTH} до ${MAX_LENGTH} символів` },
      { status: 400 },
    );
  }

  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 });
  }

  const r = await fetch(`${URL_BASE}/rest/v1/client_comments`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      client_id_1c: clientId1c,
      author_login: session.login,
      author_name: session.fullName || session.login,
      comment,
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[clients/comments.POST]', { status: r.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${r.status}` }, { status: 500 });
  }

  const inserted = await r.json();
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  return Response.json({ comment: adaptClientComment(row as ClientCommentRow, session.login) });
}
