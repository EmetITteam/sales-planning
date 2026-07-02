/**
 * Промо-акції: топ-N за унікальними клієнтами per бренд × канал × місяць.
 *
 * Логіка з analytics-june-final.py:
 *   - Беремо raw rows з поводом скидки (включно з is_gift=true — акції що
 *     переносять gift на бренд-тригер, як «Vitaran 700$ + Подарок Marine Collagen»)
 *   - Виключаємо non-promo (Реклама/ДР/Гонорар — це is_excluded=true)
 *   - Виключаємо Амбассадор+free (is_excluded=true)
 *   - Виключаємо is_ignored (розхідники не мають промо)
 *   - Trigger brand = детект з тексту поводу («частина до Подарок»)
 *   - Показуємо у блоці trigger brand (не gift_brand)
 */

import { supabase } from '@/lib/supabase';
import type { StrategicBrand, StrategicChannel } from './brands';

export interface Promo {
  name: string;
  brand: StrategicBrand | 'НЕ_МАПНУТО';
  channel: StrategicChannel;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  is_gift: boolean;
  gift_brand: string | null;
}

interface PromoRow {
  discount: string;
  brand: string;
  channel: string;
  client_code: string;
  qty: number;
  sum_usd: number;
  is_gift: boolean;
  gift_brand: string | null;
}

// ============================================================================
// Brand detection на тексті поводу — той самий набір що у backfill/scripts
// ============================================================================
const BRAND_RULES: [StrategicBrand | 'НЕ_МАПНУТО', RegExp][] = [
  ['Neuronox',   /Neuronox|Ботулотоксин/i],
  ['Petaran',    /PETARAN/i],
  ['Ellanse',    /ELLANSE/i],
  ['Vitaran',    /HP\s*CELL\s*VITARAN|VITARAN\s*(?:i\b|Tox|Whitening|Cosm|а\s*ассор)/i],
  ['EXOXE',      /\bEXOXE\b(?!-)/i],
  ['Neuramis',   /NEURAMIS/i],
  ['IUSE SB',    /IUSE.*Skin\s*Booster|Skin\s*Booster/i],
  ['IUSE hair',  /IUSE.*(?:hair|волос)|IUSE\s+H\b/i],
  ['IUSE Coll.', /IUSE.*Collagen|Marine\s*Collagen|Collagen/i],
  ['ESSE',       /\.?ESSE\b|C5\.ESSE|SkinTrial|Skin\s*Trial|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set|Bakuchiol|Biome|Concealer|tube|Sensitive)/i],
  ['БАД',        /MAGNOX|Дієтична\s*добавк|Диетическая\s*добавк|БАД/i],
];

function detectPromoTriggerBrand(discount: string): StrategicBrand | 'НЕ_МАПНУТО' | null {
  if (!discount) return null;
  const triggerPart = discount.split(/Подар(?:ок|унок)/i)[0];
  for (const [brand, pat] of BRAND_RULES) {
    if (pat.test(triggerPart)) return brand;
  }
  return null;
}

/**
 * Тягне всі рядки з поводом скидки для конкретного місяця.
 * Виключає is_ignored/is_excluded (non-promo). Включає is_gift (потрібне
 * щоб побачити gift-only акції як «Vitaran 700$ + Подарок Marine Collagen»).
 */
async function fetchPromoRows(dateFrom: string, dateTo: string): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const result = await supabase
      .from('sales')
      .select('discount,brand,channel,client_code,qty,sum_usd,is_gift,gift_brand')
      .gte('sale_date', dateFrom)
      .lt('sale_date', dateTo)
      .eq('is_ignored', false)
      .eq('is_excluded', false)
      .not('discount', 'is', null)
      .range(from, from + PAGE - 1);

    if (result.error || !result.data) {
      throw new Error(`promos fetch: ${result.error?.message || 'no data'}`);
    }
    const rows = result.data as unknown as PromoRow[];
    const filtered = rows.filter(r => r.discount && r.discount.length > 0);
    out.push(...filtered);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Групує промо за унікальним текстом поводу. Trigger brand визначається з
 * тексту (якщо не знайдено — беремо brand з рядка).
 */
export async function aggregatePromos(dateFrom: string, dateTo: string): Promise<Promo[]> {
  const rows = await fetchPromoRows(dateFrom, dateTo);

  const promoMap = new Map<string, {
    name: string;
    trigger_brand: string | null;
    channel: string;
    clients: Set<string>;
    qty: number;
    sum: number;
    is_gift_any: boolean;
    gift_brand: string | null;
  }>();

  for (const r of rows) {
    if (!r.discount) continue;
    let triggerBrand: string | null = detectPromoTriggerBrand(r.discount);
    if (!triggerBrand) triggerBrand = r.brand === 'НЕ_МАПНУТО' ? null : r.brand;
    if (!triggerBrand) continue;

    const key = `${r.discount}||${r.channel}`;
    let bucket = promoMap.get(key);
    if (!bucket) {
      bucket = {
        name: r.discount,
        trigger_brand: triggerBrand,
        channel: r.channel,
        clients: new Set(),
        qty: 0,
        sum: 0,
        is_gift_any: false,
        gift_brand: null,
      };
      promoMap.set(key, bucket);
    }
    bucket.clients.add(r.client_code);
    bucket.qty += Number(r.qty);
    bucket.sum += Number(r.sum_usd);
    if (r.is_gift) bucket.is_gift_any = true;
    if (r.gift_brand && !bucket.gift_brand) bucket.gift_brand = r.gift_brand;
  }

  const result: Promo[] = [];
  for (const b of promoMap.values()) {
    result.push({
      name: b.name,
      brand: b.trigger_brand as Promo['brand'],
      channel: b.channel as StrategicChannel,
      unique_clients: b.clients.size,
      total_qty: Math.round(b.qty * 100) / 100,
      total_sum_usd: Math.round(b.sum * 100) / 100,
      is_gift: b.is_gift_any,
      gift_brand: b.gift_brand,
    });
  }
  return result;
}

/**
 * Топ-N промо для конкретного бренду × каналу за клієнтами.
 */
export function topPromosForBrand(
  promos: Promo[],
  brand: StrategicBrand,
  channel: StrategicChannel,
  n = 5,
): Promo[] {
  return promos
    .filter(p => p.brand === brand && p.channel === channel)
    .sort((a, b) => b.unique_clients - a.unique_clients)
    .slice(0, n);
}
