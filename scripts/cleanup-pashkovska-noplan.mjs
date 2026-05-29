/**
 * Cleanup для Пашковської (rm.odessa@emet.in.ua):
 * виставити forecast_amount/potential_amount = 0 для всіх клієнтів у поточному
 * місяці де менеджер НЕ виставив stage (тобто свідомо лишила «не куплю» але
 * залишила у списку планування).
 *
 * Дві фази:
 *   --dry  → лише SELECT, показує counts/per-segment/samples (default)
 *   --apply → PATCH (UPDATE forecast_amount=0 / potential_amount=0)
 *
 * Запуск:
 *   node scripts/cleanup-pashkovska-noplan.mjs            # dry-run
 *   node scripts/cleanup-pashkovska-noplan.mjs --apply    # реальний UPDATE
 *
 * ⚠️ Перед --apply: ОБОВ'ЯЗКОВО зробити backup
 *   node scripts/backup-supabase.mjs
 */

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
const SBURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const APPLY = process.argv.includes('--apply');
const LOGIN = 'rm.odessa@emet.in.ua';

// Поточний місяць → monthly pid = останній день місяця у форматі YYYYMMDD.
// Травень 2026 → 20260531.
const now = new Date();
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const PID = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`, 10);

console.log(`\n=== Pashkovska cleanup ${APPLY ? '🔴 APPLY' : '🟡 DRY-RUN'} ===`);
console.log(`Login: ${LOGIN}`);
console.log(`Period: ${PID} (current month)`);
console.log('Critеria: stage IS NULL OR stage = ""\n');

/** SELECT rows for one table where stage is empty/null. */
async function selectNoStage(table, amountCol) {
  // PostgREST OR: ?or=(stage.is.null,stage.eq.)
  const url = `${SBURL}/rest/v1/${table}`
    + `?select=id,segment_code,client_id_1c,client_name,${amountCol},stage`
    + `&user_id=eq.${encodeURIComponent(LOGIN)}`
    + `&period_id=eq.${PID}`
    + `&or=(stage.is.null,stage.eq.)`
    + `&order=segment_code.asc,client_name.asc`;
  const r = await fetch(url, { headers: { ...H, Range: '0-9999' } });
  if (!r.ok) {
    console.error(`${table} fetch failed: ${r.status} ${await r.text()}`);
    return [];
  }
  return await r.json();
}

const forecasts = await selectNoStage('forecasts', 'forecast_amount');
const gaps = await selectNoStage('gap_closures', 'potential_amount');

/** Розкласти per segment з агрегатами. */
function summarize(rows, amountCol, blockName) {
  const bySeg = {};
  for (const r of rows) {
    const seg = r.segment_code;
    if (!bySeg[seg]) bySeg[seg] = { count: 0, sumAmount: 0, withAmount: 0, samples: [] };
    bySeg[seg].count++;
    const amt = Number(r[amountCol] || 0);
    bySeg[seg].sumAmount += amt;
    if (amt > 0) bySeg[seg].withAmount++;
    if (bySeg[seg].samples.length < 3) {
      bySeg[seg].samples.push(`${r.client_name} ($${amt.toFixed(2)})`);
    }
  }
  console.log(`\n--- ${blockName} ---`);
  console.log(`Total rows without stage: ${rows.length}`);
  console.log(`Total Σ ${amountCol} that buде обнулено: $${rows.reduce((s, r) => s + Number(r[amountCol] || 0), 0).toFixed(2)}`);
  console.log(`\nBy segment:`);
  for (const [seg, s] of Object.entries(bySeg).sort()) {
    console.log(`  ${seg.padEnd(12)} → ${String(s.count).padStart(3)} rows · ${String(s.withAmount).padStart(3)} з ненульовою сумою · Σ=$${s.sumAmount.toFixed(2)}`);
    for (const sample of s.samples) console.log(`      • ${sample}`);
  }
}

summarize(forecasts, 'forecast_amount', 'forecasts (block "Прогноз")');
summarize(gaps, 'potential_amount', 'gap_closures (block "Закриття розриву")');

const totalRows = forecasts.length + gaps.length;
const totalSum = forecasts.reduce((s, r) => s + Number(r.forecast_amount || 0), 0)
               + gaps.reduce((s, r) => s + Number(r.potential_amount || 0), 0);

console.log(`\n=== Summary ===`);
console.log(`Total rows: ${totalRows} (forecasts: ${forecasts.length}, gaps: ${gaps.length})`);
console.log(`Total amount which буде обнулено: $${totalSum.toFixed(2)}`);

if (!APPLY) {
  console.log('\n🟡 DRY-RUN — нічого не змінено. Для апплаю запусти з --apply.');
  process.exit(0);
}

console.log('\n🔴 APPLY — починаю PATCH...');

/** PATCH amount=0 для всіх id у списку (по 50 за запит). */
async function patchZero(table, ids, amountCol) {
  if (ids.length === 0) return { ok: 0, fail: 0 };
  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const idsParam = `id=in.(${chunk.join(',')})`;
    const url = `${SBURL}/rest/v1/${table}?${idsParam}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ [amountCol]: 0 }),
    });
    if (r.ok) ok += chunk.length;
    else {
      fail += chunk.length;
      console.error(`  PATCH ${table} ids[${i}..${i+50}] failed: ${r.status} ${await r.text()}`);
    }
  }
  return { ok, fail };
}

const fRes = await patchZero('forecasts', forecasts.map(r => r.id), 'forecast_amount');
const gRes = await patchZero('gap_closures', gaps.map(r => r.id), 'potential_amount');

console.log(`\n✅ forecasts: ${fRes.ok} updated, ${fRes.fail} failed`);
console.log(`✅ gap_closures: ${gRes.ok} updated, ${gRes.fail} failed`);
console.log('\nDone. Скажи Пашковській оновити сторінку — побачить що «Заплановано» поменшало.');
