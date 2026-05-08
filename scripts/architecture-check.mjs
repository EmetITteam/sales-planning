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
// 5. Report
// ─────────────────────────────────────────────────────────────────
if (errors.length === 0) {
  console.log('✅ Architecture invariants OK');
  console.log(`   ${REQUIRED_FILES.length} files, ${REQUIRED_EXPORTS.length} exports, ${REQUIRED_USAGES.length} usages, ${ANTI_PATTERNS.length} anti-patterns checked.`);
  process.exit(0);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`❌ Architecture invariants FAILED (${errors.length} issues)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
for (const e of errors) console.log(e);
console.log('');
console.log('Read docs/ARCHITECTURE_INVARIANTS.md before fixing.');
process.exit(1);
