// Cleanup існуючих дублів (клієнт у обох таблицях forecasts + gap_closures
// для одного menager × segment × period).
//
// Виникли через рухомий cutoff у `isRecentBrandPurchase` (Date.now() - 90днів).
// Після фіксу нові дублі не з'являтимуться, але існуючі треба прибрати.
//
// Правило вирішення (по новому fixed cutoff):
//   - Якщо last_buy у вікні [cutoff, planMonthStart) → лишити у forecasts,
//     видалити з gap_closures.
//   - Якщо last_buy ПОЗА вікном (старий клієнт АБО купив у плановому місяці) →
//     лишити у gap_closures, видалити з forecasts.
//
// DRY RUN за замовчуванням — нічого не змінює, тільки виводить план.
// Для реального видалення: DRY_RUN=0 node scripts/cleanup-duplicates.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PERIOD_ID = parseInt(process.env.PERIOD_ID || '20260531', 10);
const PLAN_MONTH = process.env.PLAN_MONTH || '2026-05';
const DRY_RUN = process.env.DRY_RUN !== '0'; // default = dry-run

if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const SBH = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Inline копія isActiveForBrand з src/lib/three-month-rule.ts
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
function getPlanMonthStartMs(planMonth) {
  const ym = String(planMonth).slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
}
function isActiveForBrand(lastPurchaseDate, planMonth) {
  if (!lastPurchaseDate) return false;
  const [y, m, d] = String(lastPurchaseDate).split('-').map(Number);
  if (!y || !m || !d) return false;
  const lastBuyMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const planMonthStartMs = getPlanMonthStartMs(planMonth);
  const cutoffMs = planMonthStartMs - THREE_MONTHS_MS;
  return lastBuyMs >= cutoffMs && lastBuyMs < planMonthStartMs;
}

async function fetchAll(table, fields = 'user_id,segment_code,client_id_1c,client_name,id') {
  const out = [];
  // planning_snapshots не має archived_at колонки — додаємо фільтр лише для
  // forecasts/gap_closures.
  const extraFilter = table === 'planning_snapshots' ? '' : '&archived_at=is.null';
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${URL}/rest/v1/${table}?select=${fields}&period_id=eq.${PERIOD_ID}${extraFilter}`,
      { headers: { ...SBH, Range: `${from}-${from + 999}` } },
    );
    const rows = await r.json();
    if (!Array.isArray(rows)) {
      console.error(`fetch ${table} failed:`, rows);
      process.exit(1);
    }
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

console.log(`\n━━━ Cleanup forecast↔gap дублів ━━━`);
console.log(`PERIOD_ID = ${PERIOD_ID}, PLAN_MONTH = ${PLAN_MONTH}, DRY_RUN = ${DRY_RUN}`);

const [forecasts, gaps] = await Promise.all([
  fetchAll('forecasts', 'id,user_id,segment_code,client_id_1c,client_name'),
  fetchAll('gap_closures', 'id,user_id,segment_code,client_id_1c,client_name'),
]);
console.log(`  forecasts: ${forecasts.length}, gap_closures: ${gaps.length}`);

// Knit clients_for_planning (lastPurchaseDate) недоступна напряму без 1С-виклику.
// Замість того використовуємо planning_snapshots — там зберіглась last_purchase_date
// яку 1С повернула на момент snapshot. Це більш-менш достовірне джерело правди
// бо menager міг сам встановити дату через manual add — але це edge case.
const snapsArr = await fetchAll('planning_snapshots', 'user_id,segment_code,client_id_1c,last_purchase_date');
const snapByKey = new Map();
for (const s of snapsArr) {
  const k = `${s.user_id}|${s.segment_code}|${s.client_id_1c}`;
  // Якщо є кілька snapshot записів (block_type=forecast + block_type=gap) —
  // беремо найсвіжішу дату (max).
  const prev = snapByKey.get(k);
  if (!prev || (s.last_purchase_date && s.last_purchase_date > prev)) {
    snapByKey.set(k, s.last_purchase_date);
  }
}
console.log(`  snapshots з last_purchase_date: ${snapByKey.size} ключів`);

// Знаходимо дублі (одна пара (user_id, segment_code, client_id_1c) у обох таблицях)
const fKeys = new Map(); // key → forecast row
for (const f of forecasts) fKeys.set(`${f.user_id}|${f.segment_code}|${f.client_id_1c}`, f);
const dups = [];
for (const g of gaps) {
  const k = `${g.user_id}|${g.segment_code}|${g.client_id_1c}`;
  const f = fKeys.get(k);
  if (f) {
    const lastBuy = snapByKey.get(k);
    const active = isActiveForBrand(lastBuy, PLAN_MONTH);
    dups.push({
      key: k,
      forecastId: f.id,
      gapId: g.id,
      clientName: g.client_name || f.client_name,
      lastPurchaseDate: lastBuy || null,
      decision: active ? 'keep_forecast_delete_gap' : 'keep_gap_delete_forecast',
    });
  }
}

console.log(`\n━━━ Знайдено ${dups.length} дублів ━━━\n`);
if (dups.length === 0) {
  console.log('Усе чисто, нема чого видаляти.');
  process.exit(0);
}

console.log('Логін                       │ Сегмент    │ Клієнт                       │ Last buy   │ Рішення');
console.log('────────────────────────────┼────────────┼──────────────────────────────┼────────────┼─────────────────────');
for (const d of dups) {
  const [login, seg] = d.key.split('|');
  console.log(`${login.padEnd(28)}│ ${seg.padEnd(10)} │ ${(d.clientName || '?').slice(0, 28).padEnd(28)} │ ${(d.lastPurchaseDate || 'n/a').padEnd(10)} │ ${d.decision}`);
}

const toDeleteForecast = dups.filter(d => d.decision === 'keep_gap_delete_forecast').map(d => d.forecastId);
const toDeleteGap = dups.filter(d => d.decision === 'keep_forecast_delete_gap').map(d => d.gapId);

console.log(`\n━━━ Підсумок ━━━`);
console.log(`  Видалити з forecasts: ${toDeleteForecast.length} рядків`);
console.log(`  Видалити з gap_closures: ${toDeleteGap.length} рядків`);

if (DRY_RUN) {
  console.log(`\n⚠️  DRY RUN — нічого не змінено. Перезапуск з DRY_RUN=0 для реального видалення.`);
  process.exit(0);
}

console.log(`\n━━━ Виконання DELETE ━━━`);
async function deleteIds(table, ids) {
  if (ids.length === 0) return 0;
  // Soft-delete: ставимо archived_at = NOW() (відповідно до M8 архітектури).
  const r = await fetch(`${URL}/rest/v1/${table}?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    console.error(`❌ ${table} archive failed: ${r.status} ${await r.text()}`);
    return 0;
  }
  const updated = await r.json();
  return updated.length;
}

const fDeleted = await deleteIds('forecasts', toDeleteForecast);
console.log(`  ✓ forecasts archived: ${fDeleted}`);
const gDeleted = await deleteIds('gap_closures', toDeleteGap);
console.log(`  ✓ gap_closures archived: ${gDeleted}`);
console.log(`\n✅ Cleanup complete.`);
