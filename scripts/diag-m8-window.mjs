#!/usr/bin/env node
/**
 * READ-ONLY діагностика для M8 «1-hour window keep-latest» rule.
 *
 * Для кожного (user_id, segment_code) у forecasts + gap_closures:
 *   max_ts = MAX(updated_at)
 *   keep = rows with updated_at >= max_ts - 1 hour
 *   delete = решта
 *
 * Аналізуємо: скільки рядків delete, скільки пар, edge cases,
 * pre/post-migration cohort, sanity Σ amount.
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
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MIGRATION_TS = Date.parse('2026-05-12T12:11:00Z'); // M7

async function fetchAll(table, selectCols) {
  const out = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const url = `${SBURL}/rest/v1/${table}?select=${selectCols}&order=id.asc&limit=${PAGE}&offset=${from}`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`${table} fetch ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
    from += PAGE;
  }
}

function analyzeTable(rows, amountKey) {
  // key = user_id|segment_code
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.user_id}|${r.segment_code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let totalRows = rows.length;
  let totalSum = rows.reduce((s, r) => s + Number(r[amountKey] || 0), 0);
  let delRows = 0;
  let delSum = 0;
  let keepRows = 0;
  let keepSum = 0;

  const pairsAll = groups.size;
  let pairsSingleBatch = 0;        // всі рядки у вікні — нічого видаляти
  let pairsMultiBatch = 0;         // spread > 1h, M8 спрацює
  let pairsMultiBatchGt24h = 0;    // 2+ batches розділених >24h
  let pairsStaleLatest = 0;        // latest_ts older than now − 24h
  let pairsPreMigOnly = 0;
  let pairsPostMigOnly = 0;
  let pairsBoth = 0;

  // client_id overlap analysis
  let pairsWithClientOverlap = 0;        // клієнт є і в keep, і в delete
  let pairsKeepOnlyClients = 0;          // нові клієнти тільки в keep
  let pairsDeleteOnlyClients = 0;        // zombie — тільки в delete (це і є цільові)
  let zombieRows = 0;                    // рядки клієнтів які ТІЛЬКИ в delete batch

  const now = Date.now();

  for (const [key, rs] of groups) {
    const tsArr = rs.map((r) => Date.parse(r.updated_at)).filter((x) => !Number.isNaN(x));
    if (tsArr.length === 0) continue;
    const maxTs = Math.max(...tsArr);
    const minTs = Math.min(...tsArr);
    const cutoff = maxTs - WINDOW_MS;

    const keep = rs.filter((r) => Date.parse(r.updated_at) >= cutoff);
    const del = rs.filter((r) => Date.parse(r.updated_at) < cutoff);

    delRows += del.length;
    keepRows += keep.length;
    delSum += del.reduce((s, r) => s + Number(r[amountKey] || 0), 0);
    keepSum += keep.reduce((s, r) => s + Number(r[amountKey] || 0), 0);

    if (del.length === 0) {
      pairsSingleBatch++;
    } else {
      pairsMultiBatch++;
      // gap between latest delete and earliest keep — proxy for "batches >24h apart"
      const maxDelTs = Math.max(...del.map((r) => Date.parse(r.updated_at)));
      const minKeepTs = Math.min(...keep.map((r) => Date.parse(r.updated_at)));
      if (minKeepTs - maxDelTs > 24 * 60 * 60 * 1000) pairsMultiBatchGt24h++;
    }

    if (now - maxTs > 24 * 60 * 60 * 1000) pairsStaleLatest++;

    const hasPre = tsArr.some((t) => t < MIGRATION_TS);
    const hasPost = tsArr.some((t) => t >= MIGRATION_TS);
    if (hasPre && hasPost) pairsBoth++;
    else if (hasPre) pairsPreMigOnly++;
    else pairsPostMigOnly++;

    // client_id overlap
    const keepClients = new Set(keep.map((r) => r.client_id_1c));
    const delClients = new Set(del.map((r) => r.client_id_1c));
    if (del.length > 0) {
      let overlap = false;
      let delOnly = false;
      let keepOnly = false;
      for (const c of delClients) {
        if (keepClients.has(c)) overlap = true;
        else { delOnly = true; zombieRows += del.filter((r) => r.client_id_1c === c).length; }
      }
      for (const c of keepClients) {
        if (!delClients.has(c)) keepOnly = true;
      }
      if (overlap) pairsWithClientOverlap++;
      if (delOnly) pairsDeleteOnlyClients++;
      if (keepOnly) pairsKeepOnlyClients++;
    }
  }

  return {
    totalRows, totalSum, delRows, delSum, keepRows, keepSum,
    pairsAll, pairsSingleBatch, pairsMultiBatch, pairsMultiBatchGt24h,
    pairsStaleLatest, pairsPreMigOnly, pairsPostMigOnly, pairsBoth,
    pairsWithClientOverlap, pairsKeepOnlyClients, pairsDeleteOnlyClients, zombieRows,
  };
}

console.log('Fetching forecasts...');
const forecasts = await fetchAll('forecasts', 'id,user_id,segment_code,client_id_1c,forecast_amount,updated_at,period_id');
console.log(`  ${forecasts.length} rows`);

console.log('Fetching gap_closures...');
const gaps = await fetchAll('gap_closures', 'id,user_id,segment_code,client_id_1c,potential_amount,updated_at,period_id');
console.log(`  ${gaps.length} rows`);

console.log('\n=== FORECASTS analysis ===');
const fA = analyzeTable(forecasts, 'forecast_amount');
console.log(JSON.stringify(fA, null, 2));

console.log('\n=== GAP_CLOSURES analysis ===');
const gA = analyzeTable(gaps, 'potential_amount');
console.log(JSON.stringify(gA, null, 2));

console.log('\n=== COMBINED SUMMARY ===');
console.log(`Total rows (current):    forecasts=${fA.totalRows}  gaps=${gA.totalRows}  TOTAL=${fA.totalRows + gA.totalRows}`);
console.log(`M8 will DELETE:          forecasts=${fA.delRows}    gaps=${gA.delRows}    TOTAL=${fA.delRows + gA.delRows}`);
console.log(`M8 will KEEP:            forecasts=${fA.keepRows}   gaps=${gA.keepRows}   TOTAL=${fA.keepRows + gA.keepRows}`);
console.log(`Σ amount BEFORE: f=$${fA.totalSum.toFixed(0)}  g=$${gA.totalSum.toFixed(0)}`);
console.log(`Σ amount AFTER:  f=$${fA.keepSum.toFixed(0)}   g=$${gA.keepSum.toFixed(0)}`);
console.log(`Σ amount LOST:   f=$${fA.delSum.toFixed(0)}    g=$${gA.delSum.toFixed(0)}`);

console.log(`\nPairs total:             f=${fA.pairsAll}  g=${gA.pairsAll}`);
console.log(`Pairs single-batch (OK): f=${fA.pairsSingleBatch}  g=${gA.pairsSingleBatch}`);
console.log(`Pairs multi-batch (M8 fires): f=${fA.pairsMultiBatch}  g=${gA.pairsMultiBatch}`);
console.log(`  …of which 2+ batches >24h apart: f=${fA.pairsMultiBatchGt24h}  g=${gA.pairsMultiBatchGt24h}`);
console.log(`Pairs stale (latest > 24h ago): f=${fA.pairsStaleLatest}  g=${gA.pairsStaleLatest}`);

console.log(`\nMigration cohort (TS cutoff = ${new Date(MIGRATION_TS).toISOString()}):`);
console.log(`  pre-mig only:  f=${fA.pairsPreMigOnly}   g=${gA.pairsPreMigOnly}`);
console.log(`  post-mig only: f=${fA.pairsPostMigOnly}  g=${gA.pairsPostMigOnly}`);
console.log(`  BOTH:          f=${fA.pairsBoth}         g=${gA.pairsBoth}`);

console.log(`\nClient overlap (within pairs that have del-rows):`);
console.log(`  with overlap (client in keep AND del): f=${fA.pairsWithClientOverlap}  g=${gA.pairsWithClientOverlap}`);
console.log(`  zombie clients (only in del):          f=${fA.pairsDeleteOnlyClients}  g=${gA.pairsDeleteOnlyClients}`);
console.log(`  new clients (only in keep):            f=${fA.pairsKeepOnlyClients}    g=${gA.pairsKeepOnlyClients}`);
console.log(`  zombie rows total:                     f=${fA.zombieRows}              g=${gA.zombieRows}`);

console.log('\nDone. (read-only)');
