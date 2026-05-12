// M8 APPLY (Variant C): soft-delete via PATCH archived_at = NOW().
//
// Без --confirm: preview-режим (як refined dry-run), нічого не змінює.
// З --confirm: реально PATCH-ить archived_at для рядків що задовольняють критерій.
//
// Критерій soft-delete (одночасно):
//   - updated_at < MAX(updated_at для цієї user+segment+period_id=20260531) - 1h
//   - І ВСІ edit-markers порожні:
//     - stage IS NULL / ''
//     - stage_comment IS NULL / ''
//     - manually_added != true
//     - completed != true (forecast) / closure_completed != true (gap)
//     - stage_done != true
//     - training_id IS NULL
//     - deadline IS NULL / '' (gap only)

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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const CONFIRM = process.argv.includes('--confirm');
const WINDOW_MS = 60 * 60 * 1000;

async function fetchAll(table, query) {
  const out = []; let from = 0; const PAGE = 1000;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/${table}?${query}&limit=${PAGE}&offset=${from}`, { headers: H });
    if (!r.ok) throw new Error(`${table} fetch ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
    from += PAGE;
  }
}

async function patchArchive(table, ids, timestamp) {
  if (ids.length === 0) return;
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH).join(',');
    const url = `${URL}/rest/v1/${table}?id=in.(${slice})`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ archived_at: timestamp }),
    });
    if (!r.ok) throw new Error(`${table} PATCH ${r.status}: ${await r.text()}`);
  }
}

const isStr = v => typeof v === 'string' && v.trim().length > 0;

function hasEditMarker(row, isForecast) {
  if (isStr(row.stage)) return true;
  if (isStr(row.stage_comment)) return true;
  if (row.manually_added === true) return true;
  if (row.stage_done === true) return true;
  if (row.training_id) return true;
  if (isForecast) {
    if (row.completed === true) return true;
  } else {
    if (row.closure_completed === true) return true;
    if (isStr(row.deadline)) return true;
  }
  return false;
}

console.log(`━━━ M8 APPLY ${CONFIRM ? '(REAL — буде PATCH archived_at)' : '(PREVIEW — без змін)'} ━━━\n`);

// Беремо ТІЛЬКИ active рядки (на випадок повторного запуску — щоб ne re-archive).
const forecasts = await fetchAll('forecasts',
  'select=id,user_id,segment_code,client_id_1c,client_name,forecast_amount,stage,stage_comment,manually_added,completed,stage_done,training_id,updated_at,archived_at&period_id=eq.20260531&archived_at=is.null');
const gaps = await fetchAll('gap_closures',
  'select=id,user_id,segment_code,client_id_1c,client_name,potential_amount,stage,stage_comment,manually_added,closure_completed,stage_done,deadline,training_id,updated_at,archived_at&period_id=eq.20260531&archived_at=is.null');

const groups = new Map();
function getGroup(user, seg) {
  const k = `${user}|${seg}`;
  if (!groups.has(k)) groups.set(k, { user, seg, f: [], g: [] });
  return groups.get(k);
}
for (const r of forecasts) getGroup(r.user_id, r.segment_code).f.push(r);
for (const r of gaps) getGroup(r.user_id, r.segment_code).g.push(r);

const toArchiveF = [];
const toArchiveG = [];
const stats = [];

for (const [, gr] of groups) {
  const allTs = [...gr.f, ...gr.g].map(r => new Date(r.updated_at).getTime());
  if (allTs.length === 0) continue;
  const maxTs = Math.max(...allTs);
  const cutoff = maxTs - WINDOW_MS;

  let keepF = 0, preservedF = 0, archivedF = 0;
  let keepG = 0, preservedG = 0, archivedG = 0;
  let sumArchF = 0, sumArchG = 0;

  for (const r of gr.f) {
    const inWindow = new Date(r.updated_at).getTime() >= cutoff;
    if (inWindow) keepF++;
    else if (hasEditMarker(r, true)) preservedF++;
    else { archivedF++; sumArchF += Number(r.forecast_amount) || 0; toArchiveF.push(r.id); }
  }
  for (const r of gr.g) {
    const inWindow = new Date(r.updated_at).getTime() >= cutoff;
    if (inWindow) keepG++;
    else if (hasEditMarker(r, false)) preservedG++;
    else { archivedG++; sumArchG += Number(r.potential_amount) || 0; toArchiveG.push(r.id); }
  }

  if (archivedF === 0 && archivedG === 0) continue;
  stats.push({ user: gr.user, seg: gr.seg, keepF, preservedF, archivedF, keepG, preservedG, archivedG, sumArch: sumArchF + sumArchG });
}

const users = await fetchAll('users', 'select=login,full_name,region');
const userMeta = new Map(users.map(u => [u.login, u]));

const formatUSD = n => '$' + Math.round(n).toLocaleString('en-US');

console.log('USER (REGION)'.padEnd(40), 'SEG'.padEnd(10), 'KEEP/PRESERVE/ARCHIVE'.padEnd(35), 'Σ archive');
console.log('-'.repeat(110));
for (const s of stats) {
  const meta = userMeta.get(s.user);
  const name = (meta?.full_name || s.user).slice(0, 28);
  const region = (meta?.region || '?').slice(0, 8);
  console.log(
    `${name} (${region})`.padEnd(40),
    s.seg.padEnd(10),
    `K:${s.keepF}F+${s.keepG}G P:${s.preservedF}F+${s.preservedG}G A:${s.archivedF}F+${s.archivedG}G`.padEnd(35),
    formatUSD(s.sumArch),
  );
}
console.log('-'.repeat(110));

const totalF = toArchiveF.length;
const totalG = toArchiveG.length;
const totalSum = stats.reduce((s, x) => s + x.sumArch, 0);
console.log();
console.log(`ARCHIVE TOTAL: ${totalF + totalG} рядків (${totalF}F + ${totalG}G)  Σ=${formatUSD(totalSum)}`);
console.log(`Зачеплено пар: ${stats.length}`);
console.log();

if (!CONFIRM) {
  console.log('▸ PREVIEW лише. Для реального archive: node scripts/m8-apply.mjs --confirm');
  process.exit(0);
}

// CONFIRMED — PATCH archived_at
const ts = new Date().toISOString();
console.log(`▸ PATCH archived_at='${ts}' для ${totalF + totalG} рядків...`);
await patchArchive('forecasts', toArchiveF, ts);
console.log(`  ✓ forecasts: ${totalF} рядків заархівовано`);
await patchArchive('gap_closures', toArchiveG, ts);
console.log(`  ✓ gap_closures: ${totalG} рядків заархівовано`);
console.log();
console.log('✅ M8 cleanup ЗАВЕРШЕНО.');
console.log(`Backup: backups/2026-05-12T15-31-08Z/ (для відкату)`);
console.log(`Rollback: UPDATE forecasts/gap_closures SET archived_at = NULL WHERE archived_at = '${ts}';`);
