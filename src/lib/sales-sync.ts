/**
 * Синхронізація продажів поточного місяця з 1С (Action getSalesLineItems) у
 * нашу таблицю `sales`. Минулі місяці лежать з backfill і не чіпаються — тягнемо
 * ТІЛЬКИ поточний (відкритий) місяць і робимо full-month replace, потім
 * refresh_kpi_rollup. Дашборд «Стратегія» читає rollup → без live-1С при відкритті.
 *
 * Класифікація (бренд/канал/подарунок/ignore) — наша (`classifySale`), ІДЕНТИЧНА
 * backfill-скрипту. 1С віддає сирі line-items.
 */
import { supabase } from './supabase';
import { classifySale } from './strategic-kpi/sales-classifier';

/** Сирий рядок з getSalesLineItems (див. docs/ONEC_STRATEGIC_LIVE_SPEC.md). */
export interface RawLineItem {
  docNumber: string;
  docLine: number;
  date: string;              // 'YYYY-MM-DDTHH:MM:SS' (київський, без TZ)
  clientCode: string;
  clientName?: string;
  phone?: string | null;
  product: string;
  discount?: string | null;
  division: string;
  seller?: string | null;
  seminar?: string | null;
  seminarDate?: string | null;
  project?: string | null;
  projectDate?: string | null;
  qty: number;
  sumUsd: number;
}

/** Line-item → рядок таблиці `sales` (з нашою класифікацією). */
export function mapLineItemToRow(r: RawLineItem): Record<string, unknown> {
  const c = classifySale({ product: r.product, discount: r.discount, division: r.division, sumUsd: r.sumUsd });
  return {
    doc_id: r.docNumber,
    doc_line: r.docLine,
    sale_date: r.date,
    client_code: r.clientCode,
    client_name: r.clientName ?? '',
    phone: r.phone ?? null,
    product: r.product,
    discount: r.discount ?? null,
    division: r.division,
    seller: r.seller ?? null,
    seminar: r.seminar || null,
    seminar_date: r.seminarDate || null,
    project: r.project || null,
    project_date: r.projectDate || null,
    qty: r.qty,
    sum_usd: r.sumUsd,
    brand: c.brand,
    channel: c.channel,
    is_ignored: c.isIgnored,
    is_gift: c.isGift,
    is_excluded: c.isExcluded,
    gift_brand: c.giftBrand,
  };
}

/**
 * Full-month replace: видаляє продажі місяця [monthStart; monthEndExclusive) і
 * вставляє свіжі. Викликати ЛИШЕ після успішної вигрузки (щоб не стерти місяць
 * на помилці 1С). Скасовані документи зникають самі (їх нема у свіжому наборі).
 */
export async function replaceMonthSales(
  rows: Record<string, unknown>[],
  monthStartIso: string,
  monthEndExclusiveIso: string,
): Promise<{ deleted: boolean; inserted: number }> {
  const { error: delErr } = await supabase.from('sales')
    .delete().gte('sale_date', monthStartIso).lt('sale_date', monthEndExclusiveIso);
  if (delErr) throw new Error(`replaceMonthSales delete: ${delErr.message}`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('sales').insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`replaceMonthSales insert: ${error.message}`);
  }
  return { deleted: true, inserted: rows.length };
}

/** Оновлює агрегат sales_kpi_rollup для року (щоб дашборд бачив свіжі дані). */
export async function refreshKpiRollup(year: number): Promise<void> {
  const { error } = await supabase.rpc('refresh_kpi_rollup', { p_year: year });
  if (error) throw new Error(`refresh_kpi_rollup(${year}): ${error.message}`);
}
