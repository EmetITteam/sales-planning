/**
 * Перевірка: чи сума категорій (active+sleeping+lost+new+none) per manager
 * = totalClients у відповіді 1С v2.5? Або там розбіжність?
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

if (d.status !== 'success') { console.error(d); process.exit(1); }

const toNum = (v) => typeof v === 'string' ? Number(v) || 0 : (v ?? 0);

console.log('=== Per-manager check: sum categories == totalClients? ===\n');
let totalMgrsOk = 0, totalMgrsMismatch = 0;
let aggTotalClients = 0;
let aggCatSum = 0;

for (const reg of d.data.regions) {
  for (const m of reg.managers) {
    if (!m.clientStats) continue;
    const cs = m.clientStats;
    const sumCats = toNum(cs.active?.total) + toNum(cs.sleeping?.total) + toNum(cs.lost?.total) + toNum(cs.new?.total) + toNum(cs.none?.total);
    const totalC = toNum(cs.totalClients);
    aggTotalClients += totalC;
    aggCatSum += sumCats;
    if (sumCats !== totalC) {
      totalMgrsMismatch++;
      if (totalMgrsMismatch <= 5) {
        console.log(`MISMATCH ${reg.regionName} · ${m.managerName}: sumCats=${sumCats} vs totalClients=${totalC} (diff=${sumCats - totalC})`);
        console.log(`  active=${cs.active?.total}, sleeping=${cs.sleeping?.total}, lost=${cs.lost?.total}, new=${cs.new?.total}, none=${cs.none?.total}`);
      }
    } else {
      totalMgrsOk++;
    }
  }
}

console.log(`\n=== Aggregate ===`);
console.log(`Менеджерів зі співпадінням: ${totalMgrsOk}`);
console.log(`Менеджерів з розбіжністю: ${totalMgrsMismatch}`);
console.log(`Сума totalClients (всі менеджери): ${aggTotalClients}`);
console.log(`Сума категорій (всі менеджери): ${aggCatSum}`);
console.log(`Різниця: ${aggCatSum - aggTotalClients}`);

// Окремо Представництва
const REPS = ['Київ', 'Дніпро', 'Одеса', 'Харків', 'Запоріжжя', 'Вінниця', 'Миколаєв', 'Житомир'];
let repsTotalClients = 0, repsCatSum = 0, repsTotalBought = 0;
let repsActive = 0, repsSleeping = 0, repsLost = 0, repsNew = 0, repsNone = 0;
for (const reg of d.data.regions) {
  if (!REPS.includes(reg.regionName)) continue;
  for (const m of reg.managers) {
    if (!m.clientStats) continue;
    const cs = m.clientStats;
    repsTotalClients += toNum(cs.totalClients);
    repsTotalBought  += toNum(cs.totalBought);
    repsActive   += toNum(cs.active?.total);
    repsSleeping += toNum(cs.sleeping?.total);
    repsLost     += toNum(cs.lost?.total);
    repsNew      += toNum(cs.new?.total);
    repsNone     += toNum(cs.none?.total);
    repsCatSum += toNum(cs.active?.total) + toNum(cs.sleeping?.total) + toNum(cs.lost?.total) + toNum(cs.new?.total) + toNum(cs.none?.total);
  }
}
console.log(`\n=== Тільки Представництва (8 регіонів) ===`);
console.log(`totalClients (сума): ${repsTotalClients}`);
console.log(`Active total: ${repsActive}`);
console.log(`Sleeping total: ${repsSleeping}`);
console.log(`Lost total: ${repsLost}`);
console.log(`New total: ${repsNew}`);
console.log(`None total: ${repsNone}`);
console.log(`Сума категорій: ${repsCatSum}`);
console.log(`totalBought (сума): ${repsTotalBought}`);
