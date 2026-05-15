// Resnapshot: перерахувати бакети клієнтів у плані менеджера по новій логіці
// isActiveForBrand (last_buy >= cutoff, без upper bound).
//
// Що робить:
//   1. Для кожного (login × segment × period) з НЕ finalized плану:
//      - Тягне з 1С Action 2 (getClientsForPlanning) — актуальні дати покупок
//      - Кожен клієнт у forecasts/gap_closures — перевіряємо чи у правильному бакеті
//      - Якщо у неправильному → переносимо (видаляємо з одного, додаємо у інший)
//   2. НЕ чіпає finalized плани (вони зафіксовані менеджером).
//   3. Зберігає amount/stage/comment/etc. — лише переносить між таблицями.
//
// DRY_RUN=true за замовчуванням. Для apply: DRY_RUN=0.
// TARGET_LOGIN=<login> — обмежити одним менеджером (для тестування).

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

const BASE_URL = process.env.QA_URL ?? 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.BACKFILL_LOGIN ?? 'sdu@emet.in.ua';
const PASSWORD = process.env.BACKFILL_PASSWORD;
const SBURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SBKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_LOGIN = (process.env.TARGET_LOGIN || '').toLowerCase().trim();
const DRY_RUN = process.env.DRY_RUN !== '0';
const PERIOD_ID = parseInt(process.env.PERIOD_ID || '20260531', 10);
const PLAN_MONTH = process.env.PLAN_MONTH || '2026-05';

if (!PASSWORD || !SBURL || !SBKEY) {
  console.error('Required env: BACKFILL_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SBH = { apikey: SBKEY, Authorization: `Bearer ${SBKEY}` };
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const PLAN_MONTH_START_MS = (() => {
  const [y, m] = PLAN_MONTH.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
})();
const CUTOFF_MS = PLAN_MONTH_START_MS - THREE_MONTHS_MS;

function isActiveForBrand(lastPurchaseDate) {
  if (!lastPurchaseDate) return false;
  const [y, m, d] = String(lastPurchaseDate).split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime() >= CUTOFF_MS;
}

// Маппинг 1С segmentCode → наш UI код (як у onec-adapters.mapSegmentCode).
const SEGMENT_CODE_MAP = {
  'Petaran': 'PETARAN', 'ПЕТАРАН': 'PETARAN', 'PETARAN': 'PETARAN',
  'Ellanse': 'ELLANSE', 'ЭЛЛАНСЭ': 'ELLANSE', 'ELLANSE': 'ELLANSE',
  'Vitaran': 'VITARAN', 'ВИТАРАН': 'VITARAN', 'VITARAN': 'VITARAN',
  'Neuramis': 'NEURAMIS', 'НЕЙРАМИС': 'NEURAMIS', 'NEURAMIS': 'NEURAMIS',
  'Neuronox': 'NEURONOX', 'НЕЙРОНОКС': 'NEURONOX', 'NEURONOX': 'NEURONOX',
  'Esse': 'ESSE', 'ЭССЭ': 'ESSE', 'ESSE': 'ESSE',
  'Exoxe': 'EXOXE', 'ЭКЗОКСЭ': 'EXOXE', 'EXOXE': 'EXOXE',
  'IUSE': 'IUSE',
};
const mapSegmentCode = (c) => SEGMENT_CODE_MAP[c] || 'OTHER';

// ─── 1. Login як Director ───
console.log(`\n━━━ Login як ${LOGIN} ━━━`);
const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
  body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`❌ Login failed: ${loginRes.status} ${await loginRes.text()}`);
  process.exit(1);
}
const setCookie = loginRes.headers.get('set-cookie') ?? '';
const cookie = setCookie.split(/,\s*(?=[\w-]+=)/).map(c => c.split(';')[0]).join('; ');
console.log(`✓ Logged in`);

// ─── 2. Збираємо логіни з планами (forecasts ∪ gap_closures) ───
console.log(`\n━━━ Збираємо логіни з планами ━━━`);
async function fetchAll(table, fields) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${SBURL}/rest/v1/${table}?select=${fields}&period_id=eq.${PERIOD_ID}&archived_at=is.null`,
      { headers: { ...SBH, Range: `${from}-${from + 999}` } },
    );
    const rows = await r.json();
    if (!Array.isArray(rows)) { console.error('fetch failed:', rows); process.exit(1); }
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const [forecasts, gaps, summaries] = await Promise.all([
  fetchAll('forecasts', '*'),
  fetchAll('gap_closures', '*'),
  fetchAll('period_summaries', 'user_id,segment_code,finalized_at'),
]);

// Set (login|segment) які finalized — НЕ чіпаємо.
const finalizedPairs = new Set();
for (const s of summaries) {
  if (s.finalized_at) finalizedPairs.add(`${s.user_id}|${s.segment_code}`);
}

// Group rows by (login × segment).
const groups = new Map();
function addToGroup(table, row) {
  const key = `${row.user_id}|${row.segment_code}`;
  if (!groups.has(key)) groups.set(key, { user_id: row.user_id, segment_code: row.segment_code, forecasts: [], gaps: [] });
  groups.get(key)[table].push(row);
}
for (const f of forecasts) addToGroup('forecasts', f);
for (const g of gaps) addToGroup('gaps', g);

console.log(`  forecasts: ${forecasts.length}, gaps: ${gaps.length}`);
console.log(`  Унікальних (login × segment): ${groups.size}`);
console.log(`  Finalized пар: ${finalizedPairs.size} (не чіпаємо)`);

// ─── 3. Per-manager Action 2 → lastPurchaseDate per (client × segment) ───
const uniqueLogins = new Set();
for (const g of groups.values()) {
  if (TARGET_LOGIN && g.user_id !== TARGET_LOGIN) continue;
  uniqueLogins.add(g.user_id);
}
console.log(`\n━━━ Перевіряємо ${uniqueLogins.size} менеджерів ━━━`);
if (TARGET_LOGIN) console.log(`  (filter TARGET_LOGIN=${TARGET_LOGIN})`);

// Map (login → Map (clientId → Map (segmentCode → lastPurchaseDate)))
const lastBuyMap = new Map();
let i = 0;
for (const login of uniqueLogins) {
  i++;
  process.stdout.write(`  [${i}/${uniqueLogins.size}] ${login}... `);
  const r = await fetch(`${BASE_URL}/api/onec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
    body: JSON.stringify({ action: 'getClientsForPlanning', payload: { login } }),
  });
  if (!r.ok) {
    console.log(`❌ ${r.status}`);
    continue;
  }
  const body = await r.json();
  const clients = body?.data?.clients ?? [];
  const perClient = new Map();
  for (const c of clients) {
    const perSeg = new Map();
    for (const p of (c.purchases || [])) {
      perSeg.set(mapSegmentCode(p.segmentCode), p.lastPurchaseDate);
    }
    perClient.set(c.clientId, perSeg);
  }
  lastBuyMap.set(login, perClient);
  console.log(`${clients.length} клієнтів`);
}

// ─── 4. Для кожного (login × segment) — перевіряємо клієнтів ───
console.log(`\n━━━ План переносу ━━━`);
const plans = [];
for (const g of groups.values()) {
  if (TARGET_LOGIN && g.user_id !== TARGET_LOGIN) continue;
  if (finalizedPairs.has(`${g.user_id}|${g.segment_code}`)) continue; // skip finalized

  const perClient = lastBuyMap.get(g.user_id);
  if (!perClient) continue;

  // Forecast rows → перевіряємо чи мають бути у gap
  for (const f of g.forecasts) {
    if (!f.client_id_1c) continue;
    const lastBuy = perClient.get(f.client_id_1c)?.get(g.segment_code) || null;
    const isActive = isActiveForBrand(lastBuy);
    if (!isActive) {
      plans.push({
        from: 'forecast', to: 'gap',
        login: g.user_id, segment: g.segment_code,
        client_id_1c: f.client_id_1c, client_name: f.client_name,
        forecastRow: f, lastBuy,
        reason: lastBuy ? `last_buy=${lastBuy} < cutoff` : 'no purchase data',
      });
    }
  }
  // Gap rows → перевіряємо чи мають бути у forecast
  for (const gap of g.gaps) {
    if (!gap.client_id_1c) continue;
    const lastBuy = perClient.get(gap.client_id_1c)?.get(g.segment_code) || null;
    const isActive = isActiveForBrand(lastBuy);
    if (isActive) {
      plans.push({
        from: 'gap', to: 'forecast',
        login: g.user_id, segment: g.segment_code,
        client_id_1c: gap.client_id_1c, client_name: gap.client_name,
        gapRow: gap, lastBuy,
        reason: `last_buy=${lastBuy} >= cutoff`,
      });
    }
  }
}

if (plans.length === 0) {
  console.log('  Жодного клієнта не треба переносити — всі у правильних бакетах.');
  process.exit(0);
}

console.log(`  Знайдено ${plans.length} клієнтів для переносу:\n`);
console.log('  Логін                       │ Сегмент    │ Куди              │ Клієнт                       │ Last buy');
console.log('  ────────────────────────────┼────────────┼───────────────────┼──────────────────────────────┼──────────');
const fromForecastCount = plans.filter(p => p.from === 'forecast').length;
const fromGapCount = plans.filter(p => p.from === 'gap').length;
for (const p of plans.slice(0, 50)) {
  const login = p.login.padEnd(28);
  const seg = p.segment.padEnd(10);
  const direction = `${p.from}→${p.to}`.padEnd(18);
  const name = (p.client_name || p.client_id_1c).slice(0, 28).padEnd(28);
  const lb = (p.lastBuy || 'n/a').padEnd(10);
  console.log(`  ${login} │ ${seg} │ ${direction} │ ${name} │ ${lb}`);
}
if (plans.length > 50) console.log(`  ... + ще ${plans.length - 50}`);
console.log(`\n  Підсумок: ${fromForecastCount} forecast→gap, ${fromGapCount} gap→forecast`);

if (DRY_RUN) {
  console.log(`\n⚠️  DRY RUN — нічого не змінено. DRY_RUN=0 для apply.`);
  process.exit(0);
}

// ─── 5. Apply: переносимо ───
console.log(`\n━━━ Виконання переносу ━━━`);
let moved = 0, errors = 0;
for (const p of plans) {
  const ts = new Date().toISOString();
  if (p.from === 'forecast') {
    // Видаляємо forecast (soft) + додаємо у gap_closures.
    const oldRow = p.forecastRow;
    // Insert у gap_closures: переносимо поля.
    const newGap = {
      user_id: oldRow.user_id,
      segment_code: oldRow.segment_code,
      period_id: oldRow.period_id,
      client_id_1c: oldRow.client_id_1c,
      client_name: oldRow.client_name,
      potential_amount: oldRow.forecast_amount,
      category: oldRow.category || null,
      stage: oldRow.stage || null,
      stage_comment: oldRow.stage_comment || null,
      stage_done: oldRow.stage_done || false,
      closure_completed: oldRow.completed || false,
      manually_added: oldRow.manually_added || false,
      training_id: oldRow.training_id || null,
      training_name: oldRow.training_name || null,
      training_date: oldRow.training_date || null,
      deadline: oldRow.training_date || null,
    };
    const r1 = await fetch(`${SBURL}/rest/v1/gap_closures`, {
      method: 'POST', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(newGap),
    });
    if (!r1.ok) { errors++; console.error(`  ❌ ${p.login} ${p.segment} ${p.client_name}: insert gap ${r1.status} ${await r1.text()}`); continue; }
    const r2 = await fetch(`${SBURL}/rest/v1/forecasts?id=eq.${oldRow.id}`, {
      method: 'PATCH', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ archived_at: ts }),
    });
    if (!r2.ok) { errors++; console.error(`  ❌ archive forecast ${oldRow.id}: ${r2.status}`); continue; }
    moved++;
  } else {
    // gap → forecast
    const oldRow = p.gapRow;
    const newForecast = {
      user_id: oldRow.user_id,
      segment_code: oldRow.segment_code,
      period_id: oldRow.period_id,
      client_id_1c: oldRow.client_id_1c,
      client_name: oldRow.client_name,
      forecast_amount: oldRow.potential_amount,
      stage: oldRow.stage || null,
      stage_comment: oldRow.stage_comment || null,
      stage_done: oldRow.stage_done || false,
      completed: oldRow.closure_completed || false,
      manually_added: oldRow.manually_added || false,
      training_id: oldRow.training_id || null,
      training_name: oldRow.training_name || null,
      training_date: oldRow.training_date || null,
    };
    const r1 = await fetch(`${SBURL}/rest/v1/forecasts`, {
      method: 'POST', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(newForecast),
    });
    if (!r1.ok) { errors++; console.error(`  ❌ ${p.login} ${p.segment} ${p.client_name}: insert forecast ${r1.status} ${await r1.text()}`); continue; }
    const r2 = await fetch(`${SBURL}/rest/v1/gap_closures?id=eq.${oldRow.id}`, {
      method: 'PATCH', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ archived_at: ts }),
    });
    if (!r2.ok) { errors++; console.error(`  ❌ archive gap ${oldRow.id}: ${r2.status}`); continue; }
    moved++;
  }
}
console.log(`\n  ✓ Перенесено: ${moved}, помилок: ${errors}`);
