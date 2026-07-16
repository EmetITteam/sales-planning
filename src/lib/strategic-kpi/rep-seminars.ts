/**
 * Ellanse семінари у представництвах — автоматично зі sales.
 *
 * Кожна унікальна трійка (seminar, division, seminar_date) = 1 ПОДІЯ семінару.
 * Один семінар у місті може проходити кілька разів різними датами — рахуємо
 * кожну окремо (migration 044 додала seminar_date). Доки дата не заповнена
 * (стара вигрузка) — групуємо як раніше по (seminar, division).
 * Учасники = COUNT DISTINCT client_code для події у періоді.
 *
 * Створено 2026-07-02.
 */

import { supabase } from '@/lib/supabase';
import { AsyncCache } from './cache-helper';

export interface RepSeminar {
  seminar: string;
  division: string;              // Місто (Київ, Одеса, Дніпро, ...)
  seminar_date: string | null;   // Дата проведення (YYYY-MM-DD) — подія
  unique_clients: number;
}

interface Row {
  division: string;
  seminar: string;
  seminar_date: string | null;
  client_code: string;
}

const CACHE = new AsyncCache<RepSeminar[]>(5 * 60 * 1000, 'rep-seminars');

export async function fetchEllanseRepSeminars(
  dateFromIso: string,
  dateToIso: string,
): Promise<RepSeminar[]> {
  return CACHE.getOrLoad(`${dateFromIso}|${dateToIso}`, () => doFetchRepSeminars(dateFromIso, dateToIso));
}

async function doFetchRepSeminars(
  dateFromIso: string,
  dateToIso: string,
): Promise<RepSeminar[]> {
  const all: Row[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const res = await supabase
      .from('sales')
      .select('division,seminar,seminar_date,client_code')
      .eq('brand', 'Ellanse')
      .eq('channel', 'representatives')
      .not('seminar', 'is', null)
      .gte('sale_date', dateFromIso)
      .lt('sale_date', dateToIso)
      .eq('is_ignored', false)
      .eq('is_excluded', false)
      // ORDER BY sale_date (не id) — фільтр sale_date через idx_sales_sale_date,
      // інакше повний скан id-індексу (крон освіжає id місяця) → timeout.
      .order('sale_date')
      .order('id')
      .range(from, from + PAGE - 1);
    if (res.error || !res.data) {
      throw new Error(`rep-seminars fetch: ${res.error?.message || 'no data'}`);
    }
    const rows = res.data as unknown as Row[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Групуємо (seminar, division) → Set<client_code>.
  // Фільтр: тільки семінари з ELLANSE у назві (в базі є ще Анатомія,
  // Black Sea Beauty тощо — вони не по Ellanse). Ми на дашборді Ellanse,
  // тому інші контексти не цікавлять.
  const buckets = new Map<string, { seminar: string; division: string; seminar_date: string | null; clients: Set<string> }>();
  for (const r of all) {
    if (!r.seminar || !r.division) continue;
    if (!/ELLANSE/i.test(r.seminar)) continue;
    const date = r.seminar_date ?? null;
    // Ключ включає ДАТУ — кожна дата проведення = окрема подія.
    const k = `${r.seminar}||${r.division}||${date ?? ''}`;
    let b = buckets.get(k);
    if (!b) {
      b = { seminar: r.seminar, division: r.division, seminar_date: date, clients: new Set() };
      buckets.set(k, b);
    }
    b.clients.add(r.client_code);
  }

  const result: RepSeminar[] = [];
  for (const b of buckets.values()) {
    result.push({
      seminar: b.seminar,
      division: b.division,
      seminar_date: b.seminar_date,
      unique_clients: b.clients.size,
    });
  }
  // Сортуємо: по division, потім за датою, потім за спаданням клієнтів
  result.sort((a, b) =>
    a.division.localeCompare(b.division)
    || (a.seminar_date ?? '').localeCompare(b.seminar_date ?? '')
    || b.unique_clients - a.unique_clients);
  return result;
}
