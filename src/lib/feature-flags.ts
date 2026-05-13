/**
 * Feature flags — single-place toggle для нових UI блоків.
 *
 * Як вимкнути блок у проді швидко:
 *   1. Змінити прапор тут на `false`
 *   2. Закомітити + push → Vercel автодеплой за 2-3 хв
 *
 * Без env var щоб не залежати від Vercel config — будь-який розробник
 * (або Claude) може швидко прибрати feature перекинувши boolean.
 */

export const FEATURES = {
  /**
   * Картка «Готовність планування» на дашборді Director (поряд з RegionAccordion).
   * Показує скільки менеджерів заповнили план за поточний місяць,
   * розбивка по регіонах з drill-down.
   *
   * Вимкнути → false → блок зникне з дашборду Director (інша частина не зачіпається).
   */
  PLANNING_READINESS: true,

  /**
   * Maintenance kill-switch — повна заборона save/edit планування для всіх
   * крім adminLogins (див. ADMIN_LOGINS нижче). Frontend показує banner
   * «Триває оновлення системи». Backend POST повертає 503.
   *
   * ⚠️ ТИМЧАСОВИЙ ПРАПОР на час Пакету А (2026-05-13). Після завершення
   * Етапу 3 (Window-lock + Admin сторінка) — видалити цей прапор разом
   * з ADMIN_LOGINS whitelist та усіма guard-перевірками. Window-lock
   * перебирає на себе цей контроль через UI.
   */
  PLANNING_DISABLED: true,
};

/**
 * Whitelist логінів які обходять PLANNING_DISABLED guard.
 *
 * ⚠️ ТИМЧАСОВО до Етапу 1 Пакету А — там введемо role='admin' і ця
 * константа стане непотрібна (заміниться на `session.role === 'admin'`).
 *
 * Не комітити сюди логіни менеджерів. Тільки технічного адміна.
 */
export const ADMIN_LOGINS: readonly string[] = ['itd@emet.in.ua'];

/**
 * Чи дозволено сесії з даним логіном писати у систему планування коли
 * PLANNING_DISABLED=true.
 */
export function isPlanningWritesAllowed(login: string | null | undefined): boolean {
  if (!FEATURES.PLANNING_DISABLED) return true;
  if (!login) return false;
  return ADMIN_LOGINS.includes(login.toLowerCase().trim());
}
