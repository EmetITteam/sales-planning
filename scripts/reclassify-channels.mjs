/**
 * Пере-класифікація каналу продажів (sales.channel) за підрозділом (division).
 *
 * Причина: раніше detectChannel був 2-канальний (call_center + усе інше →
 * representatives), тому дистриб'ютори (Полтава/Черновцы) та «окремі» підрозділи
 * (Лазерхауз/Адасса/службові) молча потрапляли у representatives і псували
 * стратегію. Нова класифікація (src/lib/strategic-kpi/sales-classifier.ts):
 *   representatives — рівно 8 регіонів
 *   call_center     — Коллцентр
 *   distributors    — Полтава, Черновцы
 *   other           — Лазерхауз, Адасса, службові/promo-рядки (поза периметром)
 *
 * Скрипт оновлює ЛИШЕ колонку channel (дані не чіпає), потім рефрешить
 * sales_kpi_rollup за всі роки. Ідемпотентний — можна ганяти повторно.
 *
 * Запуск:  node scripts/reclassify-channels.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const l of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

// ── дзеркало detectChannel() з sales-classifier.ts (single source там; тут .mjs) ──
const REPRESENTATIVE_DIVISIONS = ['киев', 'одесса', 'днепр', 'харьков', 'винница', 'запорожье', 'николаев', 'житомир'];
const DISTRIBUTOR_DIVISIONS = ['полтава', 'черновцы'];
function detectChannel(division) {
  const d = (division || '').toLowerCase().trim();
  if (d.includes('коллцентр') || d.includes('call center') || d.includes('call-center')) return 'call_center';
  const norm = d.replace(/\*+$/, '').trim();
  if (REPRESENTATIVE_DIVISIONS.includes(norm)) return 'representatives';
  if (DISTRIBUTOR_DIVISIONS.includes(norm)) return 'distributors';
  return 'other';
}

async function countBy(channel) {
  const r = await fetch(`${U}/rest/v1/sales?select=id&channel=eq.${channel}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const cr = r.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

async function main() {
  console.log('=== ДО пере-класифікації (рядків по каналах) ===');
  for (const ch of ['representatives', 'call_center', 'distributors', 'other']) {
    console.log(`  ${ch.padEnd(16)} ${(await countBy(ch)).toLocaleString()}`);
  }

  // 1. Усі distinct division (сканом по колонці).
  console.log('\nЗбираю distinct division…');
  const divs = new Set();
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${U}/rest/v1/sales?select=division`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const x of rows) divs.add(x.division ?? null);
    if (rows.length < 1000) break;
  }
  console.log(`  Знайдено ${divs.size} унікальних division.`);

  // 2. Для кожного division — PATCH channel там де він відрізняється.
  console.log('\nОновлюю channel по division:');
  let totalChanged = 0;
  for (const div of divs) {
    const ch = detectChannel(div);
    const divFilter = div === null ? 'division=is.null' : `division=eq.${encodeURIComponent(div)}`;
    const url = `${U}/rest/v1/sales?${divFilter}&channel=neq.${ch}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'count=exact, return=minimal' },
      body: JSON.stringify({ channel: ch }),
    });
    if (!r.ok) { console.log(`  ⚠️ ${String(div)} → ${ch}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
    const cr = r.headers.get('content-range');
    const n = cr ? parseInt(cr.split('/')[1], 10) : 0;
    if (n > 0) { console.log(`  ${String(div ?? '(null)').padEnd(36)} → ${ch.padEnd(14)} ${n} рядків`); totalChanged += n; }
  }
  console.log(`\nВсього змінено channel: ${totalChanged.toLocaleString()} рядків.`);

  console.log('\n=== ПІСЛЯ ===');
  for (const ch of ['representatives', 'call_center', 'distributors', 'other']) {
    console.log(`  ${ch.padEnd(16)} ${(await countBy(ch)).toLocaleString()}`);
  }

  // 3. Рефреш rollup за всі роки (борд читає sales_kpi_rollup).
  console.log('\nРефрешу sales_kpi_rollup за роки 2022..2026…');
  for (let y = 2022; y <= 2026; y++) {
    const r = await fetch(`${U}/rest/v1/rpc/refresh_kpi_rollup`, { method: 'POST', headers: H, body: JSON.stringify({ p_year: y }) });
    console.log(`  ${y}: ${r.ok ? 'ok' : 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 100)}`);
  }
  console.log('\n✅ Готово. Оновіть борд «Стратегія».');
}

main().catch(e => { console.error('reclassify failed:', e.message); process.exit(1); });
