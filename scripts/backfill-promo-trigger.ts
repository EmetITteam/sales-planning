/**
 * Backfill sales.promo_trigger_brand для існуючих ПОДАРУНКОВИХ рядків.
 *
 * Тригер залежить лише від тексту поводу → рахуємо один раз per унікальний
 * повод і PATCH-имо всі gift-рядки з цим поводом (кілька десятків запитів,
 * не рядок-за-рядком). Використовує канонічний класифікатор (single source).
 *
 * Запуск: npx tsx scripts/backfill-promo-trigger.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectPromoTriggerBrand } from '../src/lib/strategic-kpi/sales-classifier.ts';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

async function main() {
  // 1) Всі унікальні поводи подарункових рядків (по всій історії).
  const discounts = new Set<string>();
  let from = 0;
  for (;;) {
    const r = await fetch(`${U}/rest/v1/sales?select=discount&is_gift=eq.true&discount=not.is.null&order=id&limit=1000&offset=${from}`, { headers: H });
    const rows = (await r.json()) as Array<{ discount: string }>;
    for (const x of rows) if (x.discount) discounts.add(x.discount);
    if (rows.length < 1000) break;
    from += 1000;
  }
  console.log(`Унікальних подарункових поводів: ${discounts.size}`);

  // 2) Для кожного — тригер, і PATCH усіх рядків з цим поводом.
  let withTrigger = 0, updatedRows = 0, noTrigger = 0;
  for (const disc of discounts) {
    const trigger = detectPromoTriggerBrand(disc);
    if (!trigger) { noTrigger++; continue; }
    const url = `${U}/rest/v1/sales?is_gift=eq.true&discount=eq.${encodeURIComponent(disc)}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'count=exact,return=minimal' },
      body: JSON.stringify({ promo_trigger_brand: trigger }),
    });
    if (!r.ok) { console.error(`  ❌ "${disc.slice(0, 40)}": ${r.status} ${await r.text()}`); continue; }
    const cr = r.headers.get('content-range') || '';
    const n = parseInt(cr.split('/')[1] || '0', 10);
    updatedRows += n;
    withTrigger++;
    if (n > 0) console.log(`  ${trigger.padEnd(10)} ← ${n} рядків · "${disc.slice(0, 50)}"`);
  }
  console.log(`\nГотово: поводів з тригером ${withTrigger}, без тригера ${noTrigger}, оновлено рядків ${updatedRows}`);
}
main().catch(e => { console.error(e); process.exit(1); });
