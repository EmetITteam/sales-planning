/**
 * Перевірка цілісності таблиць `sales` і `client_category_history` на живій БД.
 * Рахує summary через Supabase REST і застосовує інваріанти (ті самі, що у
 * src/lib/data-integrity.ts — тут дубльовані як JS, бо .mjs без TS-імпорту).
 *
 * Запуск:  npm run check:data
 * Exit-код 1 якщо є проблеми (для CI / cron-моніторингу).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// .env
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
const H = { apikey: K, Authorization: `Bearer ${K}` };

/** COUNT через Range + Content-Range (head). */
async function count(table, query = '') {
  const r = await fetch(`${U}/rest/v1/${table}?select=id${query}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const cr = r.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}
async function fetchAll(table, cols, query = '') {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${U}/rest/v1/${table}?select=${cols}${query}`, { headers: { ...H, Range: `${from}-${from + PAGE - 1}` } });
    const rows = await r.json();
    if (!Array.isArray(rows)) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ── інваріанти (дзеркало src/lib/data-integrity.ts) ──
function monthGaps(months) {
  const sorted = [...new Set(months)].filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  if (sorted.length < 2) return [];
  const set = new Set(sorted);
  const [ye, me] = sorted[sorted.length - 1].split('-').map(Number);
  let [y, m] = sorted[0].split('-').map(Number);
  const gaps = [];
  while (y < ye || (y === ye && m <= me)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!set.has(key)) gaps.push(key);
    m++; if (m > 12) { m = 1; y++; }
  }
  return gaps;
}

async function main() {
  const now = new Date();
  const cm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const issues = [];

  // ── sales ── (джерело істини — сама таблиця, не rollup)
  const salesTotal = await count('sales');
  const curCount = await count('sales', `&sale_date=gte.${cm}-01&sale_date=lt.${nextMonth(cm)}-01`);
  const unmapped = await count('sales', `&brand=eq.${encodeURIComponent('НЕ_МАПНУТО')}`);
  // Мін/макс дата → рік-покриття (пропущений рік = розрив історії).
  const [first] = await fetchAll('sales', 'sale_date', '&order=sale_date.asc&limit=1');
  const [last] = await fetchAll('sales', 'sale_date', '&order=sale_date.desc&limit=1');
  const minY = first ? new Date(first.sale_date).getUTCFullYear() : now.getUTCFullYear();
  const maxY = last ? new Date(last.sale_date).getUTCFullYear() : now.getUTCFullYear();
  const yearsMissing = [];
  for (let yr = minY; yr <= maxY; yr++) {
    const c = await count('sales', `&sale_date=gte.${yr}-01-01&sale_date=lt.${yr + 1}-01-01`);
    if (c === 0) yearsMissing.push(yr);
  }
  // rollup — лише інфо (борд читає його для поточного року; історія — прямий скан).
  const rollupRows = await fetchAll('sales_kpi_rollup', 'year,month', '&rows_month=gt.0');
  const rollupMonths = [...new Set(rollupRows.map(r => `${r.year}-${String(r.month).padStart(2, '0')}`))];

  console.log('=== SALES ===');
  console.log(`  total: ${salesTotal.toLocaleString()} · роки ${minY}–${maxY} · поточний (${cm}): ${curCount} · НЕ_МАПНУТО: ${unmapped} (${salesTotal ? (unmapped / salesTotal * 100).toFixed(1) : 0}%)`);
  console.log(`  rollup покриває місяців: ${rollupMonths.length} (поточний рік — норма; історія читається прямо з sales)`);
  if (salesTotal <= 0) issues.push('sales: порожня');
  if (curCount <= 0) issues.push(`sales: поточний місяць ${cm} без продажів`);
  if (yearsMissing.length) issues.push(`sales: немає продажів за роки ${yearsMissing.join(', ')}`);
  if (salesTotal > 0 && unmapped / salesTotal > 0.3) issues.push(`sales: ${(unmapped / salesTotal * 100).toFixed(1)}% НЕ_МАПНУТО`);

  // ── client_category_history (активні версії) ──
  const rows = await fetchAll('client_category_history', 'category,manager_login,is_reserved', '&valid_to=is.null');
  const byCategory = {};
  const mgrs = new Set();
  let reservedActive = 0;
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    mgrs.add(r.manager_login);
    if (r.is_reserved) reservedActive++;
  }
  const activeTotal = rows.length;

  console.log('\n=== CLIENT_CATEGORY_HISTORY (активні) ===');
  console.log(`  active-версій: ${activeTotal} · менеджерів: ${mgrs.size} · резерв: ${reservedActive}`);
  console.log('  по категоріях:', JSON.stringify(byCategory));
  const cats = ['active', 'sleeping', 'lost', 'new', 'none'];
  const sum = cats.reduce((a, c) => a + (byCategory[c] || 0), 0);
  if (activeTotal <= 0) issues.push('category: зріз порожній');
  if (sum !== activeTotal) issues.push(`category: сума по категоріях (${sum}) ≠ активних (${activeTotal}) — невідомі категорії`);
  const nonZero = cats.filter(c => (byCategory[c] || 0) > 0);
  if (activeTotal > 50 && nonZero.length <= 1) issues.push(`category: усі в одній категорії (${nonZero[0]}) — баг маппінгу`);
  if (mgrs.size < 2) issues.push(`category: лише ${mgrs.size} менеджер(ів)`);

  // ── дублі активних версій (порушення SCD2) ──
  const ids = await fetchAll('client_category_history', 'client_id', '&valid_to=is.null');
  const seen = new Set(); let dupActive = 0;
  for (const r of ids) { if (seen.has(r.client_id)) dupActive++; seen.add(r.client_id); }
  if (dupActive > 0) issues.push(`category: ${dupActive} клієнтів з >1 активною версією (порушення SCD2)`);
  console.log(`  дублів активних версій: ${dupActive}`);

  // ── підсумок ──
  console.log('\n' + '─'.repeat(50));
  if (issues.length === 0) {
    console.log('✅ Цілісність OK — дані на місці.');
    process.exit(0);
  } else {
    console.log(`❌ Проблеми (${issues.length}):`);
    for (const i of issues) console.log('   · ' + i);
    process.exit(1);
  }
}

function nextMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

main().catch(e => { console.error('check-data-integrity failed:', e.message); process.exit(1); });
