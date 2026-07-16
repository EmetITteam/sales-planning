/**
 * CRON: синхронізація продажів поточного місяця з 1С (getSalesLineItems) у
 * таблицю `sales` + refresh_kpi_rollup. Дашборд «Стратегія» читає rollup, тож
 * після цього крону бачить свіжі дані БЕЗ live-виклику 1С.
 *
 * Тягне ТІЛЬКИ поточний місяць (минулі — з backfill, не чіпаємо). Пагінація по
 * spec: page/pageSize, doки hasMore. Full-month replace ЛИШЕ після успішної
 * вигрузки (guard — не стираємо місяць на помилці 1С).
 *
 * Захист: `Authorization: Bearer ${CRON_SECRET}` (Vercel cron) АБО admin-сесія.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import { mapLineItemToRow, replaceMonthSales, refreshKpiRollup, type RawLineItem } from '@/lib/sales-sync';

export const maxDuration = 120;

const baseUrl = process.env.ONEC_BASE_URL!;
const oneCHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.ONEC_LOGIN && process.env.ONEC_PASSWORD) {
  oneCHeaders['Authorization'] = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');
}

interface SalesPage { page: number; pageSize: number; totalRows: number; hasMore: boolean; rows: RawLineItem[] }

async function fetchSalesPage(dateFrom: string, dateTo: string, page: number): Promise<SalesPage | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(baseUrl, {
        method: 'POST', headers: oneCHeaders, cache: 'no-store',
        body: JSON.stringify({ action: 'getSalesLineItems', payload: { dateFrom, dateTo, page, pageSize: 1000, login: DIRECTOR_PROXY_LOGIN } }),
        signal: AbortSignal.timeout(40_000),
      });
      const text = await res.text();
      const json = JSON.parse(text) as { status?: string; data?: SalesPage };
      if (json.status === 'success' && json.data) return json.data;
      if (attempt < 2) { await new Promise(r => setTimeout(r, 800)); continue; }
      return null;
    } catch {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 800)); continue; }
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    return await handleSync(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/sync-sales] error', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function handleSync(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const okCron = !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
  let okAdmin = false;
  if (!okCron) { const s = await getSession(); okAdmin = s?.role === 'admin'; }
  if (!okCron && !okAdmin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const monthEndExclusive = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  // dateTo включно → останній день місяця; 1С фільтрує по «Дата» документа.
  const lastDay = new Date(Date.UTC(nextY, nextM - 1, 0)).getUTCDate();
  const dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Пагінація: тягнемо всі сторінки місяця.
  const rows: Record<string, unknown>[] = [];
  let page = 1, totalRows = 0, pages = 0;
  for (;;) {
    const data = await fetchSalesPage(monthStart, dateTo, page);
    if (!data) return Response.json({ error: `getSalesLineItems failed on page ${page}` }, { status: 502 });
    pages++;
    const pageRows = Array.isArray(data.rows) ? data.rows : [];
    totalRows = data.totalRows ?? rows.length + pageRows.length;
    for (const r of pageRows) rows.push(mapLineItemToRow(r));
    if (!data.hasMore || pageRows.length === 0) break;
    page++;
    if (page > 50) break; // запобіжник від нескінченного циклу
  }

  // Full-month replace + rollup (guard: сюди доходимо лише при успішній вигрузці).
  const { inserted } = await replaceMonthSales(rows, monthStart, monthEndExclusive);
  await refreshKpiRollup(y);

  console.log('[cron/sync-sales]', { month: monthStart, pages, totalRows, inserted });
  return Response.json({ ok: true, month: `${y}-${String(m).padStart(2, '0')}`, pages, totalRows, inserted });
}
