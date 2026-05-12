// Тести для pure-функцій синхронізації selection-стейтів при видаленні.
// Виявлений bug 2026-05-12: коли selectedGaps (Set<number>) не оновлювалось
// після single-delete з gap-блоку, наступний bulk-delete видаляв НЕ ТИХ
// рядків (бо indices зміщувалися).

import test from 'node:test';
import assert from 'node:assert/strict';
import { syncIndicesAfterRemove, syncIdsAfterRemove } from '../src/lib/selection-sync.ts';

// === syncIndicesAfterRemove ===

test('видалення з кінця → інші індекси не змінюються', () => {
  const result = syncIndicesAfterRemove(new Set([0, 1, 2]), 4);
  assert.deepEqual([...result].sort(), [0, 1, 2]);
});

test('видалення з середини → більші indices зсуваються на -1', () => {
  // Масив [A, B, C, D, E], видалили C (index 2)
  // selectedGaps = {1, 3} (B і D) → має стати {1, 2} (B на 1, D тепер на 2)
  const result = syncIndicesAfterRemove(new Set([1, 3]), 2);
  assert.deepEqual([...result].sort(), [1, 2]);
});

test('видалення САМОГО виділеного → видаляється з Set', () => {
  // [A, B, C, D], виділили {1} (B), видалили B (index 1)
  // → selectedGaps стає порожнім
  const result = syncIndicesAfterRemove(new Set([1]), 1);
  assert.deepEqual([...result], []);
});

test('виділені + видалений співпадають частково', () => {
  // [A, B, C, D, E], selected = {1, 2, 4} (B, C, E)
  // Видалили C (index 2):
  //   - 1 (B) лишається 1
  //   - 2 (C) видаляється
  //   - 4 (E) → 3
  const result = syncIndicesAfterRemove(new Set([1, 2, 4]), 2);
  assert.deepEqual([...result].sort(), [1, 3]);
});

test('видалення з початку → ВСІ індекси зсуваються', () => {
  const result = syncIndicesAfterRemove(new Set([1, 2, 3]), 0);
  assert.deepEqual([...result].sort(), [0, 1, 2]);
});

test('порожній Set → порожній Set', () => {
  const result = syncIndicesAfterRemove(new Set(), 5);
  assert.deepEqual([...result], []);
});

// === КЛЮЧОВИЙ СЦЕНАРІЙ — bug який ми виправляємо ===
test('🐛 BUG SCENARIO: single-delete + bulk-delete після цього', () => {
  // 5 рядків [A, B, C, D, E], indices 0..4
  // 1. Виділив B(1) і D(3) → selectedGaps = {1, 3}
  // 2. Видалив A через урну (single-delete):
  //    - gapClosures = [B, C, D, E]
  //    - selectedGaps має стати {0, 2} (B на 0, D на 2)
  let selected = new Set([1, 3]);
  selected = syncIndicesAfterRemove(selected, 0); // single-delete A
  assert.deepEqual([...selected].sort(), [0, 2], 'B на 0, D на 2');

  // 3. Якщо тепер натиснути bulk-delete з selectedGaps={0,2}
  //    → відфільтрує гарно B (index 0) і D (index 2). До bug-фіксу
  //    було б {1, 3} і видалило C+E замість B+D.
});

// === syncIdsAfterRemove ===

test('forecast remove: id зникає з Set', () => {
  const result = syncIdsAfterRemove(new Set(['c1', 'c2', 'c3']), 'c2');
  assert.deepEqual([...result].sort(), ['c1', 'c3']);
});

test('forecast remove: id якого немає у Set → Set той самий (ref-equality)', () => {
  const before = new Set(['c1', 'c2']);
  const after = syncIdsAfterRemove(before, 'cX');
  assert.equal(after, before, 'no-op коли id не в Set');
});

test('forecast remove з порожнього Set → порожній', () => {
  const result = syncIdsAfterRemove(new Set(), 'c1');
  assert.deepEqual([...result], []);
});
