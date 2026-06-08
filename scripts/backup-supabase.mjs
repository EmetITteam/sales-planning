#!/usr/bin/env node
// Local JSON dump of all public tables via Supabase REST.
// Output: backups/<date>/<table>.json + manifest.json with row counts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// ⚠️ Додавати сюди КОЖНУ нову таблицю при створенні. Інакше backup її пропустить.
const TABLES = [
  'users', 'periods', 'forecasts', 'gap_closures', 'period_summaries', 'planning_snapshots',
  // Admin tables
  'planning_locks', 'planning_settings',
  // Sprint 1.5: meetings buffer-sync
  'meetings', 'meeting_syncs',
];
const PAGE = 1000;

async function dumpTable(table) {
  const out = [];
  let from = 0;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (r.status === 404) {
      // Таблиця ще не створена (migration не виконана) — skip без помилки.
      return { rows: [], total: 0, skipped: true };
    }
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    const cr = r.headers.get('content-range') || '';
    const total = parseInt(cr.split('/')[1] || '0', 10);
    if (out.length >= total || rows.length < PAGE) return { rows: out, total };
    from += PAGE;
  }
}

// ⚠️ Папка з ДАТОЮ+ЧАСОМ (UTC), щоб повторні backup НЕ перезаписували
// попередні. Раніше суфікс був тільки `YYYY-MM-DD` → коли я (або hook)
// прогнав backup двічі в один день, pre-migration snapshot затерся пост-
// міграційним станом. Це втрата страховки для відкату.
//   Приклад: backups/2026-05-12T15-23-47Z/
//
// BACKUP_DIR_PREFIX env: якщо передано, додає підпапку перед stamp.
// Використовується для частих pilot-backups щоб не змішувати з основним 2×день:
//   BACKUP_DIR_PREFIX=pilot → backups/pilot/2026-05-15T11-30-00Z/
const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '').replace(/Z$/, 'Z');
const prefix = process.env.BACKUP_DIR_PREFIX || '';
const dir = prefix
  ? join(process.cwd(), 'backups', prefix, stamp)
  : join(process.cwd(), 'backups', stamp);
mkdirSync(dir, { recursive: true });

const manifest = { stamp, takenAt: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  process.stdout.write(`${t}... `);
  const { rows, total, skipped } = await dumpTable(t);
  if (skipped) {
    manifest.tables[t] = { skipped: true, reason: 'table not found (migration not applied?)' };
    console.log('skipped (404)');
    continue;
  }
  writeFileSync(join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
  manifest.tables[t] = { rows: rows.length, totalReported: total };
  console.log(`${rows.length} rows`);
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nBackup written to backups/${stamp}/`);
