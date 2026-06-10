/**
 * POST /api/notifications/mark-all-read — позначити всі сповіщення прочитаними.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_login', session.login)
    .is('read_at', null)
    .select('id');

  if (error) {
    console.error('[notifications/mark-all-read] supabase error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, updated: data?.length ?? 0 });
}
