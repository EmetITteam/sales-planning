/**
 * Стабільний числовий ID з рядкового логіну.
 *
 * Тимчасовий обхід поки `users.id` — number (Supabase auto-increment).
 * Майбутньо мігрувати схему на `users.login TEXT PRIMARY KEY` і прибрати
 * це повністю.
 *
 * Використовується і у клієнті (PlanningForm) і на сервері (/api/planning)
 * щоб обидві сторони рахували ОДНАКОВИЙ id з того ж логіну —
 * server-side можна валідувати що клієнт надіслав правильний userId.
 */
export function loginToUserId(login: string): number {
  // Нормалізація: 1С іноді віддає логін з різним регістром в різних методах
  // (Login vs RegistryPlans). Без lowercase той самий менеджер потрапить
  // у Supabase як два різних user_id і його план «розділиться навпіл».
  const normalized = login.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  // `hash >>> 0` конвертує signed 32-bit у unsigned. `Math.abs(MIN_INT)` повертає
  // MIN_INT (overflow) — баг який ми колись могли отримати від'ємний user_id.
  return hash >>> 0;
}
