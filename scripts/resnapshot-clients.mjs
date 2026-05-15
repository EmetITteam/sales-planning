// Resnapshot v2 (історичний по Action 3): перерахувати бакети клієнтів
// у плані менеджера на стан 30.04.2026 23:59 (ніч перед плановим травнем).
//
// Логіка:
//   - Active по бренду = клієнт купував саме цей бренд хоч раз у вікні
//     [planMonthStart - 90 днів, planMonthStart). Тобто [Feb 1, May 1).
//   - Покупки у плановому місяці НЕ беруться (бо вони зміщують класифікацію).
//   - 1С-категорія тут НЕ дивиться — лише факт покупки бренду у вікні.
//
// Як отримуємо «купував у вікні» без історичних даних в Action 2:
//   - Action 3 (getSalesFact) приймає period='YYYY-MM' і повертає клієнтів
//     які купили саме цей сегмент у тому місяці.
//   - Запитуємо 3 місяці: 2026-02, 2026-03, 2026-04 для кожного (login).
//   - Объединяємо clientId-и → це наш "active" set per (login, segment).
//
// Що робить:
//   1. Тягне planned rows з Supabase (forecasts + gap_closures, archived=null,
//      finalized=null).
//   2. Для кожного login робить 3 Action 3 виклики (за Feb/Mar/Apr).
//   3. Перевіряє кожен row: чи у правильному бакеті?
//      - row у forecasts, клієнт НЕ у active set → перенести у gap
//      - row у gap_closures, клієнт У active set → перенести у forecasts
//   4. Зберігає всі інші поля (amount, stage, comment) при переносі.
//
// DRY_RUN=true за замовч. TARGET_LOGIN — фільтр одного менеджера.

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

// Вікно 3 місяців перед плановим: для PLAN_MONTH=2026-05 → [2026-02, 2026-03, 2026-04]
function getWindowMonths(planMonth) {
  const [y, m] = planMonth.split('-').map(Number);
  const months = [];
  for (let offset = 3; offset >= 1; offset--) {
    const d = new Date(y, m - 1 - offset, 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yy}-${mm}`);
  }
  return months;
}
const WINDOW_MONTHS = getWindowMonths(PLAN_MONTH);
console.log(`\n━━━ Вікно «активний по бренду»: ${WINDOW_MONTHS.join(', ')} ━━━`);

// ─── 1. Login ───
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

// ─── 2. Тягнемо planned rows ───
async function fetchAll(table, fields) {
  const out = [];
  const archivedFilter = table === 'period_summaries' ? '' : '&archived_at=is.null';
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${SBURL}/rest/v1/${table}?select=${fields}&period_id=eq.${PERIOD_ID}${archivedFilter}`,
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
console.log(`  Унікальних (login × segment): ${groups.size}, finalized: ${finalizedPairs.size}`);

// ─── 3. Для кожного login → Action 3 за 3 місяці ───
const uniqueLogins = new Set();
for (const g of groups.values()) {
  if (TARGET_LOGIN && g.user_id !== TARGET_LOGIN) continue;
  if (finalizedPairs.has(`${g.user_id}|${g.segment_code}`)) continue;
  uniqueLogins.add(g.user_id);
}
console.log(`\n━━━ ${uniqueLogins.size} менеджерів × 3 місяці = ${uniqueLogins.size * 3} запитів 1С ━━━`);
if (TARGET_LOGIN) console.log(`  (filter TARGET_LOGIN=${TARGET_LOGIN})`);

// Map: login → segment → Set(clientId) of active у вікні.
const activeBuyersMap = new Map();
let i = 0;
for (const login of uniqueLogins) {
  i++;
  activeBuyersMap.set(login, new Map());
  process.stdout.write(`  [${i}/${uniqueLogins.size}] ${login}\n`);

  // Спершу витягуємо clientIds менеджера через Action 2 (потрібно для Action 3).
  const clientsRes = await fetch(`${BASE_URL}/api/onec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
    body: JSON.stringify({ action: 'getClientsForPlanning', payload: { login } }),
  });
  if (!clientsRes.ok) {
    console.log(`    ❌ Action 2: ${clientsRes.status}`);
    continue;
  }
  const clientsBody = await clientsRes.json();
  const allClientIds = (clientsBody?.data?.clients || []).map(c => c.clientId);
  if (allClientIds.length === 0) {
    console.log(`    ❌ Нема клієнтів`);
    continue;
  }

  // Action 3 per month — повертає facts[] з .clients[]
  for (const period of WINDOW_MONTHS) {
    const r = await fetch(`${BASE_URL}/api/onec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
      body: JSON.stringify({ action: 'getSalesFact', payload: { login, period, clientIds: allClientIds } }),
    });
    if (!r.ok) {
      console.log(`    ❌ ${period}: ${r.status}`);
      continue;
    }
    const body = await r.json();
    // ⚠️ Action 3 повертає `data.segments`, не `data.facts` (наш адаптер
    // перейменовує у `.facts`, але прокси /api/onec повертає raw 1С response).
    const segments = body?.data?.segments || body?.data?.facts || [];
    // 1С код → UI код
    const SEG_MAP = {
      Petaran: 'PETARAN', Ellanse: 'ELLANSE', Vitaran: 'VITARAN',
      Neuramis: 'NEURAMIS', Neuronox: 'NEURONOX', Esse: 'ESSE',
      Exoxe: 'EXOXE', IUSE: 'IUSE',
    };
    for (const seg of segments) {
      const segCode = SEG_MAP[seg.segmentCode] || 'OTHER';
      const set = activeBuyersMap.get(login).get(segCode) || new Set();
      for (const buyer of (seg.clients || [])) {
        const amt = typeof buyer.factAmountUSD === 'number' ? buyer.factAmountUSD : parseFloat(buyer.factAmountUSD || '0');
        if (amt > 0) set.add(buyer.clientId);
      }
      activeBuyersMap.get(login).set(segCode, set);
    }
    const totalBuyers = segments.reduce((s, f) => s + (f.clients || []).length, 0);
    process.stdout.write(`    ${period}: ${totalBuyers} buyers across ${segments.length} segments\n`);
  }
}

// ─── 4. Перевіряємо кожен row ───
console.log(`\n━━━ План переносу ━━━`);
const plans = [];
for (const g of groups.values()) {
  if (TARGET_LOGIN && g.user_id !== TARGET_LOGIN) continue;
  if (finalizedPairs.has(`${g.user_id}|${g.segment_code}`)) continue;
  const activeSet = activeBuyersMap.get(g.user_id)?.get(g.segment_code) || new Set();

  // Forecast → gap (клієнт не купував у вікні)
  for (const f of g.forecasts) {
    if (!f.client_id_1c) continue;
    if (!activeSet.has(f.client_id_1c)) {
      plans.push({
        from: 'forecast', to: 'gap',
        login: g.user_id, segment: g.segment_code,
        client_id_1c: f.client_id_1c, client_name: f.client_name,
        forecastRow: f,
        reason: 'не купував бренд у [Feb 1, May 1)',
      });
    }
  }
  // Gap → forecast (клієнт купував у вікні)
  for (const gap of g.gaps) {
    if (!gap.client_id_1c) continue;
    if (activeSet.has(gap.client_id_1c)) {
      plans.push({
        from: 'gap', to: 'forecast',
        login: g.user_id, segment: g.segment_code,
        client_id_1c: gap.client_id_1c, client_name: gap.client_name,
        gapRow: gap,
        reason: 'купував бренд у [Feb 1, May 1)',
      });
    }
  }
}

if (plans.length === 0) {
  console.log('  Жодного клієнта не треба переносити.');
  process.exit(0);
}

const fromForecastCount = plans.filter(p => p.from === 'forecast').length;
const fromGapCount = plans.filter(p => p.from === 'gap').length;
console.log(`  Знайдено ${plans.length} клієнтів для переносу:\n`);
console.log('  Логін                       │ Сегмент    │ Куди              │ Клієнт                       │ Причина');
console.log('  ────────────────────────────┼────────────┼───────────────────┼──────────────────────────────┼──────────');
for (const p of plans.slice(0, 80)) {
  const login = p.login.padEnd(28);
  const seg = p.segment.padEnd(10);
  const dir = `${p.from}→${p.to}`.padEnd(18);
  const name = (p.client_name || p.client_id_1c).slice(0, 28).padEnd(28);
  console.log(`  ${login} │ ${seg} │ ${dir} │ ${name} │ ${p.reason}`);
}
if (plans.length > 80) console.log(`  ... + ще ${plans.length - 80}`);
console.log(`\n  Підсумок: ${fromForecastCount} forecast→gap, ${fromGapCount} gap→forecast`);

if (DRY_RUN) {
  console.log(`\n⚠️  DRY RUN — нічого не змінено. DRY_RUN=0 для apply.`);
  process.exit(0);
}

// ─── 5. Apply ───
console.log(`\n━━━ Виконання переносу ━━━`);
let moved = 0, errors = 0;
const ts = new Date().toISOString();
for (const p of plans) {
  if (p.from === 'forecast') {
    const old = p.forecastRow;
    const newGap = {
      user_id: old.user_id,
      segment_code: old.segment_code,
      period_id: old.period_id,
      client_id_1c: old.client_id_1c,
      client_name: old.client_name,
      potential_amount: old.forecast_amount,
      category: old.category || null,
      stage: old.stage || null,
      stage_comment: old.stage_comment || null,
      stage_done: old.stage_done || false,
      closure_completed: old.completed || false,
      manually_added: old.manually_added || false,
      training_id: old.training_id || null,
      training_name: old.training_name || null,
      training_date: old.training_date || null,
      deadline: old.training_date || null,
    };
    const r1 = await fetch(`${SBURL}/rest/v1/gap_closures`, {
      method: 'POST', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(newGap),
    });
    if (!r1.ok) { errors++; console.error(`  ❌ insert gap ${old.id}: ${r1.status} ${await r1.text()}`); continue; }
    const r2 = await fetch(`${SBURL}/rest/v1/forecasts?id=eq.${old.id}`, {
      method: 'PATCH', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ archived_at: ts }),
    });
    if (!r2.ok) { errors++; console.error(`  ❌ archive forecast ${old.id}: ${r2.status}`); continue; }
    moved++;
  } else {
    const old = p.gapRow;
    const newForecast = {
      user_id: old.user_id,
      segment_code: old.segment_code,
      period_id: old.period_id,
      client_id_1c: old.client_id_1c,
      client_name: old.client_name,
      forecast_amount: old.potential_amount,
      stage: old.stage || null,
      stage_comment: old.stage_comment || null,
      stage_done: old.stage_done || false,
      completed: old.closure_completed || false,
      manually_added: old.manually_added || false,
      training_id: old.training_id || null,
      training_name: old.training_name || null,
      training_date: old.training_date || null,
    };
    const r1 = await fetch(`${SBURL}/rest/v1/forecasts`, {
      method: 'POST', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(newForecast),
    });
    if (!r1.ok) { errors++; console.error(`  ❌ insert forecast ${old.id}: ${r1.status} ${await r1.text()}`); continue; }
    const r2 = await fetch(`${SBURL}/rest/v1/gap_closures?id=eq.${old.id}`, {
      method: 'PATCH', headers: { ...SBH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ archived_at: ts }),
    });
    if (!r2.ok) { errors++; console.error(`  ❌ archive gap ${old.id}: ${r2.status}`); continue; }
    moved++;
  }
}
console.log(`\n  ✓ Перенесено: ${moved}, помилок: ${errors}`);
