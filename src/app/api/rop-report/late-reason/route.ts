/**
 * POST /api/rop-report/late-reason — РОП вписує причину затримки узгодження
 * плану (4.4). Доступ: РОП/CSO/strategic/admin (як сам звіт).
 * Body: { period: 'YYYY-MM', regionCode: string, reason: string }
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canViewRopReport } from '@/lib/feature-flags';
import { upsertLateReason } from '@/lib/rop-report-meta-store';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canViewRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const period = String(body?.period ?? '');
  const regionCode = String(body?.regionCode ?? '');
  const reason = String(body?.reason ?? '').slice(0, 300);
  if (!/^\d{4}-\d{2}$/.test(period) || !regionCode) {
    return Response.json({ error: 'period (YYYY-MM) + regionCode required' }, { status: 400 });
  }
  try {
    await upsertLateReason(period, regionCode, reason, session.login);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
