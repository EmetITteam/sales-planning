// M8 DRY-RUN: показати які рядки видалить cleanup, без жодних змін у БД.
//
// Алгоритм:
//   для кожного (user_id, segment_code, period_id=20260531):
//     latest_ts = MAX(updated_at) серед forecasts + gap_closures
//     window = [latest_ts - 1 hour, latest_ts]
//     KEEP рядки у вікні. DELETE решту.
//
// Виводить:
//   - таблицю кожної (user, segment) пари
//   - для кожного рядка: status, updated_at, sum, client_name, stage
//   - sanity-check: 0 overlap у client_ids між KEEP та DELETE
//   - підсумок: загалом скільки рядків видалить, на яку суму

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

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

console.log('━━━ M8 DRY-RUN — НІЧОГО не видаляється у БД ━━━\n');

const forecasts = await fetchAll('forecasts', 'select=id,user_id,segment_code,client_id_1c,client_name,forecast_amount,stage,stage_comment,manually_added,completed,training_id,updated_at&period_id=eq.20260531');
const gaps = await fetchAll('gap_closures', 'select=id,user_id,segment_code,client_id_1c,client_name,potential_amount,stage,stage_comment,manually_added,closure_completed,deadline,training_id,updated_at&period_id=eq.20260531');

const users = await fetchAll('users', 'select=login,full_name,region');
const userMeta = new Map(users.map(u => [u.login, u]));

// Group by (user, segment)
const groups = new Map();
function getGroup(user, seg) {
  const k = `${user}|${seg}`;
  if (!groups.has(k)) groups.set(k, { user, seg, f: [], g: [] });
  return groups.get(k);
}
for (const r of forecasts) getGroup(r.user_id, r.segment_code).f.push(r);
for (const r of gaps) getGroup(r.user_id, r.segment_code).g.push(r);

// Affected: where some rows fall outside latest window
const affected = [];
for (const [, gr] of groups) {
  const allTs = [...gr.f, ...gr.g].map(r => new Date(r.updated_at).getTime());
  if (allTs.length === 0) continue;
  const maxTs = Math.max(...allTs);
  const cutoff = maxTs - WINDOW_MS;
  const keepF = gr.f.filter(r => new Date(r.updated_at).getTime() >= cutoff);
  const delF = gr.f.filter(r => new Date(r.updated_at).getTime() < cutoff);
  const keepG = gr.g.filter(r => new Date(r.updated_at).getTime() >= cutoff);
  const delG = gr.g.filter(r => new Date(r.updated_at).getTime() < cutoff);
  if (delF.length === 0 && delG.length === 0) continue;
  affected.push({ user: gr.user, seg: gr.seg, maxTs, cutoff, keepF, delF, keepG, delG });
}
affected.sort((a, b) => (b.delF.length + b.delG.length) - (a.delF.length + a.delG.length));

let totalDelF = 0, totalDelG = 0, totalDelSum = 0, totalKeepRows = 0, totalKeepSum = 0;
let anyOverlap = false;
const formatTs = ts => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
const formatUSD = n => '$' + Math.round(n).toLocaleString('en-US');

for (const a of affected) {
  const meta = userMeta.get(a.user);
  const name = meta?.full_name || a.user;
  const region = meta?.region || '?';

  // Overlap check
  const keepIds = new Set([...a.keepF, ...a.keepG].map(r => r.client_id_1c));
  const delIds = new Set([...a.delF, ...a.delG].map(r => r.client_id_1c));
  const overlap = [...delIds].filter(id => keepIds.has(id));
  if (overlap.length > 0) anyOverlap = true;

  const delSumF = a.delF.reduce((s, r) => s + (Number(r.forecast_amount) || 0), 0);
  const delSumG = a.delG.reduce((s, r) => s + (Number(r.potential_amount) || 0), 0);
  const keepSumF = a.keepF.reduce((s, r) => s + (Number(r.forecast_amount) || 0), 0);
  const keepSumG = a.keepG.reduce((s, r) => s + (Number(r.potential_amount) || 0), 0);

  console.log(`━━━ ${name} · ${region} · ${a.seg} ━━━`);
  console.log(`   latest_save = ${formatTs(a.maxTs)}    window cutoff = ${formatTs(a.cutoff)}`);
  console.log(`   KEEP: ${a.keepF.length} forecast + ${a.keepG.length} gap  =  ${a.keepF.length + a.keepG.length} рядків · Σ=${formatUSD(keepSumF + keepSumG)}`);
  console.log(`   DELETE: ${a.delF.length} forecast + ${a.delG.length} gap  =  ${a.delF.length + a.delG.length} рядків · Σ=${formatUSD(delSumF + delSumG)}`);
  console.log(`   Overlap (client_id deleted ∩ kept): ${overlap.length === 0 ? '✓ ZERO' : '⚠ ' + overlap.length + ' clients'}`);

  // Show what would be kept (latest batch — manager's intent)
  if (a.keepF.length + a.keepG.length > 0) {
    console.log(`   ── KEEP ──`);
    const all = [...a.keepF.map(r => ({ ...r, _b: 'F', _amt: Number(r.forecast_amount) || 0 })),
                 ...a.keepG.map(r => ({ ...r, _b: 'G', _amt: Number(r.potential_amount) || 0 }))];
    all.sort((x, y) => y._amt - x._amt);
    for (const r of all) {
      const stage = r.stage ? `[${r.stage}]` : '';
      const comment = r.stage_comment ? `«${r.stage_comment.slice(0, 25)}»` : '';
      const manual = r.manually_added ? '[+ADD]' : '';
      const done = (r.completed || r.closure_completed) ? '[✓DONE]' : '';
      console.log(`     ${r._b} ${formatUSD(r._amt).padStart(8)} ${stage.padEnd(15)} ${manual}${done} ${(r.client_name || '?').slice(0, 36)}`);
    }
  }

  // Show what would be deleted
  if (a.delF.length + a.delG.length > 0) {
    console.log(`   ── DELETE ──`);
    const all = [...a.delF.map(r => ({ ...r, _b: 'F', _amt: Number(r.forecast_amount) || 0 })),
                 ...a.delG.map(r => ({ ...r, _b: 'G', _amt: Number(r.potential_amount) || 0 }))];
    all.sort((x, y) => y._amt - x._amt);
    for (const r of all) {
      const stage = r.stage ? `[${r.stage}]` : '';
      const comment = r.stage_comment ? `«${r.stage_comment.slice(0, 25)}»` : '';
      const manual = r.manually_added ? '[+ADD]' : '';
      const done = (r.completed || r.closure_completed) ? '[✓DONE]' : '';
      const flag = (r.stage || r.stage_comment || r.manually_added || r.completed || r.closure_completed || r.training_id || r.deadline) ? ' ⚠HAS-EDIT' : '';
      console.log(`     ${r._b} ${formatUSD(r._amt).padStart(8)} ${stage.padEnd(15)} ${manual}${done} ${(r.client_name || '?').slice(0, 36)}${flag}`);
    }
  }

  totalDelF += a.delF.length;
  totalDelG += a.delG.length;
  totalDelSum += delSumF + delSumG;
  totalKeepRows += a.keepF.length + a.keepG.length;
  totalKeepSum += keepSumF + keepSumG;
  console.log();
}

console.log('═══════ ПІДСУМОК DRY-RUN ═══════');
console.log(`Зачеплено пар (user × segment): ${affected.length}`);
console.log(`Унікальних менеджерів: ${new Set(affected.map(a => a.user)).size}`);
console.log();
console.log(`РЯДКІВ:`);
console.log(`  KEEP:   ${totalKeepRows.toString().padStart(4)} рядків  Σ=${formatUSD(totalKeepSum)}`);
console.log(`  DELETE: ${(totalDelF + totalDelG).toString().padStart(4)} рядків  Σ=${formatUSD(totalDelSum)}  (${totalDelF}F + ${totalDelG}G)`);
console.log();
console.log(`OVERLAP CHECK: ${anyOverlap ? '⚠ ЗНАЙДЕНО overlap у якомусь pair — потрібен ручний огляд' : '✓ Нуль перетинів між DELETE та KEEP по client_id'}`);
console.log();
console.log(`Рядки з ⚠HAS-EDIT (мають stage / comment / manually_added / completed / training_id / deadline)`);
console.log(`= потенційно свідома робота менеджера у попередньому save. Перевір вручну.`);
console.log();
console.log('▸ Якщо все ок — запустити з --confirm flag (окремий script m8-apply.mjs).');
