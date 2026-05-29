/**
 * /api/clients/plan-totals
 *
 * Повертає **план по клієнтах** для CRM-сторінки `/clients` — сума forecast +
 * gap_closure (потенціал закриття розриву) на клієнта × сегмент.
 *
 * Дані з Supabase (наш план), без 1С — факт тягне клієнт окремо через
 * useOneCData('getSalesFact'). Така архітектура зберігає чистоту:
 *  - Plan = наша БД
 *  - Fact = 1С
 *
 * Endpoint POST бо потребує body з clientIds (їх може бути >100).
 *
 * Запит:
 *   POST /api/clients/plan-totals
 *   { login: string, periodId: number, month?: 'YYYY-MM' }
 *
 * Відповідь:
 *   {
 *     totals: {
 *       [clientId]: {
 *         planTotal: number,                         // forecast + gap
 *         brands: { [segmentCode]: number },         // per-bd
 *       }
 *     }
 *   }
 *
 * Security: ті самі правила що у /api/planning/aggregate — менеджер тільки свій
 * login, РМ + керовані, Director/Admin — будь-кого.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';
import { MULTI_REGION_RM_OVERRIDES } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { login, periodId, month: monthHint } = body ?? {};
  const rawPid = parseInt(String(periodId), 10);
  if (isNaN(rawPid)) return Response.json({ error: 'periodId must be number' }, { status: 400 });
  let pid = rawPid;
  if (typeof monthHint === 'string' && /^\d{4}-\d{2}/.test(monthHint)) {
    pid = monthlyPidFromMonth(monthHint);
  } else {
    pid = monthlyPidFromAnyPid(rawPid);
  }

  if (!login || typeof login !== 'string') {
    return Response.json({ error: 'login required' }, { status: 400 });
  }

  // SECURITY: ті самі scope-перевірки що /api/planning/aggregate
  const sessionLogin = session.login.toLowerCase().trim();
  const requestedLogin = String(login).toLowerCase().trim();
  const isMultiRegionRM = !!MULTI_REGION_RM_OVERRIDES[sessionLogin];
  const isAdminLike = session.role === 'director' || session.role === 'admin' || isMultiRegionRM;
  if (!isAdminLike && requestedLogin !== sessionLogin && !session.managedUsers?.includes(requestedLogin)) {
    return Response.json({ error: 'login outside scope' }, { status: 403 });
  }

  const SBURL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SBKEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sbHeaders = { apikey: SBKEY, Authorization: `Bearer ${SBKEY}` };

  // Пагінований fetch (PostgREST дефолт 1000 рядків)
  async function fetchAllPaginated(table: string, fields: string): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const url = `${SBURL}/rest/v1/${table}?select=${fields}&period_id=eq.${pid}&archived_at=is.null&user_id=eq.${requestedLogin}`;
      const r = await fetch(url, { headers: { ...sbHeaders, Range: `${from}-${from + 999}` } });
      if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
      const rows = await r.json();
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  let forecastsData: unknown[];
  let gapsData: unknown[];
  try {
    [forecastsData, gapsData] = await Promise.all([
      fetchAllPaginated('forecasts', 'segment_code,client_id_1c,forecast_amount'),
      fetchAllPaginated('gap_closures', 'segment_code,client_id_1c,potential_amount'),
    ]);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'fetch failed' }, { status: 500 });
  }

  type FRow = { segment_code: string; client_id_1c: string; forecast_amount: number };
  type GRow = { segment_code: string; client_id_1c: string; potential_amount: number };

  const totals: Record<string, { planTotal: number; brands: Record<string, number> }> = {};

  function add(clientId: string, segment: string, amount: number) {
    if (!clientId || !segment || !amount) return;
    if (!totals[clientId]) totals[clientId] = { planTotal: 0, brands: {} };
    totals[clientId].planTotal += amount;
    totals[clientId].brands[segment] = (totals[clientId].brands[segment] || 0) + amount;
  }

  for (const f of forecastsData as FRow[]) {
    add(f.client_id_1c, f.segment_code, Number(f.forecast_amount) || 0);
  }
  for (const g of gapsData as GRow[]) {
    add(g.client_id_1c, g.segment_code, Number(g.potential_amount) || 0);
  }

  return Response.json({ totals });
}
