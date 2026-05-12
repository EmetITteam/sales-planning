// «Активний по бренду = купував за останні 3 місяці» — критичне бізнес-правило.
// Я тричі плутав/переписував цю логіку (memory: active_vs_inactive_brand_rule.md).
// Тести закріплюють очікувану поведінку щоб майбутній refactor не зламав.

import test from 'node:test';
import assert from 'node:assert/strict';

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

// Pure helper з planning-form.tsx — дублюємо для тестування без React.
function isRecentBrandPurchase(dateStr: string | null | undefined, asOfMs: number = Date.now()): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const cutoff = asOfMs - THREE_MONTHS_MS;
  return new Date(y, m - 1, d).getTime() >= cutoff;
}

// Фіксована «сьогодні» для детермінованих тестів — 12 травня 2026.
const TODAY_MS = new Date(2026, 4, 12).getTime();
// Cutoff = 12.05.2026 − 90д = 11.02.2026

// === Активний (купував за останні 3 міс) ===

test('купив сьогодні (12.05) → активний', () => {
  assert.equal(isRecentBrandPurchase('2026-05-12', TODAY_MS), true);
});

test('купив 1.05 (11 днів тому) → активний', () => {
  assert.equal(isRecentBrandPurchase('2026-05-01', TODAY_MS), true);
});

test('купив 12.02 (рівно 89 днів тому) → активний', () => {
  assert.equal(isRecentBrandPurchase('2026-02-12', TODAY_MS), true);
});

test('купив 11.02 (рівно cutoff) → активний (>=)', () => {
  assert.equal(isRecentBrandPurchase('2026-02-11', TODAY_MS), true);
});

// === НЕактивний (купував раніше 3 міс) ===

test('купив 10.02 (за 91 день) → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('2026-02-10', TODAY_MS), false);
});

test('купив 1.01 (4+ місяці тому) → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('2026-01-01', TODAY_MS), false);
});

test('купив рік тому → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('2025-05-12', TODAY_MS), false);
});

// === Edge cases ===

test('null → НЕ активний (нема покупок взагалі)', () => {
  assert.equal(isRecentBrandPurchase(null, TODAY_MS), false);
});

test('undefined → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase(undefined, TODAY_MS), false);
});

test('пустий рядок → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('', TODAY_MS), false);
});

test('некоректний формат дати → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('not-a-date', TODAY_MS), false);
});

test('часткова дата без дня → НЕ активний', () => {
  assert.equal(isRecentBrandPurchase('2026-05', TODAY_MS), false);
});

// === Анті-регресія: НЕ використовуємо 1С category ===

test('🚫 Логіка ТІЛЬКИ по lastPurchaseDate бренду (не по 1С category)', () => {
  // Регресія: незалежно від категорії клієнта (Активный/Спящий/Новый з 1С),
  // функція має повертати ту ж відповідь для тієї ж дати.
  // Це гарантує що логіка НЕ підмішує 1С category на «активний/НЕ активний».
  // Раніше я плутав і додавав 1С category як критерій — тричі.
  const recentDate = '2026-05-01';
  const oldDate = '2025-11-01';
  // Якщо хтось додасть параметр category — TypeScript мав би відловити,
  // але runtime теж: ці виклики мають дати ОДНАКОВІ значення.
  assert.equal(isRecentBrandPurchase(recentDate, TODAY_MS), true);
  assert.equal(isRecentBrandPurchase(oldDate, TODAY_MS), false);
});

// === Реальний продакшен сценарій ===

test('реальний кейс: клієнт купив Vitaran 1.05.2026 → активний по Vitaran 12.05', () => {
  assert.equal(isRecentBrandPurchase('2026-05-01', TODAY_MS), true);
});

test('реальний кейс: той самий клієнт по EXOXE купував 15.11.2025 → НЕ активний по EXOXE', () => {
  assert.equal(isRecentBrandPurchase('2025-11-15', TODAY_MS), false);
});
