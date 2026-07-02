/**
 * «Впервые обученные» — унікальні клієнти для яких у певному місяці/YTD
 * була ПЕРША в історії ELLANSE-семінарська покупка (bacнше не було).
 *
 * Правило (ITD 2026-07-02):
 *   - Скануємо всі sales з brand='Ellanse' та seminar IS NOT NULL/NOT ''
 *   - Для кожного клієнта беремо min(sale_date) — це його FIRST-TRAINED дата
 *   - Клієнт «уперше обучен у місяці M» = firstTrainedDate ∈ M
 *   - YTD «уперше обучено за рік Y» = унік клієнти з firstTrainedDate у Y
 *
 * Використовує повний історичний зріз sales (з 2022+) щоб не рахувати
 * повторно тих хто «уперше навчався» у 2023 але купує знову у 2026.
 */

import { supabase } from '@/lib/supabase';
import { AsyncCache } from './cache-helper';

interface EllanseSeminarRow {
  client_code: string;
  sale_date: string;
}

// AsyncCache: single-key бо buildFirstTrainedMap не має параметрів. 10-хв TTL
// бо dataset важкий (5-10K рядків). Dedup гарантує що при cold start двом
// одночасним запитам ми НЕ тягнемо все двічі.
const FT_CACHE = new AsyncCache<Map<string, Date>>(10 * 60 * 1000, 'first-trained');

export async function buildFirstTrainedMap(): Promise<Map<string, Date>> {
  return FT_CACHE.getOrLoad('__singleton__', () => doBuildFirstTrainedMap());
}

async function doBuildFirstTrainedMap(): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  let from = 0;
  const PAGE = 1000;

  while (true) {
    // ⚠ ФІЛЬТРИ (audit 2026-07-02, Agent 1):
    //   is_gift=false      — клієнт що ТІЛЬКИ отримав Ellanse-семінар як подарунок
    //                        НЕ є «навченим клієнтом». Не рахуємо.
    //   is_ignored=false   — розхідники / сервісні рядки.
    //   is_excluded=false  — реклама / ДР / гонорар — теж не рахуємо.
    // Раніше ці фільтри були відсутні → «уперше навчений» рахував подарункові
    // семінари, що завищувало метрику.
    const result = await supabase
      .from('sales')
      .select('client_code,sale_date')
      .eq('brand', 'Ellanse')
      .not('seminar', 'is', null)
      .eq('is_gift', false)
      .eq('is_ignored', false)
      .eq('is_excluded', false)
      .order('id')
      .range(from, from + PAGE - 1);

    if (result.error || !result.data) {
      throw new Error(`first-trained fetch: ${result.error?.message || 'no data'}`);
    }
    const rows = result.data as unknown as EllanseSeminarRow[];
    for (const r of rows) {
      // ігноруємо порожні seminar (записи де це поле = '')
      if (!r.client_code || !r.sale_date) continue;
      const d = new Date(r.sale_date);
      const cur = map.get(r.client_code);
      if (!cur || d < cur) map.set(r.client_code, d);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/**
 * Скільки клієнтів «уперше обучилось» у діапазоні [from, to).
 */
export function countFirstTrainedInRange(
  map: Map<string, Date>,
  from: Date,
  to: Date,
): number {
  let count = 0;
  for (const d of map.values()) {
    if (d >= from && d < to) count++;
  }
  return count;
}
