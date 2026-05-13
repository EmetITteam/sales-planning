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
   * 2026-05-13: вимкнено, контроль перейшов до window-lock через
   * `/admin/planning-locks`. Прапор залишений як аварійний rescue —
   * якщо треба ekstrene заблокувати всіх (наприклад при критичній помилці),
   * прапор повертається у true і деплоїться. Видаляємо повністю окремим
   * cleanup commit-ом після того як подовгу пересвідчимось що window-lock
   * стабільно працює у проді.
   */
  PLANNING_DISABLED: false,
};

/**
 * Whitelist логінів які отримують role='admin' через adaptLogin override
 * (1С не знає про роль 'admin' — там itd@emet.in.ua = звичайний менеджер,
 * тому role переписуємо на нашій стороні після login response).
 *
 * Не комітити сюди логіни менеджерів. Тільки технічного адміна.
 */
export const ADMIN_LOGINS: readonly string[] = ['itd@emet.in.ua'];

/**
 * Логін з якого admin читає company-wide дані з 1С коли явно не вказано
 * чий план дивиться. 1С для itd@emet.in.ua не повертає регіони/менеджерів
 * (бо він не Director у 1С), тому для getRegionData без login підставляємо
 * Director-а.
 *
 * Sasha Амосова — реальний Director з продажу. Якщо вона звільниться чи
 * перейме інша особа — оновити тут.
 */
export const DIRECTOR_PROXY_LOGIN = 'sdu@emet.in.ua';

/**
 * Чи дозволено сесії з даним логіном писати у систему планування коли
 * PLANNING_DISABLED=true.
 */
export function isPlanningWritesAllowed(login: string | null | undefined): boolean {
  if (!FEATURES.PLANNING_DISABLED) return true;
  if (!login) return false;
  return ADMIN_LOGINS.includes(login.toLowerCase().trim());
}
