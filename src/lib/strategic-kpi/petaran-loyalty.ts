/**
 * PETARAN «Фокуси / програма лояльності» — факт із `sales`.
 *
 * Рахуємо ЗА ОДИН МІСЯЦЬ (тижні М1-М4 по дню місяця). Валідовано на червні 2026
 * (див. memory petaran_loyalty_program). Джерело — наша `sales`, канал
 * representatives. План (цілі) — окрема таблиця petaran_loyalty_targets.
 *
 * Створено 2026-07-06.
 */

import { supabase } from '@/lib/supabase';
import { AsyncCache, periodTouchesCurrentMonth, CURRENT_MONTH_TTL_MS } from './cache-helper';

export interface LoyaltyRow {
  key: string;
  label: string;
  weekly: [number, number, number, number];  // М1 М2 М3 М4
  total: number;
}
export interface PetaranLoyalty {
  month: string;                       // 'YYYY-MM'
  funnel: LoyaltyRow[];                // 4 рядки воронки
  levels: LoyaltyRow[];                // 4 рівні
  factByKey: Record<string, number>;   // місячний факт per indicator_key (для план-vs-факт)
}

interface Row {
  doc_id: string; client_code: string; client_name: string;
  product: string; discount: string | null;
  qty: number; sum_usd: number; sale_date: string;
}

const CACHE = new AsyncCache<PetaranLoyalty>(5 * 60 * 1000, 'petaran-loyalty');

// Тиждень по дню місяця (UTC — 1С-дата зберігається як локальний календарний день).
function weekOf(iso: string): 0 | 1 | 2 | 3 {
  const d = new Date(iso).getUTCDate();
  return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
}
const sum4 = (a: number[]) => a.reduce((x, y) => x + y, 0);

// Воронка: маркер = substring у discount. Ряд7/Ряд24 фізично на рядку-подарунку
// VITARAN Tox Eye (brand=Vitaran), тому тягнемо і petaran-product, і фокус-discount.
const FUNNEL_DEFS: Array<{ key: string; label: string; markers: string[] }> = [
  { key: 'new_99', label: 'Нові $99 · 1-а закупка', markers: [
    'Фокус: Нові Petaran', 'Фокус: Нові (є в базі',
    'Фокус PETARAN -99дол- 1я покупка', 'Фокус: Клиент Эмет,не покупал PETARAN -PETARAN -99дол' ] },
  { key: 'conv_1_2', label: 'Нові Этап 2 · 2уп + Tox Eye', markers: ['Фокус: Нові Этап2'] },
  { key: 'react_conv_1_2', label: 'Спячі · реактивація 2уп + Tox', markers: ['Фокус: Спящие/потеряные -PETARAN 2шт'] },
  { key: 'react_conv_2_3', label: 'Спячі · Этап 2 ($130)', markers: ['Фокус: Спящие/потеряные Этап 2'] },
];
// Маркери що виводять клієнта з розрахунку рівнів (він у воронці).
const FUNNEL_MARKERS_ALL = [
  'Фокус: Нові Petaran', 'Фокус: Нові (є в базі', 'Фокус: Нові Этап2',
  'Фокус: Спящие/потеряные -PETARAN 2шт', 'Фокус: Спящие/потеряные Этап 2',
];

export async function fetchPetaranLoyalty(monthFromIso: string, monthToIso: string): Promise<PetaranLoyalty> {
  const ttl = periodTouchesCurrentMonth(monthToIso) ? CURRENT_MONTH_TTL_MS : undefined;
  return CACHE.getOrLoad(`${monthFromIso}|${monthToIso}`, () => compute(monthFromIso, monthToIso), ttl);
}

async function compute(from: string, to: string): Promise<PetaranLoyalty> {
  // Усі rep-рядки місяця що стосуються PETARAN (product) АБО фокусу (discount).
  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const res = await supabase
      .from('sales')
      .select('doc_id,client_code,client_name,product,discount,qty,sum_usd,sale_date')
      .eq('channel', 'representatives')
      .gte('sale_date', from)
      .lt('sale_date', to)
      .or(['product.ilike.*petaran*', 'discount.ilike.*фокус*'])
      .order('sale_date')
      .range(off, off + 999);
    if (res.error || !res.data) throw new Error(`petaran-loyalty: ${res.error?.message || 'no data'}`);
    const d = res.data as unknown as Row[];
    rows.push(...d);
    if (d.length < 1000) break;
  }

  // ── ВОРОНКА: унік. клієнти, тиждень першої кваліф. покупки ──
  const funnel: LoyaltyRow[] = FUNNEL_DEFS.map(def => {
    const first = new Map<string, string>();
    for (const r of rows) {
      if (r.discount && def.markers.some(m => r.discount!.includes(m))) {
        const cur = first.get(r.client_code);
        if (!cur || r.sale_date < cur) first.set(r.client_code, r.sale_date);
      }
    }
    const w: [number, number, number, number] = [0, 0, 0, 0];
    for (const [, dt] of first) w[weekOf(dt)]++;
    return { key: def.key, label: def.label, weekly: w, total: first.size };
  });

  // Фокусні клієнти → виключаємо з рівнів.
  const funnelClients = new Set<string>();
  for (const r of rows) {
    if (r.discount && FUNNEL_MARKERS_ALL.some(m => r.discount!.includes(m))) funnelClients.add(r.client_code);
  }

  // ── РІВНІ: тільки НЕ-фокусні, product містить PETARAN, після виключень ──
  interface Cli { perDoc: Map<string, number>; events: Array<{ wk: number; qty: number; date: string; doc: string }> }
  const perClient = new Map<string, Cli>();
  for (const r of rows) {
    if (r.sum_usd <= 0.01 || r.qty <= 0) continue;             // подарунки / повернення
    if (r.discount && r.discount.includes('Гонорар')) continue; // флакони лектору
    if (!/petaran/i.test(r.product || '')) continue;
    if (funnelClients.has(r.client_code)) continue;
    let c = perClient.get(r.client_code);
    if (!c) { c = { perDoc: new Map(), events: [] }; perClient.set(r.client_code, c); }
    c.perDoc.set(r.doc_id, (c.perDoc.get(r.doc_id) || 0) + r.qty);
    c.events.push({ wk: weekOf(r.sale_date), qty: r.qty, date: r.sale_date, doc: r.doc_id });
  }
  const lvl: Record<string, [number, number, number, number]> = {
    level_standard: [0, 0, 0, 0], level_bronze: [0, 0, 0, 0], level_silver: [0, 0, 0, 0], level_gold: [0, 0, 0, 0],
  };
  for (const [, c] of perClient) {
    const vals = [...c.perDoc.values()];
    const maxDoc = Math.max(...vals);
    const total = vals.reduce((a, b) => a + b, 0);
    c.events.sort((a, b) => (a.date < b.date ? -1 : 1));
    let key: keyof typeof lvl, wk: number;
    if (maxDoc >= 20) { key = 'level_gold'; const doc = [...c.perDoc].find(([, q]) => q >= 20)![0]; wk = c.events.find(e => e.doc === doc)!.wk; }
    else if (maxDoc >= 10) { key = 'level_silver'; const doc = [...c.perDoc].find(([, q]) => q >= 10)![0]; wk = c.events.find(e => e.doc === doc)!.wk; }
    else if (total >= 5) { key = 'level_bronze'; let cum = 0; wk = 3; for (const e of c.events) { cum += e.qty; if (cum >= 5) { wk = e.wk; break; } } }
    else { key = 'level_standard'; wk = c.events[0].wk; }
    lvl[key][wk]++;
  }
  const levels: LoyaltyRow[] = [
    { key: 'level_standard', label: 'Стандарт (активні)', weekly: lvl.level_standard, total: sum4(lvl.level_standard) },
    { key: 'level_bronze', label: 'Бронза (5+ фл)', weekly: lvl.level_bronze, total: sum4(lvl.level_bronze) },
    { key: 'level_silver', label: 'Срібло (10+ фл)', weekly: lvl.level_silver, total: sum4(lvl.level_silver) },
    { key: 'level_gold', label: 'Золото (20+ фл)', weekly: lvl.level_gold, total: sum4(lvl.level_gold) },
  ];

  const factByKey: Record<string, number> = {};
  for (const r of [...funnel, ...levels]) factByKey[r.key] = r.total;

  return { month: from.slice(0, 7), funnel, levels, factByKey };
}
