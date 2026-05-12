// M8 REFINED DRY-RUN (Variant C): soft-delete з захистом ETAP-рядків.
// НІЧОГО не змінює у БД — лише показує що було б архівовано.
//
// Алгоритм:
//   для кожного (user_id, segment_code, period_id=20260531):
//     latest_ts = MAX(updated_at)
//     window = [latest_ts - 1 hour, latest_ts]
//
//     для рядків ВНУТРИ window → KEEP (latest batch)
//     для рядків ПОЗА window:
//       - має edit marker (stage / comment / manually_added / completed /
//         stage_done / training_id / deadline) → PRESERVE (не архівувати)
//       - ВСІ markers порожні → ARCHIVE (soft-delete)

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

const WINDOW_MS = 60 * 60 * 1000;
const isStr = v => typeof v === 'string' && v.trim().length > 0;

// Має edit marker = була свідома правка менеджера
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

console.log('━━━ M8 REFINED DRY-RUN (Variant C: ETAP-protect) ━━━\n');

const forecasts = await fetchAll('forecasts', 'select=id,user_id,segment_code,client_id_1c,client_name,forecast_amount,stage,stage_comment,manually_added,completed,stage_done,training_id,updated_at&period_id=eq.20260531');
const gaps = await fetchAll('gap_closures', 'select=id,user_id,segment_code,client_id_1c,client_name,potential_amount,stage,stage_comment,manually_added,closure_completed,stage_done,deadline,training_id,updated_at&period_id=eq.20260531');

const users = await fetchAll('users', 'select=login,full_name,region');
const userMeta = new Map(users.map(u => [u.login, u]));

const groups = new Map();
function getGroup(user, seg) {
  const k = `${user}|${seg}`;
  if (!groups.has(k)) groups.set(k, { user, seg, f: [], g: [] });
  return groups.get(k);
}
for (const r of forecasts) getGroup(r.user_id, r.segment_code).f.push(r);
for (const r of gaps) getGroup(r.user_id, r.segment_code).g.push(r);

const affected = [];
for (const [, gr] of groups) {
  const allTs = [...gr.f, ...gr.g].map(r => new Date(r.updated_at).getTime());
  if (allTs.length === 0) continue;
  const maxTs = Math.max(...allTs);
  const cutoff = maxTs - WINDOW_MS;

  const keepF = []; const preservedF = []; const archivedF = [];
  for (const r of gr.f) {
    const inWindow = new Date(r.updated_at).getTime() >= cutoff;
    if (inWindow) keepF.push(r);
    else if (hasEditMarker(r, true)) preservedF.push(r);
    else archivedF.push(r);
  }
  const keepG = []; const preservedG = []; const archivedG = [];
  for (const r of gr.g) {
    const inWindow = new Date(r.updated_at).getTime() >= cutoff;
    if (inWindow) keepG.push(r);
    else if (hasEditMarker(r, false)) preservedG.push(r);
    else archivedG.push(r);
  }

  if (archivedF.length === 0 && archivedG.length === 0) continue;
  affected.push({ user: gr.user, seg: gr.seg, maxTs, keepF, preservedF, archivedF, keepG, preservedG, archivedG });
}
affected.sort((a, b) => (b.archivedF.length + b.archivedG.length) - (a.archivedF.length + a.archivedG.length));

const formatUSD = n => '$' + Math.round(n).toLocaleString('en-US');
const sumF = arr => arr.reduce((s, r) => s + (Number(r.forecast_amount) || 0), 0);
const sumG = arr => arr.reduce((s, r) => s + (Number(r.potential_amount) || 0), 0);

let totalArch = 0, totalArchSum = 0, totalActive = 0, totalActiveSum = 0;

console.log('USER (REGION)'.padEnd(40), 'SEG'.padEnd(10), 'ACTIVE FRC/GAP (Σ)'.padEnd(28), 'ARCHIVE rows (Σ)');
console.log('-'.repeat(110));
for (const a of affected) {
  const meta = userMeta.get(a.user);
  const name = (meta?.full_name || a.user).slice(0, 28);
  const region = (meta?.region || '?').slice(0, 8);
  const userTag = `${name} (${region})`;

  const activeF = a.keepF.length + a.preservedF.length;
  const activeG = a.keepG.length + a.preservedG.length;
  const activeSum = sumF(a.keepF) + sumF(a.preservedF) + sumG(a.keepG) + sumG(a.preservedG);
  const archRows = a.archivedF.length + a.archivedG.length;
  const archSum = sumF(a.archivedF) + sumG(a.archivedG);

  console.log(
    userTag.padEnd(40),
    a.seg.padEnd(10),
    `${activeF}F + ${activeG}G  ${formatUSD(activeSum)}`.padEnd(28),
    `${archRows}  ${formatUSD(archSum)}`,
  );

  totalArch += archRows;
  totalArchSum += archSum;
  totalActive += activeF + activeG;
  totalActiveSum += activeSum;
}
console.log('-'.repeat(110));
console.log();

console.log('━━━ Деталь по 4 «небезпечних» парах де M8-pure хотів все знести ━━━');
console.log();
const dangerous = ['Селіванова', 'Лопушан', 'Бакумова', 'Мігашко'];
for (const a of affected) {
  const meta = userMeta.get(a.user);
  const name = meta?.full_name || a.user;
  if (!dangerous.some(d => name.includes(d))) continue;

  console.log(`▸ ${name} (${meta?.region}) · ${a.seg}`);
  console.log(`  KEEP (latest batch within 1h window):`);
  console.log(`    forecasts: ${a.keepF.length} рядків, Σ=${formatUSD(sumF(a.keepF))}`);
  console.log(`    gap:       ${a.keepG.length} рядків, Σ=${formatUSD(sumG(a.keepG))}`);
  console.log(`  PRESERVE (older АЛЕ з edit marker — НЕ архівуємо):`);
  console.log(`    forecasts: ${a.preservedF.length} рядків, Σ=${formatUSD(sumF(a.preservedF))}`);
  console.log(`    gap:       ${a.preservedG.length} рядків, Σ=${formatUSD(sumG(a.preservedG))}`);
  console.log(`  ARCHIVE (older БЕЗ markers):`);
  console.log(`    forecasts: ${a.archivedF.length} рядків, Σ=${formatUSD(sumF(a.archivedF))}`);
  console.log(`    gap:       ${a.archivedG.length} рядків, Σ=${formatUSD(sumG(a.archivedG))}`);
  console.log(`  ► RESULT: ${a.keepF.length + a.preservedF.length} forecast + ${a.keepG.length + a.preservedG.length} gap (Σ=${formatUSD(sumF(a.keepF) + sumF(a.preservedF) + sumG(a.keepG) + sumG(a.preservedG))})`);
  console.log();
}

console.log('═══════ ПІДСУМОК Variant C ═══════');
console.log(`Зачеплено пар: ${affected.length}`);
console.log(`ARCHIVE: ${totalArch} рядків, Σ=${formatUSD(totalArchSum)}`);
console.log(`Лишається активних у зачеплених парах: ${totalActive} рядків, Σ=${formatUSD(totalActiveSum)}`);
console.log();
console.log('Якщо OK — наступний крок: SQL migration + apply script.');
