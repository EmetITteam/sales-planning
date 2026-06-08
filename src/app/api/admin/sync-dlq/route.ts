/**
 * GET /api/admin/sync-dlq — список failed sync rows для оперативного recovery.
 * POST /api/admin/sync-dlq/retry — reset failed → pending (наступний sync спробує).
 * POST /api/admin/sync-dlq/skip — позначити failed → synced (вручну пропустити).
 *
 * Тільки admin/director. Дозволяє оператору розбиратися з зависшими row-ами
 * без лазіння у Supabase Studio.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'director') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('meeting_syncs')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'director') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { op: 'retry' | 'skip'; id: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.id || (body.op !== 'retry' && body.op !== 'skip')) {
    return Response.json({ error: 'op and id required' }, { status: 400 });
  }

  if (body.op === 'retry') {
    const { error } = await supabase
      .from('meeting_syncs')
      .eq('id', body.id)
      .eq('status', 'failed')
      .update({ status: 'pending', retry_count: 0, failure_reason: null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    console.log(`[sync-dlq] retry triggered by ${session.login} for sync ${body.id}`);
    return Response.json({ ok: true });
  }

  // skip — позначити як synced без виклику 1С (admin визнав втрату)
  const { error } = await supabase
    .from('meeting_syncs')
    .eq('id', body.id)
    .eq('status', 'failed')
    .update({
      status: 'synced',
      synced_at: new Date().toISOString(),
      failure_reason: `skipped manually by ${session.login}`,
    });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  console.log(`[sync-dlq] manually skipped by ${session.login}: ${body.id}`);
  return Response.json({ ok: true });
}
