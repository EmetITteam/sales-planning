/**
 * GET /api/rop-report/xlsx?period=YYYY-MM[&week=YYYY-MM-DD]
 *
 * Експорт Зведеного звіту РОП (Лист 4) у xlsx (стиль EMET). Ті самі дані, що і
 * /api/rop-report (buildRopReport), рендер у книгу через lib/rop-report-xlsx.
 *
 * Доступ: РОП / директор (CSO) / strategic / admin — як і сам звіт.
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canViewRopReport } from '@/lib/feature-flags';
import { buildRopReport } from '@/lib/rop-report-build';
import { buildRopWorkbook } from '@/lib/rop-report-xlsx';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canViewRopReport(session)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const period = sp.get('period') || new Date().toISOString().slice(0, 7);
  const week = sp.get('week');

  const r = await buildRopReport(period, week, session.login);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });

  const wb = buildRopWorkbook(r.data);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="rop-report-${period}.xlsx"`,
    },
  });
}
