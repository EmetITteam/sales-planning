/**
 * POST /api/clients/comments/counts
 *
 * Body: { clientIds: string[] }
 * Returns: { counts: Record<string, number> }
 *
 * Використовується на /clients для badge «коментарі: N» поряд з Ост. подія.
 * POST а не GET бо `clientIds` може бути 150+ елементів — URL обмежує.
 *
 * PostgREST GROUP BY не підтримує, тому тягнемо тільки `client_id_1c`
 * по всіх id-ах і агрегуємо на Node. Для 150 клієнтів × ~10 коментарів
 * це ~1500 рядків — швидко.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const MAX_IDS = 500;

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { clientIds?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const raw = body.clientIds;
  if (!Array.isArray(raw)) {
    return Response.json({ error: 'clientIds must be array' }, { status: 400 });
  }
  const clientIds = raw
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, MAX_IDS);

  if (clientIds.length === 0) {
    return Response.json({ counts: {} });
  }

  const { data, error } = await supabase
    .from('client_comments')
    .select('client_id_1c')
    .in('client_id_1c', clientIds)
    .is('deleted_at', null);

  if (error) {
    console.error('[clients/comments/counts.POST]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { client_id_1c: string }[]) {
    counts[row.client_id_1c] = (counts[row.client_id_1c] || 0) + 1;
  }
  return Response.json({ counts });
}
