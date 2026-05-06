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
  let hash = 0;
  for (let i = 0; i < login.length; i++) {
    hash = ((hash << 5) - hash) + login.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
