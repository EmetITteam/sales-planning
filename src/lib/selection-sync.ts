/**
 * Pure-функції синхронізації selection-стейтів з масивами при видаленні.
 *
 * Виділено з planning-form щоб тестуватись без React.
 *
 * Чому це потрібно:
 *   selectedGaps — Set<number> по index у gapClosures[]. При видаленні
 *   рядка з середини indices наступних рядків зсуваються на -1. Без
 *   синхронізації наступний bulk-delete потрапляє НЕ ТУДИ.
 */

/**
 * Sync Set<number>-індексів коли рядок з indexToRemove видалено.
 *
 * - Викидає сам indexToRemove (його більше нема)
 * - Decrement усіх індексів що були > indexToRemove
 *
 * @example
 *   syncIndicesAfterRemove(new Set([1, 3, 5]), 2)
 *   → Set([1, 2, 4])  // 3→2, 5→4, бо вони більші ніж 2
 */
export function syncIndicesAfterRemove(prev: Set<number>, indexToRemove: number): Set<number> {
  const next = new Set<number>();
  for (const idx of prev) {
    if (idx === indexToRemove) continue;
    next.add(idx > indexToRemove ? idx - 1 : idx);
  }
  return next;
}

/**
 * Sync Set<string>-ID коли елемент з removedId видалено.
 * Просто delete з Set; інші ID не зачіпаються.
 */
export function syncIdsAfterRemove(prev: Set<string>, removedId: string): Set<string> {
  if (!prev.has(removedId)) return prev;
  const next = new Set(prev);
  next.delete(removedId);
  return next;
}

/**
 * Sync Set<number>-індексів коли видалено КІЛЬКА рядків (bulk).
 * Простіше — просто очищаємо Set, бо bulk видаляє все що було selected.
 */
export function syncIndicesAfterBulkRemove(): Set<number> {
  return new Set<number>();
}
