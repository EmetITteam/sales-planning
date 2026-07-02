/**
 * POST /api/admin/cache-invalidate
 *
 * Очищає всі in-memory strategic-kpi кеші (metrics, categories, promos,
 * first-trained, rep-seminars, reactivation).
 *
 * Використання:
 *   - Викликається backfill-скриптами після завантаження нових продажів
 *     щоб дашборд показував свіжі дані а не старий 5-хвилинний кеш.
 *   - Admin-only.
 *
 * Створено 2026-07-02.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import { clearAllStrategicCaches } from '@/lib/strategic-kpi/cache-helper';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // Тільки admin (не strategic-kpi login) — це destructive операція.
  if (!isAdminLogin(session.login)) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const result = clearAllStrategicCaches();
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}
