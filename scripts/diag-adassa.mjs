/**
 * Дамп реальних планів Адасси з Action 4 — побачити чому total $8,487.
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

const auth = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');
const r = await fetch(process.env.ONEC_BASE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: auth },
  body: JSON.stringify({ action: 'getRegistryPlans', payload: { dateFrom: '2026-05-01', dateTo: '2026-05-31' } }),
});
const text = await r.text();
console.log(`HTTP ${r.status}, body length: ${text.length}`);
if (!text.trim()) { console.error('Empty body'); process.exit(1); }
if (text.startsWith('<')) { console.error('XML/HTML response:', text.slice(0, 300)); process.exit(1); }
const d = JSON.parse(text);
if (d.status !== 'success') { console.error(d); process.exit(1); }

const ada = d.data.plans.filter(p => p.divisionName === 'Адасса');
console.log(`\nАдасса: ${ada.length} планів\n`);
let total = 0;
for (const p of ada) {
  const amt = Number(p.planAmountUSD || 0);
  total += amt;
  console.log(`  ${p.managerLogin?.padEnd(30) || '(no login)'.padEnd(30)} ${(p.segmentName || p.segmentCode).padEnd(35)} = $${amt.toFixed(2)}`);
}
console.log(`\n  TOTAL = $${total.toFixed(2)}`);
