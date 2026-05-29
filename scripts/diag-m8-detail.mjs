#!/usr/bin/env node
/**
 * Дрилдаун: вивести 5 multi-batch пар у forecasts і 5 у gap_closures
 * щоб переконатися що Бойко-PETARAN серед них і що zombie логіка коректна.
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
const WINDOW_MS = 60 * 60 * 1000;

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

function report(rows, amountKey, label) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.user_id}|${r.segment_code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  console.log(`\n=== ${label} multi-batch pairs ===`);
  for (const [key, rs] of groups) {
    const tsArr = rs.map((r) => Date.parse(r.updated_at));
    const maxTs = Math.max(...tsArr);
    const minTs = Math.min(...tsArr);
    if (maxTs - minTs <= WINDOW_MS) continue; // single-batch
    const cutoff = maxTs - WINDOW_MS;
    const keep = rs.filter((r) => Date.parse(r.updated_at) >= cutoff);
    const del = rs.filter((r) => Date.parse(r.updated_at) < cutoff);
    const keepSum = keep.reduce((s, r) => s + Number(r[amountKey] || 0), 0);
    const delSum = del.reduce((s, r) => s + Number(r[amountKey] || 0), 0);
    const spreadH = (maxTs - minTs) / 3600000;
    console.log(`\n  ${key}`);
    console.log(`    rows: ${rs.length}, spread=${spreadH.toFixed(1)}h`);
    console.log(`    earliest=${new Date(minTs).toISOString()}, latest=${new Date(maxTs).toISOString()}`);
    console.log(`    KEEP: ${keep.length} rows, $${keepSum.toFixed(0)}`);
    console.log(`    DEL:  ${del.length} rows, $${delSum.toFixed(0)}`);
    // pid breakdown
    const keepPids = {};
    const delPids = {};
    for (const r of keep) keepPids[r.period_id] = (keepPids[r.period_id] || 0) + 1;
    for (const r of del) delPids[r.period_id] = (delPids[r.period_id] || 0) + 1;
    console.log(`    keep pids: ${JSON.stringify(keepPids)}`);
    console.log(`    del pids:  ${JSON.stringify(delPids)}`);
  }
}

const forecasts = await fetchAll('forecasts', 'id,user_id,segment_code,client_id_1c,forecast_amount,updated_at,period_id');
const gaps = await fetchAll('gap_closures', 'id,user_id,segment_code,client_id_1c,potential_amount,updated_at,period_id');
report(forecasts, 'forecast_amount', 'FORECASTS');
report(gaps, 'potential_amount', 'GAPS');
