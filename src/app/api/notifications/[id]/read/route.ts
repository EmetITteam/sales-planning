/**
 * POST /api/notifications/[id]/read — позначити сповіщення прочитаним.
 *
 * Ownership: тільки своє сповіщення (user_login = session.login).
 * Idempotent: повторний POST на вже прочитане — no-op.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_login', session.login)
    .is('read_at', null) // тільки якщо ще не прочитане
    .select('id');

  if (error) {
    console.error('[notifications/[id]/read] supabase error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, updated: data?.length ?? 0 });
}
