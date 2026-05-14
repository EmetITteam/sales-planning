// Backfill planning_snapshots для ВСІХ існуючих менеджерів і брендів.
//
// Як це працює:
//   1. Login як Director (з .env: BACKFILL_LOGIN + BACKFILL_PASSWORD)
//   2. Action 5 (getRegionData) → отримуємо всі регіони + всіх менеджерів
//   3. Для кожного менеджера → Action 2 (getClientsForPlanning) → клієнти
//      з purchases[] per segment
//   4. Розщеплюємо per segment: active (≥3 міс) → forecast, інше → gap
//   5. POST /api/planning/init-snapshot для кожного (manager × segment) з
//      source='backfill'
//   6. INSERT ON CONFLICT DO NOTHING → якщо snapshot уже є, нічого не міняє
//
// Запуск:
//   BACKFILL_BASE_URL=https://sales-planning-lyart.vercel.app \
//   BACKFILL_LOGIN=director@emet.com \
//   BACKFILL_PASSWORD=xxx \
//   BACKFILL_PERIOD_ID=42 \
//   node scripts/snapshot-backfill.mjs
//
// Безпечно повторювати — другий запуск нічого не дублює (UNIQUE constraint).

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

const BASE_URL = process.env.BACKFILL_BASE_URL || 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.BACKFILL_LOGIN;
const PASSWORD = process.env.BACKFILL_PASSWORD;
// Server-to-server виклики потребують x-api-key (validateApiRequest fall-through
// на key check бо Origin/Sec-Fetch-Site нема у Node fetch).
const API_KEY = process.env.API_SECRET_KEY;
const PERIOD_ID = parseInt(process.env.BACKFILL_PERIOD_ID || '0', 10);
const PERIOD_MONTH = process.env.BACKFILL_PERIOD_MONTH; // YYYY-MM-01
const PERIOD_WEEK_START = process.env.BACKFILL_PERIOD_WEEK_START; // YYYY-MM-DD
const PERIOD_WEEK_END = process.env.BACKFILL_PERIOD_WEEK_END;   // YYYY-MM-DD

if (!LOGIN || !PASSWORD || !PERIOD_ID || !PERIOD_MONTH || !PERIOD_WEEK_START || !PERIOD_WEEK_END) {
  console.error('Missing env vars: BACKFILL_LOGIN, BACKFILL_PASSWORD, BACKFILL_PERIOD_ID, BACKFILL_PERIOD_MONTH, BACKFILL_PERIOD_WEEK_START, BACKFILL_PERIOD_WEEK_END');
  process.exit(1);
}

// ⚠️ Cutoff FIXED на плановий місяць — не «90 днів від сьогодні».
// Inline копія `isActiveForBrand` з src/lib/three-month-rule.ts (Node .mjs не може
// імпортувати .ts напряму без транспайлу). Логіка ОДНА — якщо міняти, то у двох
// місцях + tests/three-month-rule.test.ts покриває контракт.
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const planMonthStartMs = (() => {
  const ym = String(PERIOD_MONTH).slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
})();
const cutoffMs = planMonthStartMs - THREE_MONTHS_MS;

const isRecentBrandPurchase = (dateStr) => {
  if (!dateStr) return false;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return false;
  const t = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  // Купівля повинна бути у вікні [cutoff, planMonthStart) — НЕ всередині планового
  // місяця (інакше клієнт що купив 13.05 для травневого плану перейшов би у
  // forecast і виник би дубль з gap).
  return t >= cutoffMs && t < planMonthStartMs;
};

// Mapping 1С category → Russian text (як у БД)
const cat1cToText = (c) => {
  const lower = String(c || '').toLowerCase();
  if (lower === 'активный' || lower === 'active') return 'Активный';
  if (lower === 'спящий' || lower === 'sleeping') return 'Спящий';
  if (lower === 'потерянный' || lower === 'lost') return 'Потерянный';
  if (lower === 'новый' || lower === 'new') return 'Новый';
  if (lower === 'без закупок' || lower === 'none') return 'Без закупок';
  return c || null;
};

// 1) Login → JWT cookie
async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
    redirect: 'manual',
  });
  if (res.status >= 400) {
    const t = await res.text();
    throw new Error(`Login failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('No set-cookie from login');
  // Cookie називається sp_session (не session). Витягуємо name=value.
  const match = setCookie.match(/(sp_session=[^;]+)/);
  if (!match) throw new Error('No sp_session cookie in: ' + setCookie.slice(0, 200));
  return match[1];
}

// 2) Action 5: getRegionData → всі менеджери компанії
async function getAllManagers(cookie) {
  const periodKey = PERIOD_MONTH.slice(0, 7); // YYYY-MM
  const res = await fetch(`${BASE_URL}/api/onec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL, cookie },
    body: JSON.stringify({ action: 'getRegionData', payload: { period: periodKey } }),
  });
  const json = await res.json();
  if (json.status !== 'success') throw new Error(`Action 5 failed: ${JSON.stringify(json)}`);
  const managers = [];
  for (const region of json.data.regions ?? []) {
    for (const m of region.managers ?? []) {
      if (m.managerLogin) {
        managers.push({
          login: String(m.managerLogin).toLowerCase().trim(),
          name: m.managerName,
          regionName: region.regionName,
          regionCode: region.regionCode,
        });
      }
    }
  }
  // Dedup (Пашковська у двох регіонах)
  const seen = new Set();
  return managers.filter(m => {
    if (seen.has(m.login)) return false;
    seen.add(m.login);
    return true;
  });
}

// 3) Action 2: getClientsForPlanning → клієнти менеджера з purchases per segment
async function getClientsForManager(cookie, login) {
  const res = await fetch(`${BASE_URL}/api/onec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL, cookie },
    body: JSON.stringify({ action: 'getClientsForPlanning', payload: { login } }),
  });
  const json = await res.json();
  if (json.status !== 'success') {
    console.warn(`  Action 2 failed for ${login}: ${json.message || 'unknown'}`);
    return [];
  }
  return json.data.clients ?? [];
}

// 4) Розщеплення по сегментах + по 3-месячному правилу
function buildSegmentBuckets(clients) {
  // Map<segmentCode, { active: [], sleeping: [] }>
  const bySeg = new Map();
  for (const c of clients) {
    if (!c.clientId) continue;
    for (const p of c.purchases ?? []) {
      const segCode = p.segmentCode === 'ДРУГИЕТМ' ? 'OTHER' : p.segmentCode;
      if (!segCode) continue;
      if (!bySeg.has(segCode)) bySeg.set(segCode, { active: [], sleeping: [] });
      const bucket = bySeg.get(segCode);
      const clientObj = {
        clientId1c: c.clientId,
        clientName: c.clientName,
        category1c: cat1cToText(c.category),
        lastPurchaseDate: p.lastPurchaseDate || null,
        lastPurchaseAmount: p.lastPurchaseAmount,
      };
      if (isRecentBrandPurchase(p.lastPurchaseDate)) bucket.active.push(clientObj);
      else bucket.sleeping.push(clientObj);
    }
  }
  return bySeg;
}

// 5) POST init-snapshot для одного (manager × segment)
async function postSnapshot(cookie, manager, segCode, active, sleeping) {
  const res = await fetch(`${BASE_URL}/api/planning/init-snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL, cookie },
    body: JSON.stringify({
      periodId: PERIOD_ID,
      period: { weekStart: PERIOD_WEEK_START, weekEnd: PERIOD_WEEK_END, month: PERIOD_MONTH },
      segmentCode: segCode,
      targetLogin: manager.login,
      userMeta: {
        fullName: manager.name,
        role: 'manager',
        region: manager.regionName,
        regionCode: manager.regionCode,
      },
      forecasts: active,
      gapClosures: sleeping,
      source: 'backfill',
    }),
  });
  return await res.json();
}

// === MAIN ===
console.log(`Backfill snapshot for period_id=${PERIOD_ID} (${PERIOD_MONTH})\n`);

const cookie = await login();
console.log('✓ Logged in');

const managers = await getAllManagers(cookie);
console.log(`✓ ${managers.length} unique managers from Action 5`);

let totalSnapshots = 0;
let totalForecasts = 0;
let totalGaps = 0;
let totalErrors = 0;

for (let i = 0; i < managers.length; i++) {
  const m = managers[i];
  process.stdout.write(`[${i + 1}/${managers.length}] ${m.name} (${m.login}) ... `);
  try {
    const clients = await getClientsForManager(cookie, m.login);
    const bySeg = buildSegmentBuckets(clients);
    let segCount = 0;
    for (const [segCode, bucket] of bySeg) {
      const r = await postSnapshot(cookie, m, segCode, bucket.active, bucket.sleeping);
      if (r.success) {
        totalForecasts += r.inserted?.forecast ?? 0;
        totalGaps += r.inserted?.gap ?? 0;
        segCount += 1;
      } else {
        console.warn(`\n  segment ${segCode}: ${r.error || 'unknown'}`);
        totalErrors += 1;
      }
      // Маленька пауза щоб не перевантажити 1С/Vercel
      await new Promise(r => setTimeout(r, 100));
    }
    totalSnapshots += segCount;
    process.stdout.write(`${segCount} segments OK\n`);
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    totalErrors += 1;
  }
}

console.log('\n━━━ DONE ━━━');
console.log(`Manager × segment snapshots: ${totalSnapshots}`);
console.log(`Inserted forecast rows: ${totalForecasts}`);
console.log(`Inserted gap rows: ${totalGaps}`);
console.log(`Errors: ${totalErrors}`);
console.log('\nVerify у Supabase:');
console.log(`  SELECT COUNT(*), block_type FROM planning_snapshots WHERE period_id=${PERIOD_ID} GROUP BY block_type;`);
