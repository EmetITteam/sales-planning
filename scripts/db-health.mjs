// DB health audit — orphan FKs, nulls in NOT NULL, schema sanity, sample data shape.
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Prefer: 'count=exact' } });
  const cr = r.headers.get('content-range') || '';
  const total = parseInt(cr.split('/')[1] || '0', 10);
  const data = await r.json();
  return { status: r.status, total, data };
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n━━━ 1. Row counts ━━━');
const tables = ['users', 'periods', 'forecasts', 'gap_closures', 'period_summaries'];
const counts = {};
for (const t of tables) {
  const r = await rest(`${t}?select=id&limit=1`);
  counts[t] = r.total;
  console.log(`  ${t.padEnd(20)} ${r.total} rows`);
}

console.log('\n━━━ 2. Orphan FKs (user_id у дочірних таблицях посилається на неіснуючого user) ━━━');
const allUsers = await rest('users?select=id&limit=1000');
const userIds = new Set(allUsers.data.map(u => u.id));
console.log(`  users.id pool: ${userIds.size} (${[...userIds].slice(0, 3).join(', ')}...)`);

for (const t of ['forecasts', 'gap_closures', 'period_summaries']) {
  const r = await rest(`${t}?select=id,user_id&limit=10000`);
  const orphans = r.data.filter(row => !userIds.has(row.user_id));
  check(
    `${t}.user_id orphans`,
    orphans.length === 0,
    orphans.length === 0 ? 'all FKs valid' : `${orphans.length} orphan rows: ${orphans.slice(0, 3).map(o => `id=${o.id}/uid=${o.user_id}`).join(', ')}`,
  );
}

console.log('\n━━━ 3. periods orphan check (created_by → users) ━━━');
const periods = await rest('periods?select=id,created_by');
const orphanPeriods = periods.data.filter(p => p.created_by !== null && !userIds.has(p.created_by));
check(
  'periods.created_by orphans',
  orphanPeriods.length === 0,
  orphanPeriods.length === 0 ? 'all OK or NULL' : `${orphanPeriods.length} orphans`,
);

console.log('\n━━━ 4. NULL у полях що мають бути NOT NULL ━━━');
// users: full_name NOT NULL
const usersNullFn = await rest('users?full_name=is.null&select=id');
check('users.full_name NULL count', usersNullFn.total === 0, `${usersNullFn.total} rows`);

// forecasts: forecast_amount, client_id_1c
const fNullClient = await rest('forecasts?client_id_1c=is.null&select=id');
const fNullAmt = await rest('forecasts?forecast_amount=is.null&select=id');
check('forecasts.client_id_1c NULL', fNullClient.total === 0, `${fNullClient.total}`);
check('forecasts.forecast_amount NULL', fNullAmt.total === 0, `${fNullAmt.total}`);

// gap_closures: client_id_1c, potential_amount
const gNullClient = await rest('gap_closures?client_id_1c=is.null&select=id');
const gNullAmt = await rest('gap_closures?potential_amount=is.null&select=id');
check('gap_closures.client_id_1c NULL', gNullClient.total === 0, `${gNullClient.total}`);
check('gap_closures.potential_amount NULL', gNullAmt.total === 0, `${gNullAmt.total}`);

console.log('\n━━━ 5. Дублікати по UNIQUE-ключах (period_id, user_id, segment_code, client_id_1c) ━━━');
for (const t of ['forecasts', 'gap_closures']) {
  const r = await rest(`${t}?select=period_id,user_id,segment_code,client_id_1c&limit=10000`);
  const seen = new Map();
  const dups = [];
  for (const row of r.data) {
    const k = `${row.period_id}|${row.user_id}|${row.segment_code}|${row.client_id_1c}`;
    if (seen.has(k)) dups.push(k); else seen.set(k, true);
  }
  check(
    `${t} duplicate constraint key`,
    dups.length === 0,
    dups.length === 0 ? 'no dups' : `${dups.length} dups: ${dups.slice(0, 2).join(' / ')}`,
  );
}

console.log('\n━━━ 6. Підозрілі значення ━━━');
// Negative amounts
const fNeg = await rest('forecasts?forecast_amount=lt.0&select=id,forecast_amount');
const gNeg = await rest('gap_closures?potential_amount=lt.0&select=id,potential_amount');
check('forecasts negative amounts', fNeg.total === 0, `${fNeg.total}`);
check('gap_closures negative amounts', gNeg.total === 0, `${gNeg.total}`);

// Zero forecasts (auto-populate may leave 0; large count = manager не заповнював)
const fZero = await rest('forecasts?forecast_amount=eq.0&select=id');
console.log(`  forecasts з forecast_amount=0: ${fZero.total} (це 'недоторкнуті' auto-populate рядки — це нормально)`);

// Дуже великі суми (могли бути ввели з друкарською помилкою)
const fLarge = await rest('forecasts?forecast_amount=gt.100000&select=id,forecast_amount,client_name,user_id');
console.log(`  forecasts > $100k: ${fLarge.total}`);
if (fLarge.total > 0) {
  console.log(`    ${JSON.stringify(fLarge.data.slice(0, 3))}`);
}

console.log('\n━━━ 7. period_summaries покриття ━━━');
console.log(`  ${counts.period_summaries} рядків vs ${counts.forecasts} forecasts. Це ≪ 1 — ОК (період_summary тільки де менеджер заповнив 'дії розриву')`);

console.log('\n━━━ 8. backup_20260508_* still present? ━━━');
for (const t of tables) {
  const r = await fetch(`${URL}/rest/v1/backup_20260508_${t}?select=id&limit=1`, { headers: H });
  console.log(`  backup_20260508_${t}: ${r.status === 200 ? 'EXISTS (rollback safety)' : 'missing'}`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n━━━ Підсумок: ${checks.length - failed.length}/${checks.length} OK${failed.length > 0 ? `, ${failed.length} FAILED` : ''} ━━━`);
process.exit(failed.length > 0 ? 1 : 0);
