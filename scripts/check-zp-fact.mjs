// Перевірка коректності класифікації факт vs план для Запоріжжя.
// 1С Action 2 → активні клієнти менеджера, Action 3 → суми покупок.
// Звіряємо buyer×segment пари з forecasts/gap_closures у Supabase.

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const ONEC = process.env.ONEC_BASE_URL;
const ONEC_AUTH = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');

const logins = ['rm.zp@emet.in.ua', 'sm.zp@emet.in.ua'];
const inList = '(' + logins.map(l => `"${l}"`).join(',') + ')';

async function call1C(action, payload) {
  const r = await fetch(ONEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: ONEC_AUTH },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status !== 200) { console.log(`  1С ${action} status=${r.status}`); return null; }
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { console.log(`  1С ${action} bad JSON`); return null; }
}

const fr = await fetch(`${URL}/rest/v1/forecasts?select=user_id,segment_code,client_id_1c,client_name&period_id=eq.20260531&user_id=in.${encodeURIComponent(inList)}`, { headers: H });
const fs2 = await fr.json();
const gr = await fetch(`${URL}/rest/v1/gap_closures?select=user_id,segment_code,client_id_1c,client_name&period_id=eq.20260531&user_id=in.${encodeURIComponent(inList)}`, { headers: H });
const gc = await gr.json();

console.log('━━━ Запоріжжя: factor класифікація у БД vs реальні buyers з 1С ━━━\n');
console.log(`Plan у БД: forecasts=${fs2.length} рядків, gap_closures=${gc.length} рядків\n`);

let grand = { fact: 0, inF: 0, sF: 0, inG: 0, sG: 0, un: 0, sU: 0 };

for (const login of logins) {
  const j2 = await call1C('getClientsForPlanning', { login });
  if (!j2?.data?.clients) { console.log(`${login}: Action 2 fail`); continue; }
  const clientIds = j2.data.clients.map(c => c.clientId);
  const names = new Map(j2.data.clients.map(c => [c.clientId, c.name]));
  const j3 = await call1C('getSalesFact', { login, period: '2026-05', asOfDate: '2026-05-10', clientIds });
  if (!j3?.data?.segments) { console.log(`${login}: Action 3 fail`); continue; }

  const buyerPairs = [];
  for (const s of j3.data.segments) {
    for (const c of (s.clients ?? [])) {
      const amt = Number(c.factAmountUSD) || 0;
      if (amt > 0) buyerPairs.push({ clientId: c.clientId, segment: s.segmentCode, amount: amt });
    }
  }

  const planF = fs2.filter(r => r.user_id === login);
  const planG = gc.filter(r => r.user_id === login);
  const fSet = new Set(planF.map(r => `${r.client_id_1c}|${r.segment_code}`));
  const gSet = new Set(planG.map(r => `${r.client_id_1c}|${r.segment_code}`));

  let inF = 0, inG = 0, un = 0, sF = 0, sG = 0, sU = 0;
  const unEx = [];
  for (const b of buyerPairs) {
    const key = `${b.clientId}|${b.segment}`;
    if (fSet.has(key)) { inF++; sF += b.amount; }
    else if (gSet.has(key)) { inG++; sG += b.amount; }
    else { un++; sU += b.amount; if (unEx.length < 10) unEx.push({ ...b, name: (names.get(b.clientId) || '?').slice(0, 40) }); }
  }

  console.log(`${login}:`);
  console.log(`  Buyer×segment пар (1С):      ${String(buyerPairs.length).padStart(3)}  | Σ=$${Math.round(sF + sG + sU)}`);
  console.log(`  ✓ Є у forecasts (plan):       ${String(inF).padStart(3)}  | Σ=$${Math.round(sF)}`);
  console.log(`  ✓ Є у gap_closures (plan):    ${String(inG).padStart(3)}  | Σ=$${Math.round(sG)}`);
  console.log(`  ✗ НЕ в плані БД:              ${String(un).padStart(3)}  | Σ=$${Math.round(sU)}`);
  if (unEx.length) {
    console.log(`  Хто купив поза планом:`);
    for (const ex of unEx) console.log(`    - ${ex.name.padEnd(42)} / ${ex.segment.padEnd(9)} $${Math.round(ex.amount)}`);
  }
  console.log();
  grand.fact += sF + sG + sU; grand.inF += inF; grand.sF += sF;
  grand.inG += inG; grand.sG += sG; grand.un += un; grand.sU += sU;
}

console.log('━━━ ПІДСУМОК Запоріжжя (обидва менеджери) ━━━');
const pct = v => grand.fact > 0 ? ((v / grand.fact) * 100).toFixed(1) + '%' : '0%';
console.log(`  ✓ Forecast (Активні):    $${Math.round(grand.sF).toString().padStart(7)}  (${pct(grand.sF).padStart(6)})  |  ${grand.inF} пар`);
console.log(`  ✓ GapClosure (Активіз.): $${Math.round(grand.sG).toString().padStart(7)}  (${pct(grand.sG).padStart(6)})  |  ${grand.inG} пар`);
console.log(`  ✗ Незаплановані:         $${Math.round(grand.sU).toString().padStart(7)}  (${pct(grand.sU).padStart(6)})  |  ${grand.un} пар`);
console.log(`  ─────────────────────────────────`);
console.log(`  Всього факт-пар:         $${Math.round(grand.fact).toString().padStart(7)}`);
console.log();
console.log('Дашборд показує: $28,659 / $1,807 / $330 (Активні / Активіз. / Незаплановані).');
console.log('Якщо цифри вище збігаються — класифікація у БД коректна.');
