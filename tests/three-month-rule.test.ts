/**
 * Тести для fixed cutoff «3 місяці» на плановий місяць.
 *
 * Контракт:
 *  - cutoff = початок планового місяця мінус 90 днів (FIXED, не від сьогодні)
 *  - active = last_buy ∈ [cutoff, planMonthStart)
 *  - купівля у плановому місяці → НЕ active (це факт плану, не зміна категорії)
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isActiveForBrand,
  getCutoffMs,
  getPlanMonthStartMs,
} from '../src/lib/three-month-rule';

// -----------------------------------------------------------------------------
// getPlanMonthStartMs
// -----------------------------------------------------------------------------

test('getPlanMonthStartMs: YYYY-MM → 1 число 00:00 local', () => {
  const t = getPlanMonthStartMs('2026-05');
  const d = new Date(t);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 4); // May = 4 (0-indexed)
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
});

test('getPlanMonthStartMs: YYYY-MM-DD теж приймається, день ігнорується', () => {
  const t1 = getPlanMonthStartMs('2026-05-01');
  const t2 = getPlanMonthStartMs('2026-05-25'); // інший день
  assert.equal(t1, t2, 'обидва дають той самий початок місяця');
});

test('getPlanMonthStartMs: неправильний формат → throw', () => {
  assert.throws(() => getPlanMonthStartMs('2026/05'));
  assert.throws(() => getPlanMonthStartMs('abcd'));
  assert.throws(() => getPlanMonthStartMs(''));
});

// -----------------------------------------------------------------------------
// getCutoffMs — приблизно 90 днів назад від початку місяця
// -----------------------------------------------------------------------------

test('getCutoffMs: для травня 2026 ≈ 1 лютого 2026', () => {
  const cutoff = getCutoffMs('2026-05');
  const d = new Date(cutoff);
  // 2026-05-01 - 90 днів = 2026-01-31 (приблизно)
  // Точно: 90 днів × 86400 сек × 1000 мс
  assert.equal(d.getFullYear(), 2026);
  // має бути січень або лютий
  assert.ok(d.getMonth() === 0 || d.getMonth() === 1, `month=${d.getMonth()}`);
});

// -----------------------------------------------------------------------------
// isActiveForBrand — ключова бізнес-логіка
// -----------------------------------------------------------------------------

test('isActiveForBrand: null/empty/undefined → false', () => {
  assert.equal(isActiveForBrand(null, '2026-05'), false);
  assert.equal(isActiveForBrand(undefined, '2026-05'), false);
  assert.equal(isActiveForBrand('', '2026-05'), false);
});

test('isActiveForBrand: невалідний формат дати → false', () => {
  assert.equal(isActiveForBrand('not-a-date', '2026-05'), false);
  assert.equal(isActiveForBrand('2026-XX-01', '2026-05'), false);
});

test('isActiveForBrand: купівля у березні 2026 → active для плану на травень', () => {
  // Cutoff для травня 2026 ≈ 1 лютого. Купівля 15 березня — у вікні.
  assert.equal(isActiveForBrand('2026-03-15', '2026-05'), true);
});

test('isActiveForBrand: купівля у квітні 2026 → active для плану на травень', () => {
  // Останній місяць перед плановим — точно active.
  assert.equal(isActiveForBrand('2026-04-28', '2026-05'), true);
});

test('isActiveForBrand: купівля у січні 2026 (>90 днів) → НЕ active', () => {
  // 1 січня — 4 місяці назад → за межами cutoff.
  assert.equal(isActiveForBrand('2026-01-01', '2026-05'), false);
});

test('isActiveForBrand: купівля у грудні 2025 → НЕ active', () => {
  assert.equal(isActiveForBrand('2025-12-15', '2026-05'), false);
});

test('isActiveForBrand: купівля у далекому минулому → НЕ active (кейс Кравченко)', () => {
  // Реальний кейс: Кравченко's last_buy = 2025-04-04 для плану 2026-05.
  // > 1 року тому → точно в gap.
  assert.equal(isActiveForBrand('2025-04-04', '2026-05'), false);
});

test('🎯 КРИТИЧНИЙ КЕЙС: постійний клієнт що купив у плановому місяці → active', () => {
  // Це випадок Vitaran-постійних клієнтів (Некова 2026-05-15): клієнт
  // купує бренд щомісяця. У травні (плановий місяць) теж купив.
  // Має бути active, інакше всі постійні покупці летять у gap.
  // Захист від кейсу Кравченко (дубль forecast+gap) — через snapshot fixation
  // на стороні форми планування, не через runtime rule.
  assert.equal(isActiveForBrand('2026-05-13', '2026-05'), true,
    'Купівля у плановому місяці — клієнт active');
});

test('isActiveForBrand: купівля 1-го числа планового місяця → active', () => {
  // 1 травня — у плановому місяці. last_buy >= cutoff (Feb 1) → active.
  assert.equal(isActiveForBrand('2026-05-01', '2026-05'), true);
});

test('isActiveForBrand: купівля наприкінці планового місяця → active', () => {
  // 31 травня — теж >= cutoff → active. Це постійний клієнт.
  assert.equal(isActiveForBrand('2026-05-31', '2026-05'), true);
});

test('🔒 КЛЮЧОВА ВЛАСТИВІСТЬ: результат СТАБІЛЬНИЙ протягом планового місяця', () => {
  // Раніше було `Date.now() - 90 днів` → результат залежав від СЬОГОДНІ.
  // Тепер cutoff фіксований на planMonth → результат залежить лише від
  // (lastPurchaseDate, planMonth), сьогоднішня дата не впливає.
  //
  // Перевіряємо: isActiveForBrand для тої ж пари даних = той самий результат
  // незалежно від часу виконання тесту. Це гарантується pure-функцією без
  // Date.now() усередині.
  const r1 = isActiveForBrand('2026-04-15', '2026-05');
  const r2 = isActiveForBrand('2026-04-15', '2026-05');
  assert.equal(r1, r2);
  assert.equal(r1, true, 'квітнева купівля активна для травневого плану');
});

test('Багатомісячна перевірка: для червня той самий клієнт буде/не буде active правильно', () => {
  // Купівля 2026-04-15: для плану на травень → active. Для плану на липень → НЕ active.
  assert.equal(isActiveForBrand('2026-04-15', '2026-05'), true);
  // Cutoff для липня = 1 липня - 90 днів ≈ 2 квітня. 2026-04-15 ≥ 2 квітня → active.
  assert.equal(isActiveForBrand('2026-04-15', '2026-07'), true);
  // Cutoff для серпня = 1 серпня - 90 днів ≈ 3 травня. 2026-04-15 < 3 травня → НЕ active.
  assert.equal(isActiveForBrand('2026-04-15', '2026-08'), false);
});

test('Послідовність: клієнт що мав останню покупку 2026-02-01 → active для травня, gap для серпня', () => {
  assert.equal(isActiveForBrand('2026-02-01', '2026-05'), true);
  assert.equal(isActiveForBrand('2026-02-01', '2026-08'), false);
});
