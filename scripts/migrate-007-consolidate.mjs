#!/usr/bin/env node
/**
 * Migration M7 (REST-version): консолідація тижневих period_id у monthly.
 *
 * Чому REST а не SQL: pooler URL не працює зараз (Tenant or user not found),
 * Supabase CLI unauthorized. Логіка та сама, але через PostgREST.
 *
 * Стратегія:
 *   1. INSERT canonical periods (one per month)
 *   2. Для forecasts/gap_closures/period_summaries:
 *      - DELETE дублі (keep latest updated_at)
 *      - UPDATE period_id non-canonical → canonical
 *   3. Для planning_snapshots: те саме але keep EARLIEST captured_at
 *   4. DELETE non-canonical periods
 *
 * Ідемпотентний: можна запускати кілька разів. Кінцевий стан — однаковий.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

function pad2(n) { return String(n).padStart(2, '0'); }

function monthlyPidFromMonth(monthStr) {
  // monthStr like '2026-05-01' or '2026-05'
  const m = /^(\d{4})-(\d{2})/.exec(monthStr);
  if (!m) throw new Error(`bad month: ${monthStr}`);
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  const lastDay = new Date(year, monthIdx + 1, 0);
  return year * 10000 + (monthIdx + 1) * 100 + lastDay.getDate();
}

function monthlyMeta(monthStr) {
  const m = /^(\d{4})-(\d{2})/.exec(monthStr);
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  const last = new Date(year, monthIdx + 1, 0);
  const weekStart = `${year}-${pad2(monthIdx + 1)}-01`;
  const weekEnd = `${year}-${pad2(monthIdx + 1)}-${pad2(last.getDate())}`;
  return {
    id: monthlyPidFromMonth(monthStr),
    week_start: weekStart,
    week_end: weekEnd,
    month: weekStart,
    is_active: false,
  };
}

async function fetchAll(table, query) {
  const out = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const url = `${URL}/rest/v1/${table}?${query}&order=id.asc&limit=${PAGE}&offset=${from}`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`${table} fetch ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
    from += PAGE;
  }
}

async function deleteByIds(table, ids) {
  if (ids.length === 0) return;
  // Pack in batches of 200 to keep URL reasonable.
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH).join(',');
    const url = `${URL}/rest/v1/${table}?id=in.(${slice})`;
    const r = await fetch(url, { method: 'DELETE', headers: { ...HEADERS, Prefer: 'return=minimal' } });
    if (!r.ok) throw new Error(`${table} delete ${r.status}: ${await r.text()}`);
  }
}

async function updatePeriodId(table, oldPid, newPid) {
  const url = `${URL}/rest/v1/${table}?period_id=eq.${oldPid}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ period_id: newPid }),
  });
  if (!r.ok) throw new Error(`${table} update ${r.status}: ${await r.text()}`);
}

async function upsertPeriod(meta) {
  const r = await fetch(`${URL}/rest/v1/periods?on_conflict=id`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([meta]),
  });
  if (!r.ok) throw new Error(`periods upsert ${r.status}: ${await r.text()}`);
}

async function deletePeriod(id) {
  const r = await fetch(`${URL}/rest/v1/periods?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`period delete ${r.status}: ${await r.text()}`);
}

async function tableCount(table) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((r.headers.get('content-range') || '').split('/')[1] || '0', 10);
}

// ========== MAIN ==========

console.log('━━━ Migration M7: consolidate to monthly periods ━━━\n');

console.log('📊 Counts BEFORE:');
const tables = ['periods', 'forecasts', 'gap_closures', 'period_summaries', 'planning_snapshots'];
const before = {};
for (const t of tables) before[t] = await tableCount(t);
console.log(before);

async function patchPeriod(id, body) {
  const r = await fetch(`${URL}/rest/v1/periods?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`period patch ${r.status}: ${await r.text()}`);
}

// 1. Read all periods
console.log('\n━━━ STEP 1: Determine canonical periods ━━━');
const periods = await fetchAll('periods', 'select=*');
const monthsSet = new Set(periods.map(p => p.month));
const monthsList = [...monthsSet].sort();
const remap = new Map(); // old_pid → canonical_pid
for (const month of monthsList) {
  const meta = monthlyMeta(month);
  const computedCanonicalId = meta.id; // YYYYMMDD format
  // Чи існує вже canonical period (по month + week_end=last_day) з ID ≠ computed?
  // (Наприклад April: id=5, week_end=2026-04-30 — старий sequential формат.)
  const existingByWeekEnd = periods.find(p => p.month === month && p.week_end === meta.week_end);
  if (existingByWeekEnd && existingByWeekEnd.id !== computedCanonicalId) {
    console.log(`  ⚠ rename canonical for ${month}: id=${existingByWeekEnd.id} → id=${computedCanonicalId}`);
    // Step A: тимчасово відсунути week_end existing щоб звільнити unique constraint
    await patchPeriod(existingByWeekEnd.id, { week_end: '2099-12-31' });
    // Step B: INSERT новий period з canonical id + правильним week_end
    await upsertPeriod(meta);
    // Step C: remap дані з існуючого id на canonical id (зробить пізніше у migrateTable)
    remap.set(existingByWeekEnd.id, computedCanonicalId);
    // Old period буде DELETED у фінальному кроці.
  } else if (!existingByWeekEnd) {
    console.log(`  + INSERT canonical period for ${month}: id=${computedCanonicalId}`);
    await upsertPeriod(meta);
  } else {
    console.log(`  ✓ canonical for ${month}: id=${computedCanonicalId} (already correct)`);
  }
  // Map non-canonical periods of this month → computed canonical
  for (const p of periods) {
    if (p.month === month && p.id !== computedCanonicalId) {
      remap.set(p.id, computedCanonicalId);
    }
  }
}
console.log(`\nNon-canonical → canonical map (${remap.size} entries):`);
for (const [o, n] of remap) console.log(`  ${o} → ${n}`);

if (remap.size === 0) {
  console.log('\n✅ No non-canonical periods. Migration is no-op.');
  process.exit(0);
}

// 2. Helper for dedup-and-move
async function migrateTable(table, keyFn, sortFn, sortLabel) {
  console.log(`\n━━━ ${table} ━━━`);
  const allRows = await fetchAll(table, 'select=*');
  console.log(`  loaded ${allRows.length} rows`);

  // Group by canonical key
  const groups = new Map();
  for (const r of allRows) {
    const canonPid = remap.get(r.period_id) ?? r.period_id;
    const key = keyFn(canonPid, r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // For each dup-group, keep the "winner" by sortFn, delete rest.
  const toDelete = [];
  for (const [, list] of groups) {
    if (list.length === 1) continue;
    // sortFn: returns winner first (latest or earliest depending on table semantics)
    list.sort(sortFn);
    for (let i = 1; i < list.length; i++) toDelete.push(list[i].id);
  }
  console.log(`  dedup: drop ${toDelete.length} rows (keep ${sortLabel})`);
  await deleteByIds(table, toDelete);

  // Now UPDATE period_id non-canonical → canonical (no constraints will fail)
  for (const [oldPid, newPid] of remap) {
    await updatePeriodId(table, oldPid, newPid);
  }
  console.log(`  rebase: period_id updated for ${remap.size} non-canonical pids`);
}

// 3. forecasts/gap_closures/period_summaries: keep LATEST updated_at
const latestSort = (a, b) => {
  const ua = a.updated_at || '';
  const ub = b.updated_at || '';
  if (ua !== ub) return ub.localeCompare(ua); // desc
  return b.id - a.id;
};
await migrateTable(
  'forecasts',
  (canon, r) => `${canon}|${r.user_id}|${r.segment_code}|${r.client_id_1c}`,
  latestSort,
  'latest updated_at',
);
await migrateTable(
  'gap_closures',
  (canon, r) => `${canon}|${r.user_id}|${r.segment_code}|${r.client_id_1c}`,
  latestSort,
  'latest updated_at',
);
await migrateTable(
  'period_summaries',
  (canon, r) => `${canon}|${r.user_id}|${r.segment_code}`,
  latestSort,
  'latest updated_at',
);

// 4. planning_snapshots: keep EARLIEST captured_at (first-write-wins audit)
const earliestSort = (a, b) => {
  const ca = a.captured_at || '';
  const cb = b.captured_at || '';
  if (ca !== cb) return ca.localeCompare(cb); // asc
  return a.id - b.id;
};
await migrateTable(
  'planning_snapshots',
  (canon, r) => `${canon}|${r.user_id}|${r.segment_code}|${r.block_type}|${r.client_id_1c}`,
  earliestSort,
  'earliest captured_at',
);

// 5. DELETE non-canonical periods
console.log('\n━━━ DELETE non-canonical periods ━━━');
for (const [oldPid] of remap) {
  await deletePeriod(oldPid);
  console.log(`  - period ${oldPid}`);
}

console.log('\n📊 Counts AFTER:');
const after = {};
for (const t of tables) after[t] = await tableCount(t);
console.log(after);

console.log('\n✅ Migration M7 complete.');
console.log('\nDelta:');
for (const t of tables) {
  const d = after[t] - before[t];
  const sign = d > 0 ? '+' : '';
  console.log(`  ${t}: ${before[t]} → ${after[t]}  (${sign}${d})`);
}
