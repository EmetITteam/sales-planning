/**
 * GET /api/notifications — список сповіщень поточного користувача.
 *
 * Query params:
 *  - `limit` (default 30, max 100) — кількість
 *  - `unread` (default false) — тільки непрочитані
 *
 * Сортування: непрочитані зверху, потім по `created_at desc`.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { adaptNotification, type NotificationRow } from '@/lib/notifications/types';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const rawLimit = Number(searchParams.get('limit') ?? '30');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 100) : 30;
  const unreadOnly = searchParams.get('unread') === 'true';

  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_login', session.login)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) q = q.is('read_at', null);

  const { data, error } = await q;
  if (error) {
    console.error('[notifications.GET] supabase error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as NotificationRow[];
  const notifications = rows.map(adaptNotification);

  // Окремо рахуємо непрочитані щоб badge у шапці бачив актуальну цифру
  // навіть коли користувач робить GET з limit=30 (а їх більше).
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_login', session.login)
    .is('read_at', null);

  return Response.json({
    notifications,
    unreadCount: unreadCount ?? 0,
  });
}
