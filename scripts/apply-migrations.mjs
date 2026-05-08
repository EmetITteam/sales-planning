#!/usr/bin/env node
/**
 * Apply Supabase migrations programmatically with verification.
 *
 * Reads DATABASE_URL from .env, applies migrations in order, verifies
 * row counts before/after for safety.
 *
 * Usage:
 *   node scripts/apply-migrations.mjs <migration_file>
 *   node scripts/apply-migrations.mjs supabase/migrations/20260508_001_add_indices.sql
 *
 * Or run all pending:
 *   node scripts/apply-migrations.mjs --all
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

// Load .env manually (we don't have dotenv as dep)
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

const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or DIRECT_URL env not set');
  process.exit(1);
}

const { Client } = pg;

async function rowCounts(client) {
  const tables = ['users', 'periods', 'forecasts', 'gap_closures', 'period_summaries'];
  const out = {};
  for (const t of tables) {
    try {
      const r = await client.query(`SELECT COUNT(*) AS n FROM ${t}`);
      out[t] = parseInt(r.rows[0].n, 10);
    } catch (e) {
      out[t] = `ERROR: ${e.message}`;
    }
  }
  return out;
}

async function listColumns(client, table) {
  const r = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `, [table]);
  return r.rows;
}

async function listIndexes(client, table) {
  const r = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename=$1
    ORDER BY indexname
  `, [table]);
  return r.rows.map(x => x.indexname);
}

async function applyMigration(client, file) {
  console.log(`\n━━━ Applying ${file} ━━━`);
  const sql = readFileSync(file, 'utf-8');

  // Strip comments to log a preview
  const preview = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).slice(0, 5).join(' | ').slice(0, 200);
  console.log(`SQL preview: ${preview}...`);

  console.log('\n📊 Counts BEFORE:');
  const before = await rowCounts(client);
  console.log(before);

  console.log('\n🚀 Executing...');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration committed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration FAILED, rolled back:', err.message);
    throw err;
  }

  console.log('\n📊 Counts AFTER:');
  const after = await rowCounts(client);
  console.log(after);

  // Detect data loss
  for (const t of Object.keys(before)) {
    if (typeof before[t] === 'number' && typeof after[t] === 'number' && after[t] < before[t]) {
      console.warn(`⚠️ ROW COUNT DROPPED in ${t}: ${before[t]} → ${after[t]}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/apply-migrations.mjs <file> | --all');
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('✅ Connected to Postgres');

  // Initial counts
  console.log('\n📊 Initial table row counts:');
  console.log(await rowCounts(client));

  console.log('\n📋 forecasts columns BEFORE:');
  console.log((await listColumns(client, 'forecasts')).map(c => c.column_name).join(', '));

  console.log('\n📋 forecasts indexes BEFORE:');
  console.log(await listIndexes(client, 'forecasts'));

  try {
    if (args[0] === '--all') {
      const dir = 'supabase/migrations';
      const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
      for (const f of files) {
        await applyMigration(client, join(dir, f));
      }
    } else {
      await applyMigration(client, args[0]);
    }

    console.log('\n📋 forecasts columns AFTER:');
    console.log((await listColumns(client, 'forecasts')).map(c => `${c.column_name}:${c.data_type}`).join(', '));

    console.log('\n📋 forecasts indexes AFTER:');
    console.log(await listIndexes(client, 'forecasts'));

    console.log('\n📋 gap_closures columns AFTER:');
    console.log((await listColumns(client, 'gap_closures')).map(c => c.column_name).join(', '));

    console.log('\n📋 period_summaries columns AFTER:');
    console.log((await listColumns(client, 'period_summaries')).map(c => c.column_name).join(', '));

    console.log('\n✅ DONE');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('\n💥 FATAL:', err);
  process.exit(1);
});
