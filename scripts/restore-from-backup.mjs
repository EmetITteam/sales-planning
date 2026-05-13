#!/usr/bin/env node
/**
 * Restore таблиць з timestamped backup (отриманого через backup-supabase.mjs).
 *
 * Що робить:
 *   1. Читає backups/<dir>/<table>.json для кожної цільової таблиці
 *   2. TRUNCATE на цій таблиці (через DELETE WHERE id IS NOT NULL — REST не дає TRUNCATE)
 *   3. Batch INSERT з backup
 *
 * Цільові таблиці: forecasts, gap_closures, period_summaries (тестові дані).
 * users, periods, planning_snapshots — НЕ чіпає (там профілі / FK / snapshots
 * які не зміняться під час admin-тесту).
 *
 * Usage:
 *   node scripts/restore-from-backup.mjs backups/2026-05-13T11-56-53Z/
 *   node scripts/restore-from-backup.mjs backups/2026-05-13T11-56-53Z/ --confirm
 *
 * Без --confirm: dry-run preview (рахунки рядків, нічого не пише).
 * З --confirm: реально перезаписує таблиці.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Load .env
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
if (!URL || !KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const backupDir = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');

if (!backupDir) {
  console.error('Usage: node scripts/restore-from-backup.mjs <backup-dir> [--confirm]');
  console.error('Example: node scripts/restore-from-backup.mjs backups/2026-05-13T11-56-53Z/');
  process.exit(1);
}
if (!existsSync(backupDir)) {
  console.error(`❌ Backup directory does not exist: ${backupDir}`);
  process.exit(1);
}

// Таблиці які restore-имо. Порядок важливий через FK:
//   period_summaries, forecasts, gap_closures посилаються на periods (id) + users (login).
//   Якщо restore лише ці три — periods + users НЕ чіпаємо, тому FK гарантовано
//   існують (бекап взято з того ж стану).
const TARGET_TABLES = ['forecasts', 'gap_closures', 'period_summaries'];

const manifestPath = join(backupDir, 'manifest.json');
let manifest = null;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {}
}

console.log(`📦 Backup: ${backupDir}`);
if (manifest?.takenAt) console.log(`   Taken at: ${manifest.takenAt}`);
console.log(`   Tables in dir: ${readdirSync(backupDir).filter(f => f.endsWith('.json') && f !== 'manifest.json').join(', ')}`);
console.log('');

const stats = [];
for (const table of TARGET_TABLES) {
  const file = join(backupDir, `${table}.json`);
  if (!existsSync(file)) {
    console.error(`❌ Missing ${file}`);
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) {
    console.error(`❌ ${file} is not an array`);
    process.exit(1);
  }
  // Поточна кількість у БД (для diff preview)
  const r = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact' },
  });
  const range = r.headers.get('content-range');
  const currentCount = range ? parseInt(range.split('/')[1], 10) : '?';
  stats.push({ table, fromBackup: rows.length, currentInDB: currentCount });
  console.log(`  ${table}: backup=${rows.length} rows | currentDB=${currentCount} rows`);
}

if (!CONFIRM) {
  console.log('');
  console.log('🛈 DRY RUN — нічого не змінено. Передай --confirm щоб реально restore.');
  process.exit(0);
}

console.log('');
console.log('⚠️  CONFIRM — починаю restore. Поточні дані ЗАМІНЯТЬСЯ на backup-снапшот.');
console.log('');

for (const table of TARGET_TABLES) {
  const file = join(backupDir, `${table}.json`);
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  // 1. DELETE all (REST не дає TRUNCATE — через гарантовано-існуюче поле id)
  console.log(`  ${table}: DELETE all…`);
  // id повинен існувати у всіх трьох таблицях (auto-increment).
  const delResp = await fetch(`${URL}/rest/v1/${table}?id=gt.0`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=minimal' },
  });
  if (!delResp.ok) {
    console.error(`  ❌ DELETE failed: HTTP ${delResp.status} ${await delResp.text().catch(() => '')}`);
    process.exit(1);
  }

  // 2. Batch INSERT (PostgREST приймає масив у POST → один SQL INSERT з VALUES (...), (...))
  if (rows.length === 0) {
    console.log(`  ${table}: insert 0 (table empty in backup)`);
    continue;
  }
  // Розбиваємо на чанки по 500 — щоб URL/body не задовгий, але теж не 1 row at a time
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const insResp = await fetch(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(slice),
    });
    if (!insResp.ok) {
      const text = await insResp.text().catch(() => '');
      console.error(`  ❌ INSERT ${i}..${i + slice.length} failed: HTTP ${insResp.status} ${text.slice(0, 300)}`);
      process.exit(1);
    }
    inserted += slice.length;
    process.stdout.write(`  ${table}: insert ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${table}: insert ${inserted}/${rows.length} ✓                `);
}

console.log('');
console.log('✅ Restore completed. Перевір через UI що дані повернулись.');
