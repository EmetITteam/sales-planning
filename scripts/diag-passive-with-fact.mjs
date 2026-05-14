// Live діагностика: пошук комбінацій (passive row + fact > 0).
//
// Сценарій:
//  1. Login як Director (sdu@emet.in.ua) — щоб був доступ до 1С даних будь-кого
//  2. З Supabase зібрати усі forecasts/gap_closures з amount=0 за поточний місяць
//  3. Згрупувати по (login, segment_code)
//  4. Для кожної комбінації викликати /api/onec getSalesFact за травень 2026
//  5. Перевірити чи серед buyers є client_id_1c з passive рядка
//  6. Звіт: «менеджер | бренд | клієнт | факт» — список реальних кейсів
//
// Якщо знайдено хоч одного — підеш у дашборд цього менеджера, drill-down
// у бренд → клієнт має бути у блоці «Незаплановані покупці».
//
// Запуск:  node scripts/diag-passive-with-fact.mjs

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

if (!PASSWORD || !SBURL || !SBKEY) {
  console.error('Required env: BACKFILL_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const PERIOD_MONTH = '2026-05';
const PERIOD_ID = 20260531; // monthly pid для травня 2026 (1-е число + 30 днів = 31)

const SBH = { apikey: SBKEY, Authorization: `Bearer ${SBKEY}` };

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

// ─── 2. Тягнемо passive рядки з Supabase ───
console.log(`\n━━━ Passive рядки за period ${PERIOD_ID} ━━━`);
const fcRes = await fetch(
  `${SBURL}/rest/v1/forecasts?select=user_id,segment_code,client_id_1c,client_name,forecast_amount&forecast_amount=eq.0&period_id=eq.${PERIOD_ID}&archived_at=is.null`,
  { headers: SBH },
);
const passiveForecasts = await fcRes.json();
const gcRes = await fetch(
  `${SBURL}/rest/v1/gap_closures?select=user_id,segment_code,client_id_1c,client_name,potential_amount&potential_amount=eq.0&period_id=eq.${PERIOD_ID}&archived_at=is.null`,
  { headers: SBH },
);
const passiveGaps = await gcRes.json();

console.log(`  forecasts (amount=0): ${passiveForecasts.length}`);
console.log(`  gap_closures (amount=0): ${passiveGaps.length}`);

const allPassive = [
  ...passiveForecasts.map(r => ({ ...r, source: 'forecast' })),
  ...passiveGaps.map(r => ({ ...r, source: 'gap' })),
];

if (allPassive.length === 0) {
  console.log('\n⚠️  Жодного passive рядка не знайдено у Supabase за травень 2026.');
  console.log('   Або фіча ще не використана менеджерами, або період_id інший.');
  process.exit(0);
}

// ─── 3. Групуємо по (login, segment) ───
const byPair = new Map();
for (const r of allPassive) {
  const key = `${r.user_id}|${r.segment_code}`;
  if (!byPair.has(key)) byPair.set(key, { login: r.user_id, segment: r.segment_code, clients: [] });
  byPair.get(key).clients.push({ id: r.client_id_1c, name: r.client_name, source: r.source });
}
console.log(`  Унікальних пар (login × segment): ${byPair.size}`);

// ─── 4. Для кожної пари — getSalesFact ───
console.log(`\n━━━ Cross-reference з 1С фактом ━━━`);
const hits = [];
let i = 0;
for (const { login, segment, clients } of byPair.values()) {
  i++;
  process.stdout.write(`  [${i}/${byPair.size}] ${login} × ${segment}... `);
  const factRes = await fetch(`${BASE_URL}/api/onec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
    body: JSON.stringify({
      action: 'getSalesFact',
      payload: { login, period: PERIOD_MONTH, segmentCodes: [segment] },
    }),
  });
  if (!factRes.ok) {
    console.log(`❌ ${factRes.status}`);
    continue;
  }
  const body = await factRes.json();
  const facts = body?.data?.facts ?? [];
  const seg = facts.find(f => f.segmentCode === segment);
  if (!seg || !seg.clients || seg.clients.length === 0) {
    console.log('факту 0');
    continue;
  }
  // Cross-ref
  const passiveIds = new Set(clients.map(c => c.id));
  const matches = seg.clients.filter(b => passiveIds.has(b.clientId) && b.amount > 0);
  if (matches.length === 0) {
    console.log(`факт ${seg.clients.length} клієнтів, але жоден passive`);
    continue;
  }
  console.log(`🎯 ${matches.length} ХІТ(ів)`);
  for (const m of matches) {
    hits.push({
      login,
      segment,
      clientId: m.clientId,
      clientName: m.clientName,
      factAmount: m.amount,
      source: clients.find(c => c.id === m.clientId)?.source ?? '?',
    });
  }
}

// ─── 5. Звіт ───
console.log(`\n━━━ Результат ━━━`);
if (hits.length === 0) {
  console.log('⚠️  Passive-клієнтів з фактом > 0 наразі НЕМАЄ.');
  console.log('   Логіка перевірена unit-тестами (tests/passive-zero-amount.test.ts).');
  console.log('   Чекаємо природного факту — коли passive клієнт зробить покупку,');
  console.log('   він автоматично з\'явиться у блоці «Незаплановані».');
  process.exit(0);
}

console.log(`🎯 Знайдено ${hits.length} кейс(ів) для verification у UI:\n`);
console.log('  Логін                       │ Бренд      │ Клієнт                       │ Факт      │ Source');
console.log('  ────────────────────────────┼────────────┼──────────────────────────────┼───────────┼────────');
for (const h of hits) {
  const login = h.login.padEnd(27);
  const seg = h.segment.padEnd(10);
  const name = (h.clientName || h.clientId).slice(0, 28).padEnd(28);
  const amt = `$${h.factAmount.toFixed(0)}`.padEnd(9);
  console.log(`  ${login} │ ${seg} │ ${name} │ ${amt} │ ${h.source}`);
}
console.log('\nЯк перевірити у UI:');
console.log('  1. Залогінься як цей менеджер (або як Director і drill-down)');
console.log('  2. Відкрий його dashboard → розгорни картку бренду');
console.log('  3. У drill-down має бути блок «Незаплановані» з цим клієнтом');
