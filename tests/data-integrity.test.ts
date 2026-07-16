// Run: npm test
//
// Інваріанти цілісності sales + client_category_history (чисті функції).

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSales, checkCategorySnapshot, monthGaps } from '../src/lib/data-integrity.ts';

// ─── monthGaps ───────────────────────────────────────────────────────────
test('monthGaps: безперервний діапазон → []', () => {
  assert.deepEqual(monthGaps(['2026-05', '2026-06', '2026-07']), []);
});
test('monthGaps: пропуск усередині → знаходить', () => {
  assert.deepEqual(monthGaps(['2026-05', '2026-07']), ['2026-06']);
});
test('monthGaps: пропуск через рік', () => {
  assert.deepEqual(monthGaps(['2025-11', '2026-02']), ['2025-12', '2026-01']);
});

// ─── checkSales ──────────────────────────────────────────────────────────
test('checkSales: усе на місці → ok', () => {
  const r = checkSales({
    total: 265000, monthsPresent: ['2026-06', '2026-07'],
    currentMonth: '2026-07', currentMonthCount: 7190, unmappedBrandCount: 5000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
});
test('checkSales: порожня таблиця → issue', () => {
  const r = checkSales({ total: 0, monthsPresent: [], currentMonth: '2026-07', currentMonthCount: 0, unmappedBrandCount: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => /порожня/.test(i)));
});
test('checkSales: поточний місяць без продажів → issue', () => {
  const r = checkSales({ total: 1000, monthsPresent: ['2026-06'], currentMonth: '2026-07', currentMonthCount: 0, unmappedBrandCount: 10 });
  assert.ok(r.issues.some(i => /Поточний місяць/.test(i)));
});
test('checkSales: пропущений місяць → issue', () => {
  const r = checkSales({ total: 1000, monthsPresent: ['2026-05', '2026-07'], currentMonth: '2026-07', currentMonthCount: 5, unmappedBrandCount: 10 });
  assert.ok(r.issues.some(i => /Пропущені місяці/.test(i)));
});
test('checkSales: забагато НЕ_МАПНУТО → issue', () => {
  const r = checkSales({ total: 1000, monthsPresent: ['2026-07'], currentMonth: '2026-07', currentMonthCount: 1000, unmappedBrandCount: 400 });
  assert.ok(r.issues.some(i => /НЕ_МАПНУТО/.test(i)));
});

// ─── checkCategorySnapshot ───────────────────────────────────────────────
test('checkCategorySnapshot: коректний зріз → ok', () => {
  const r = checkCategorySnapshot({
    activeTotal: 9534,
    byCategory: { active: 2289, sleeping: 664, lost: 3452, new: 104, none: 3025 },
    reservedActive: 900, managerCount: 21,
  });
  assert.equal(r.ok, true);
});
test('checkCategorySnapshot: порожній → issue', () => {
  const r = checkCategorySnapshot({ activeTotal: 0, byCategory: {}, reservedActive: 0, managerCount: 0 });
  assert.ok(r.issues.some(i => /порожній/.test(i)));
});
test('checkCategorySnapshot: усе в одній категорії (баг маппінгу) → issue', () => {
  const r = checkCategorySnapshot({
    activeTotal: 992, byCategory: { active: 0, sleeping: 0, lost: 0, new: 0, none: 992 },
    reservedActive: 0, managerCount: 2,
  });
  assert.ok(r.issues.some(i => /одній категорії/.test(i)));
});
test('checkCategorySnapshot: сума ≠ активних → issue', () => {
  const r = checkCategorySnapshot({
    activeTotal: 100, byCategory: { active: 40, sleeping: 10, lost: 10, new: 10, none: 10 }, // = 80
    reservedActive: 0, managerCount: 5,
  });
  assert.ok(r.issues.some(i => /Сума по категоріях/.test(i)));
});
test('checkCategorySnapshot: один менеджер → issue', () => {
  const r = checkCategorySnapshot({
    activeTotal: 60, byCategory: { active: 30, sleeping: 10, lost: 10, new: 5, none: 5 },
    reservedActive: 0, managerCount: 1,
  });
  assert.ok(r.issues.some(i => /менеджер/.test(i)));
});
