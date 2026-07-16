/**
 * Інваріанти цілісності таблиць `sales` і `client_category_history`.
 * Чисті функції (тестуються unit-тестами); live-перевірка — scripts/check-data-integrity.ts,
 * яка рахує summary через REST і кличе ці ж функції.
 */

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
  stats: Record<string, unknown>;
}

// ─── Sales ────────────────────────────────────────────────────────────────

export interface SalesSummary {
  total: number;
  monthsPresent: string[]; // 'YYYY-MM' (з rollup / distinct sale_date)
  currentMonth: string;    // 'YYYY-MM'
  currentMonthCount: number;
  unmappedBrandCount: number;
}

/** Пропущені місяці між найранішим і найпізнішим (розрив у безперервності). */
export function monthGaps(months: string[]): string[] {
  const sorted = [...new Set(months)].filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  if (sorted.length < 2) return [];
  const set = new Set(sorted);
  const [ye, me] = sorted[sorted.length - 1].split('-').map(Number);
  let [y, m] = sorted[0].split('-').map(Number);
  const gaps: string[] = [];
  while (y < ye || (y === ye && m <= me)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!set.has(key)) gaps.push(key);
    m++; if (m > 12) { m = 1; y++; }
  }
  return gaps;
}

export function checkSales(s: SalesSummary): IntegrityResult {
  const issues: string[] = [];
  if (s.total <= 0) issues.push('Таблиця sales порожня');
  if (s.currentMonthCount <= 0) issues.push(`Поточний місяць ${s.currentMonth} без продажів`);
  const gaps = monthGaps(s.monthsPresent);
  if (gaps.length) issues.push(`Пропущені місяці у sales: ${gaps.join(', ')}`);
  const unmappedRatio = s.total > 0 ? s.unmappedBrandCount / s.total : 0;
  if (unmappedRatio > 0.3) issues.push(`Забагато НЕ_МАПНУТО брендів: ${(unmappedRatio * 100).toFixed(1)}%`);
  return {
    ok: issues.length === 0,
    issues,
    stats: { total: s.total, months: s.monthsPresent.length, currentMonthCount: s.currentMonthCount, unmappedPct: +(unmappedRatio * 100).toFixed(1) },
  };
}

// ─── Client category snapshot ───────────────────────────────────────────────

export const CATEGORY_KEYS = ['active', 'sleeping', 'lost', 'new', 'none'] as const;

export interface CategorySummary {
  activeTotal: number;                 // активних версій (valid_to IS NULL)
  byCategory: Record<string, number>;  // active/sleeping/lost/new/none
  reservedActive: number;              // з них позначені резервом
  managerCount: number;                // унікальних manager_login
}

export function checkCategorySnapshot(s: CategorySummary): IntegrityResult {
  const issues: string[] = [];
  if (s.activeTotal <= 0) issues.push('Зріз категорій порожній (немає активних версій)');
  const sum = CATEGORY_KEYS.reduce((a, c) => a + (s.byCategory[c] ?? 0), 0);
  if (sum !== s.activeTotal) {
    issues.push(`Сума по категоріях (${sum}) ≠ активних (${s.activeTotal}) — є невідомі категорії`);
  }
  const nonZero = CATEGORY_KEYS.filter(c => (s.byCategory[c] ?? 0) > 0);
  if (s.activeTotal > 50 && nonZero.length <= 1) {
    issues.push(`Усі клієнти в одній категорії (${nonZero[0] ?? '?'}) — підозра на баг маппінгу`);
  }
  if (s.managerCount < 2) issues.push(`Лише ${s.managerCount} менеджер(ів) мають клієнтів`);
  return {
    ok: issues.length === 0,
    issues,
    stats: { activeTotal: s.activeTotal, byCategory: s.byCategory, managers: s.managerCount, reservedActive: s.reservedActive },
  };
}
