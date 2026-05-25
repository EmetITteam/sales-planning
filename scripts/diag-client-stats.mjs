/**
 * Перевірка: чи Action 5 повертає clientStats для всіх менеджерів
 * (включно з не-представництвами, з includeAll: true).
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
  body: JSON.stringify({ action: 'getRegionData', payload: { login: 'sdu@emet.in.ua', period: '2026-05', includeAll: true } }),
});
const d = await r.json();

if (d.status !== 'success') {
  console.error('1С error:', d);
  process.exit(1);
}

let withStats = 0, withoutStats = 0;
const samples = [];
for (const region of d.data.regions) {
  for (const m of region.managers) {
    if (m.clientStats) { withStats++; if (samples.length < 4) samples.push({ region: region.regionName, mgr: m.managerName, stats: m.clientStats }); }
    else { withoutStats++; }
  }
}

console.log(`📊 Менеджери з clientStats: ${withStats} / без: ${withoutStats}`);
console.log('\n=== Зразки clientStats ===');
for (const s of samples) {
  console.log(`\n${s.region} · ${s.mgr}`);
  console.log(`  total: ${s.stats.totalClients}, bought: ${s.stats.totalBought}`);
  console.log(`  active:   ${s.stats.active.bought}/${s.stats.active.total}`);
  console.log(`  sleeping: ${s.stats.sleeping.bought}/${s.stats.sleeping.total}`);
  console.log(`  lost:     ${s.stats.lost.bought}/${s.stats.lost.total}`);
  console.log(`  new:      ${s.stats.new.bought}/${s.stats.new.total}`);
  console.log(`  none:     ${s.stats.none.bought}/${s.stats.none.total}`);
}

// Перевіримо чи є clientStats у не-представництв (Колл-центр, Лазерхауз, Адасса, Полтава, Чернівці)
console.log('\n=== Не-представництва (важливо для огляду компанії) ===');
const nonRepNames = ['Коллцентр', 'Лазерхауз', 'Адасса', 'Полтава', 'Черновцы'];
for (const region of d.data.regions) {
  if (!nonRepNames.some(n => region.regionName.includes(n))) continue;
  const totalMgrs = region.managers.length;
  const withStats = region.managers.filter(m => m.clientStats).length;
  console.log(`  ${region.regionName}: ${withStats}/${totalMgrs} менеджерів з clientStats`);
  for (const m of region.managers) {
    if (m.clientStats) {
      console.log(`    ${m.managerName}: total=${m.clientStats.totalClients}, bought=${m.clientStats.totalBought}`);
    }
  }
}
