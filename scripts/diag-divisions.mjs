/**
 * Діагностика: які саме підрозділи повертає 1С через Action 4 і Action 5.
 *
 * Виводить:
 *  - Action 4 (getRegistryPlans): всі унікальні divisionName що йдуть з реєстру планів
 *  - Action 5 (getRegionData): чи є фактy для не-представництв (поточний місяць)
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
const BASE = process.env.ONEC_BASE_URL;
const LOGIN = process.env.ONEC_LOGIN;
const PASS = process.env.ONEC_PASSWORD;
const AUTH = LOGIN && PASS ? 'Basic ' + Buffer.from(`${LOGIN}:${PASS}`).toString('base64') : null;

async function callOnec(action, payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH) headers.Authorization = AUTH;
  const r = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { error: `non-JSON response: ${text.slice(0, 200)}` }; }
}

// === Action 4: getRegistryPlans — всі плани з реєстру ===
const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const dateFrom = `${y}-${m}-01`;
const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
const dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

console.log(`\n=== Action 4: getRegistryPlans (${dateFrom} … ${dateTo}) ===`);
const a4 = await callOnec('getRegistryPlans', { dateFrom, dateTo });
if (a4.status === 'success' && Array.isArray(a4.data?.plans)) {
  const divisions = {};
  for (const p of a4.data.plans) {
    const name = p.divisionName || '(порожньо)';
    const code = p.divisionCode || '(нема code)';
    const key = `${name} [${code}]`;
    if (!divisions[key]) divisions[key] = { plans: 0, totalUsd: 0, managers: new Set(), segments: new Set() };
    divisions[key].plans++;
    divisions[key].totalUsd += Number(p.planAmountUSD || 0);
    if (p.managerLogin) divisions[key].managers.add(p.managerLogin);
    if (p.segmentCode) divisions[key].segments.add(p.segmentCode);
  }
  console.log(`Total plans: ${a4.data.plans.length}, divisions: ${Object.keys(divisions).length}\n`);
  const sorted = Object.entries(divisions).sort((a, b) => b[1].totalUsd - a[1].totalUsd);
  for (const [name, d] of sorted) {
    console.log(`  ${name.padEnd(45)} plans=${String(d.plans).padStart(4)}  Σ=$${d.totalUsd.toFixed(0).padStart(10)}  manaders=${d.managers.size}  segments=${d.segments.size}`);
  }
} else {
  console.log('  Помилка:', JSON.stringify(a4).slice(0, 300));
}

// === Action 5: getRegionData — без includeAll (стара поведінка) ===
console.log(`\n=== Action 5: getRegionData (${y}-${m}, login=director, БЕЗ includeAll) ===`);
const a5old = await callOnec('getRegionData', { login: 'sdu@emet.in.ua', period: `${y}-${m}` });
if (a5old.status === 'success' && Array.isArray(a5old.data?.regions)) {
  console.log(`Total regions returned: ${a5old.data.regions.length}\n`);
  for (const r of a5old.data.regions) {
    const n = (v) => Number(v || 0);
    const totalPlan = r.managers.reduce((s, m) => s + n(m.totalPlan), 0);
    const totalFact = r.managers.reduce((s, m) => s + n(m.totalFact), 0);
    const totalPrev = r.managers.reduce((s, m) => s + n(m.totalPrevMonthFact), 0);
    console.log(`  ${(r.regionName || '?').padEnd(35)} [code=${r.regionCode || '—'}]  managers=${String(r.managers.length).padStart(2)}  план=$${totalPlan.toFixed(0).padStart(10)}  факт=$${totalFact.toFixed(0).padStart(10)}  мин.міс=$${totalPrev.toFixed(0).padStart(10)}`);
  }
} else {
  console.log('  Помилка:', JSON.stringify(a5old).slice(0, 300));
}

// === Action 5: getRegionData — З includeAll: true (нова поведінка, чекаємо Андрія) ===
console.log(`\n=== Action 5: getRegionData (${y}-${m}, login=director, includeAll=true) ===`);
const a5all = await callOnec('getRegionData', { login: 'sdu@emet.in.ua', period: `${y}-${m}`, includeAll: true });
if (a5all.status === 'success' && Array.isArray(a5all.data?.regions)) {
  console.log(`Total regions returned: ${a5all.data.regions.length}\n`);
  for (const r of a5all.data.regions) {
    const n = (v) => Number(v || 0);
    const totalPlan = r.managers.reduce((s, m) => s + n(m.totalPlan), 0);
    const totalFact = r.managers.reduce((s, m) => s + n(m.totalFact), 0);
    const totalPrev = r.managers.reduce((s, m) => s + n(m.totalPrevMonthFact), 0);
    console.log(`  ${(r.regionName || '?').padEnd(35)} [code=${r.regionCode || '—'}]  managers=${String(r.managers.length).padStart(2)}  план=$${totalPlan.toFixed(0).padStart(10)}  факт=$${totalFact.toFixed(0).padStart(10)}  мин.міс=$${totalPrev.toFixed(0).padStart(10)}`);
  }
  // Підсумкова порівнялка
  const oldCount = a5old.data?.regions?.length || 0;
  const newCount = a5all.data.regions.length;
  console.log(`\n📊 Порівняння: без includeAll=${oldCount}, з includeAll=${newCount}`);
  if (newCount > oldCount) {
    console.log(`✅ Андрій реалізував includeAll — отримуємо +${newCount - oldCount} підрозділів`);
  } else if (newCount === oldCount) {
    console.log(`⏳ includeAll ігнорується (стара поведінка) — Андрій ще не задеплоїв`);
  }
} else {
  console.log('  Помилка:', JSON.stringify(a5all).slice(0, 300));
}
