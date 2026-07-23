/**
 * POST /api/rop-report/signals — РОП зберігає одне з 3 полів 4.5 Ринкові сигнали.
 * Body: { period: 'YYYY-MM', field: 'failures'|'drivers'|'other', note: string }
 * Доступ: РОП/CSO/strategic/admin (canViewRopReport).
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canViewRopReport } from '@/lib/feature-flags';
import { upsertRopMarketNote, MARKET_NOTE_FIELDS, type MarketNoteField } from '@/lib/rop-market-notes-store';
import { isRopWeekFinalized } from '@/lib/rop-report-finalization-store';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canViewRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const period = String(body?.period ?? '');
  const week = String(body?.week ?? '');
  const field = String(body?.field ?? '') as MarketNoteField;
  const note = String(body?.note ?? '').slice(0, 4000);
  if (!/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: 'period (YYYY-MM) required' }, { status: 400 });
  if (!MARKET_NOTE_FIELDS.includes(field)) return Response.json({ error: 'field must be failures|drivers|other' }, { status: 400 });

  // Лок: якщо звіт цього тижня фіналізовано — редагування заборонено (тільки перегляд).
  if (/^\d{4}-\d{2}-\d{2}$/.test(week) && await isRopWeekFinalized(period, week)) {
    return Response.json({ error: 'Звіт цього тижня фіналізовано — редагування заблоковано.' }, { status: 423 });
  }

  try {
    await upsertRopMarketNote(period, field, note, session.login);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
