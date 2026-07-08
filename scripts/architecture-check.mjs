#!/usr/bin/env node
/**
 * Architecture invariants check.
 * Перевіряє чи присутні всі критичні файли + експорти + ключові рядки у дашбордах.
 * Якщо щось пропало — виводить помилку і виходить з кодом 1 (CI fails).
 *
 * Запуск:
 *   node scripts/architecture-check.mjs
 *   або через npm: npm run check:arch
 *
 * Опис кожного elementу див. у docs/ARCHITECTURE_INVARIANTS.md.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let errors = [];

// ─────────────────────────────────────────────────────────────────
// 1. Critical files (must exist)
// ─────────────────────────────────────────────────────────────────
const REQUIRED_FILES = [
  // Dashboard structure
  'src/components/dashboard/manager-dashboard.tsx',
  'src/components/dashboard/rm-dashboard.tsx',
  'src/components/dashboard/director-dashboard.tsx',
  // Building blocks
  'src/components/dashboard/brand-row.tsx',
  'src/components/dashboard/region-accordion.tsx',
  'src/components/dashboard/manager-accordion.tsx',
  'src/components/dashboard/brand-region-group.tsx',
  'src/components/dashboard/brand-manager-group.tsx',
  'src/components/dashboard/brand-expanded-details.tsx',
  'src/components/dashboard/client-stats-card.tsx',
  'src/components/dashboard/dashboard-skeleton.tsx',
  'src/components/dashboard/metric-card.tsx',
  // Lib helpers
  'src/lib/onec-adapters.ts',
  'src/lib/region-aggregates.ts',
  'src/lib/unplanned-buyers.ts',
  'src/lib/use-onec-data.ts',
  'src/lib/session.ts',
  'src/lib/rate-limit.ts',
  'src/lib/working-days.ts',
  // API routes
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/logout/route.ts',
  'src/app/api/auth/me/route.ts',
  'src/app/api/onec/route.ts',
  'src/app/api/planning/route.ts',
];

for (const f of REQUIRED_FILES) {
  if (!existsSync(join(ROOT, f))) {
    errors.push(`❌ MISSING FILE: ${f}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Critical exports
// ─────────────────────────────────────────────────────────────────
const REQUIRED_EXPORTS = [
  ['src/components/dashboard/region-accordion.tsx', 'export function RegionAccordion'],
  ['src/components/dashboard/manager-accordion.tsx', 'export function ManagerAccordion'],
  ['src/components/dashboard/brand-region-group.tsx', 'export function BrandRegionGroup'],
  ['src/components/dashboard/brand-region-group.tsx', 'export function pivotBrandsByRegion'],
  ['src/components/dashboard/brand-manager-group.tsx', 'export function BrandManagerGroup'],
  ['src/components/dashboard/brand-manager-group.tsx', 'export function pivotBrandsByManager'],
  ['src/components/dashboard/brand-expanded-details.tsx', 'export function BrandExpandedDetails'],
  ['src/components/dashboard/client-stats-card.tsx', 'export function ClientStatsCard'],
  ['src/lib/region-aggregates.ts', 'export function aggregateRegion'],
  ['src/lib/region-aggregates.ts', 'export function aggregateCompany'],
  ['src/lib/region-aggregates.ts', 'export function aggregateManagers'],
  ['src/lib/region-aggregates.ts', 'export function aggregateRegionClientStats'],
  ['src/lib/region-aggregates.ts', 'export function aggregateCompanyClientStats'],
  ['src/lib/unplanned-buyers.ts', 'export function getUnplannedBuyersForSegment'],
  ['src/lib/unplanned-buyers.ts', 'export function categoryLabel'],
  ['src/lib/session.ts', 'export async function getSession'],
  ['src/lib/session.ts', 'export async function setSessionCookie'],
  ['src/lib/onec-adapters.ts', 'export function adaptRegionData'],
  ['src/lib/onec-adapters.ts', 'export function adaptLogin'],
];

for (const [file, exp] of REQUIRED_EXPORTS) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue; // already reported above
  const content = readFileSync(path, 'utf-8');
  if (!content.includes(exp)) {
    errors.push(`❌ MISSING EXPORT in ${file}: "${exp}"`);
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. Critical usages — дашборди мусять рендерити accordion-структури
// ─────────────────────────────────────────────────────────────────
const REQUIRED_USAGES = [
  ['src/components/dashboard/director-dashboard.tsx', 'RegionAccordion', 'Director має рендерити блок «Регіони» через RegionAccordion'],
  ['src/components/dashboard/director-dashboard.tsx', 'BrandRegionGroup', 'Director має рендерити блок «По брендах — з розбивкою по регіонах»'],
  ['src/components/dashboard/rm-dashboard.tsx', 'ManagerAccordion', 'РМ має рендерити блок «Менеджери регіону» через ManagerAccordion'],
  ['src/components/dashboard/rm-dashboard.tsx', 'BrandManagerGroup', 'РМ має рендерити блок «По брендах — з розбивкою по менеджерах»'],
  ['src/components/dashboard/manager-dashboard.tsx', 'BrandExpandedDetails', 'Manager має використовувати BrandExpandedDetails для Variant A'],
  ['src/components/dashboard/rm-dashboard.tsx', 'ClientStatsCard', 'РМ має ClientStatsCard як 4-ту hero-картку'],
  ['src/components/dashboard/director-dashboard.tsx', 'ClientStatsCard', 'Director має ClientStatsCard як 4-ту hero-картку'],
  // /clients картка «Виконання»: факт мусить бути АГРЕГАТ сегментів (=планинг),
  // а не сума per-client (недооцінювала до $896 замість $66,220). 2026-07-08.
  ['src/components/clients/clients-page.tsx', 'factTotalAgg', '/clients «Виконання» мусить брати факт з агрегату сегментів (factTotalAgg), не суму per-client factByClient'],
];

for (const [file, usage, desc] of REQUIRED_USAGES) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, 'utf-8');
  if (!content.includes(usage)) {
    errors.push(`❌ MISSING USAGE in ${file}: "${usage}"\n   ${desc}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. Anti-patterns — не повинно бути у коді
// ─────────────────────────────────────────────────────────────────
const ANTI_PATTERNS = [
  // UTC bug — нікуди не повертаємо new Date(currentPeriod.weekEnd) без мануального parse
  {
    pattern: /new Date\(currentPeriod\.weekEnd\)/g,
    message: 'UTC bug: new Date(currentPeriod.weekEnd) — використовувати manual parse [y,m,d] = split("-").map(Number)',
    files: ['src/components/dashboard/', 'src/components/planning/'],
  },
  // 1С category для розподілу клієнтів у формі — заборонено
  {
    pattern: /\.filter\(c => c\.category === 'active'\)/g,
    message: '1С category для active/inactive у формі — використовувати lastPurchaseDate (3 місяці)',
    files: ['src/components/planning/planning-form.tsx'],
  },
  // /clients: план/факт/норма мусять йти за ЛОКАЛЬНИМ табом місяця (selectedMonth),
  // НЕ за currentPeriod планинг-борду. Кожен борд має свої дати. Регресія тут →
  // при перегляді минулих місяців картка «Виконання» рахує чужий місяць і застрягає
  // скелетоном (баг headofsd 2026-07-08).
  {
    pattern: /s\.currentPeriod/g,
    message: '/clients мусить використовувати локальний selectedMonth для плану/факту/норми, НЕ currentPeriod планинг-борду',
    files: ['src/components/clients/clients-page.tsx'],
  },
];

import { readdirSync, statSync } from 'node:fs';
function walkDir(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walkDir(full));
    else if (s.isFile() && (full.endsWith('.tsx') || full.endsWith('.ts'))) out.push(full);
  }
  return out;
}

for (const ap of ANTI_PATTERNS) {
  for (const folderOrFile of ap.files) {
    const fullPath = join(ROOT, folderOrFile);
    if (!existsSync(fullPath)) continue;
    const files = statSync(fullPath).isDirectory() ? walkDir(fullPath) : [fullPath];
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      if (ap.pattern.test(content)) {
        errors.push(`❌ ANTI-PATTERN in ${f.replace(ROOT, '').replace(/\\/g, '/')}: ${ap.message}`);
      }
      // reset regex state between files
      ap.pattern.lastIndex = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 5. LOC gates — soft cap (warn) і hard cap (error)
// ─────────────────────────────────────────────────────────────────
//
// Why:
//  Без LOC-cap файли непомітно зростають у god-component-и. clients-page
//  виріс +55% за 2 тижні до 2869 LOC коли ми внесли Sprint 2C/2D. Soft cap
//  500 ловить перевищення раніше, hard cap 800 не дає push без розбиття.
//
// EXEMPT_LARGE_FILES — короткий список «знаю-і-маю-обґрунтування». Перш ніж
// додавати файл сюди — спробувати розбити. Якщо неможливо — обов'язково
// коментар чому.
const SOFT_CAP = 500;
const HARD_CAP = 800;

/** Files we know are big і поки що не плануємо розбивати. Додавати ОБЕРЕЖНО. */
const EXEMPT_LARGE_FILES = [
  // company-overview-dashboard.tsx — потенційний наступний refactor (1265 LOC).
  'src/components/dashboard/company-overview-dashboard.tsx',
  // clients-page.tsx (~890 LOC) — після refactor (Days 1-5). Orchestrator з
  // купою state + useMemo. Залишився > soft cap але ловить hard cap. Майбутнє:
  // винести fact-enrichment effects у окремий хук.
  'src/components/clients/clients-page.tsx',
  // planning-form.tsx (~1230 LOC) — після refactor (Days 6-8). Залишився як
  // state-orchestrator з updateForecast/updateGap/addClient handlers +
  // useMemo обчислення. Майбутнє: винести handlers у usePlanningCrud + auto-
  // populate effect в окремий хук.
  'src/components/planning/planning-form.tsx',
];

const warnings = [];

function countLines(file) {
  try {
    return readFileSync(file, 'utf-8').split('\n').length;
  } catch {
    return 0;
  }
}

function relativePath(absPath) {
  return absPath.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
}

const srcDir = join(ROOT, 'src');
if (existsSync(srcDir)) {
  const allFiles = walkDir(srcDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  for (const file of allFiles) {
    const rel = relativePath(file);
    if (EXEMPT_LARGE_FILES.includes(rel)) continue;
    const loc = countLines(file);
    if (loc > HARD_CAP) {
      errors.push(`❌ HARD CAP exceeded: ${rel} (${loc} LOC > ${HARD_CAP}). Split into smaller files. See docs/ARCHITECTURE_RULES.md.`);
    } else if (loc > SOFT_CAP) {
      warnings.push(`⚠️  SOFT CAP exceeded: ${rel} (${loc} LOC > ${SOFT_CAP}). Plan refactor.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. Report
// ─────────────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`⚠️  LOC warnings (${warnings.length})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const w of warnings) console.log(w);
  console.log('');
}

if (errors.length === 0) {
  console.log('✅ Architecture invariants OK');
  console.log(`   ${REQUIRED_FILES.length} files, ${REQUIRED_EXPORTS.length} exports, ${REQUIRED_USAGES.length} usages, ${ANTI_PATTERNS.length} anti-patterns, LOC gates (soft=${SOFT_CAP}, hard=${HARD_CAP}) checked.`);
  process.exit(0);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`❌ Architecture invariants FAILED (${errors.length} issues)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
for (const e of errors) console.log(e);
console.log('');
console.log('Read docs/ARCHITECTURE_RULES.md before fixing.');
process.exit(1);
