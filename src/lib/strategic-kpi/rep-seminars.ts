/**
 * Ellanse семінари у представництвах — автоматично зі sales.
 *
 * Кожна унікальна пара (seminar, division) у Ellanse+seminar рядках = 1 семінар.
 * Учасники = COUNT DISTINCT client_code для цієї пари у періоді.
 *
 * Створено 2026-07-02.
 */

import { supabase } from '@/lib/supabase';

export interface RepSeminar {
  seminar: string;
  division: string;         // Місто (Київ, Одеса, Дніпро, ...)
  unique_clients: number;
}

interface Row {
  division: string;
  seminar: string;
  client_code: string;
}

const CACHE = new Map<string, { at: number; data: RepSeminar[] }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Тягне усі Ellanse-семінарські рядки у представництвах за період.
 * Групує по (seminar, division), рахує унікальних клієнтів.
 */
export async function fetchEllanseRepSeminars(
  dateFromIso: string,
  dateToIso: string,
): Promise<RepSeminar[]> {
  const key = `${dateFromIso}|${dateToIso}`;
  const c = CACHE.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.data;

  const all: Row[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const res = await supabase
      .from('sales')
      .select('division,seminar,client_code')
      .eq('brand', 'Ellanse')
      .eq('channel', 'representatives')
      .not('seminar', 'is', null)
      .gte('sale_date', dateFromIso)
      .lt('sale_date', dateToIso)
      .eq('is_ignored', false)
      .eq('is_excluded', false)
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
  const buckets = new Map<string, { seminar: string; division: string; clients: Set<string> }>();
  for (const r of all) {
    if (!r.seminar || !r.division) continue;
    if (!/ELLANSE/i.test(r.seminar)) continue;
    const k = `${r.seminar}||${r.division}`;
    let b = buckets.get(k);
    if (!b) {
      b = { seminar: r.seminar, division: r.division, clients: new Set() };
      buckets.set(k, b);
    }
    b.clients.add(r.client_code);
  }

  const result: RepSeminar[] = [];
  for (const b of buckets.values()) {
    result.push({
      seminar: b.seminar,
      division: b.division,
      unique_clients: b.clients.size,
    });
  }
  // Сортуємо: спочатку по division, потім за спаданням клієнтів
  result.sort((a, b) => a.division.localeCompare(b.division) || b.unique_clients - a.unique_clients);
  CACHE.set(key, { at: Date.now(), data: result });
  return result;
}
