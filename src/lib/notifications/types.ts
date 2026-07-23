/**
 * Notifications — типи + ENUM валідація.
 *
 * Кожен notification у БД має поле `type` (string). Валідні значення
 * перелічені тут для type-safety + щоб /api/notifications/internal міг
 * відсікати невідомі типи (захист від junk у БД).
 */

export const NOTIFICATION_TYPES = [
  'claim_new_comment', // Новий коментар від мед-відділу у рекламації
  'claim_status_changed', // Статус рекламації змінено (опціонально)
  'meeting_reminder', // Нагадування про зустріч (на майбутнє)
  'birthday_today', // День народження клієнта (на майбутнє)
  // === Sprint 2D: верифікація нових клієнтів через Bitrix SPA 1048 ===
  'client_verified', // КЦ закрив у статус «Верифіковано» — клієнт у базі
  'client_rejected', // КЦ закрив у статус «Відхилено» — потрібне коректне переоформлення
  'client_clarification', // КЦ запитує уточнення (стадія «На уточненні»)
  'plan_director_comment', // Коментар директора по продажах до плану менеджера (по бренду)
  'plan_comment_resolved', // Менеджер позначив коментар директора «Виконано»
  'weekly_report_finalized', // РМ здав тижневий звіт регіону → РОПу
  'rop_report_finalized', // РОП здав зведений звіт → CSO і CMO
  'system', // Системне повідомлення від адміна
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  userLogin: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  meta: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** DB row → domain Notification. Поля з snake_case → camelCase. */
export interface NotificationRow {
  id: string;
  user_login: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  meta: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export function adaptNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userLogin: row.user_login,
    type: (NOTIFICATION_TYPES as readonly string[]).includes(row.type)
      ? (row.type as NotificationType)
      : 'system',
    title: row.title,
    message: row.message,
    link: row.link,
    meta: row.meta ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
