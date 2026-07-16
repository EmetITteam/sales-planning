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

/** Синхронізує один місяць (fetch усіх сторінок + full-month replace, БЕЗ rollup). */
async function syncMonth(y: number, m: number): Promise<{ month: string; pages: number; totalRows: number; inserted: number; skipped?: boolean }> {
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const monthEndExclusive = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  // dateTo включно → останній день місяця; 1С фільтрує по «Дата» документа.
  const lastDay = new Date(Date.UTC(nextY, nextM - 1, 0)).getUTCDate();
  const dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const rows: Record<string, unknown>[] = [];
  let page = 1, totalRows = 0, pages = 0;
  for (;;) {
    const data = await fetchSalesPage(monthStart, dateTo, page);
    if (!data) throw new Error(`getSalesLineItems failed on ${monthStart} page ${page}`);
    pages++;
    const pageRows = Array.isArray(data.rows) ? data.rows : [];
    totalRows = data.totalRows ?? rows.length + pageRows.length;
    for (const r of pageRows) rows.push(mapLineItemToRow(r));
    if (!data.hasMore || pageRows.length === 0) break;
    page++;
    if (page > 50) break; // запобіжник
  }
  // ⚠️ Guard: порожній АЛЕ успішний респонс 1С (transient glitch) НЕ повинен
  // стерти весь місяць. Поточний місяць після 1-го числа завжди має продажі,
  // попередній — тим більше. 0 рядків → пропускаємо replace (не чіпаємо БД).
  if (rows.length === 0) {
    return { month: `${y}-${String(m).padStart(2, '0')}`, pages, totalRows, inserted: 0, skipped: true };
  }
  const { inserted } = await replaceMonthSales(rows, monthStart, monthEndExclusive);
  return { month: `${y}-${String(m).padStart(2, '0')}`, pages, totalRows, inserted };
}

async function handleSync(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const okCron = !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
  let okAdmin = false;
  if (!okCron) { const s = await getSession(); okAdmin = s?.role === 'admin'; }
  if (!okCron && !okAdmin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Які місяці синкати:
  //  - ?month=YYYY-MM (admin) → лише цей місяць (сверка/добір).
  //  - інакше: ЗАВЖДИ поточний; + у перші 10 днів місяця ще й ПОПЕРЕДНІЙ
  //    (ловимо пізні правки/донесення документів минулого місяця при закритті).
  const monthParam = request.nextUrl.searchParams.get('month');
  const targets: Array<{ y: number; m: number }> = [];
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    targets.push({ y, m });
  } else {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    targets.push({ y, m });
    if (now.getUTCDate() <= 10) {
      targets.push({ y: m === 1 ? y - 1 : y, m: m === 1 ? 12 : m - 1 });
    }
  }

  const months = [];
  for (const t of targets) months.push(await syncMonth(t.y, t.m));
  // Rollup — раз на кожен унікальний рік (замість двічі для того самого).
  for (const yr of new Set(targets.map(t => t.y))) await refreshKpiRollup(yr);

  console.log('[cron/sync-sales]', { months });
  return Response.json({ ok: true, months });
}
