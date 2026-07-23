/**
 * Фіналізація Зведеного звіту РОП (rop_report_finalization) per період×тиждень.
 *   GET    ?period=&week=  → статус (canViewRopReport)
 *   POST   { period, week } → здати; нотіф CSO+CMO; лок 4.5/4.4 цього тижня
 *   DELETE { period, week } → пере-відкрити
 * POST/DELETE — лише РОП(headofsd)+admin (canFinalizeRopReport).
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { canViewRopReport, canFinalizeRopReport, CSO_LOGIN, CMO_LOGIN } from '@/lib/feature-flags';
import { readRopFinalization, finalizeRopReport, unfinalizeRopReport } from '@/lib/rop-report-finalization-store';

const P = /^\d{4}-\d{2}$/;
const W = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canViewRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const period = sp.get('period') || '', week = sp.get('week') || '';
  if (!P.test(period) || !W.test(week)) return Response.json({ error: 'period + week required' }, { status: 400 });
  try {
    return Response.json({ status: await readRopFinalization(period, week) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canFinalizeRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const period = String(body?.period ?? ''), week = String(body?.week ?? '');
  if (!P.test(period) || !W.test(week)) return Response.json({ error: 'period + week required' }, { status: 400 });
  try {
    const status = await finalizeRopReport(period, week, session.login);
    // Нотіф CSO + CMO у колокольчик — «РОП здав зведений звіт».
    try {
      await supabase.from('notifications').insert([CSO_LOGIN, CMO_LOGIN].map(login => ({
        user_login: login,
        type: 'rop_report_finalized',
        title: `Зведений звіт РОП здано · ${period}`,
        message: `РОП здав зведений звіт за тиждень ${week}.`,
        link: '/rop-report',
        meta: { period, week, by: session.login },
      })));
    } catch (e) {
      console.warn('[rop-report/finalize] notification insert failed:', (e as Error).message);
    }
    return Response.json({ ok: true, status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canFinalizeRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const period = String(body?.period ?? ''), week = String(body?.week ?? '');
  if (!P.test(period) || !W.test(week)) return Response.json({ error: 'period + week required' }, { status: 400 });
  try {
    await unfinalizeRopReport(period, week);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
