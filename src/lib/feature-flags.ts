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
 * Blacklist логінів яким доступ повністю закритий незалежно від ролі/статусу.
 * Працює як hardcoded ban-list — простіше за per-user колонку у Supabase для
 * рідкісних випадків.
 *
 * Поведінка: 403 на login, 403 на всі /api/onec запити (живі сесії
 * відключаються одразу).
 *
 * Видалити логін з масиву = розблокувати (потребує redeploy).
 *
 * Доданий 2026-06-26.
 */
export const BLOCKED_LOGINS: readonly string[] = [];  // owner@ розблоковано 2026-07-07

/**
 * Helper: чи цей логін заблоковано (banlist).
 */
export function isBlockedLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return BLOCKED_LOGINS.includes(login.toLowerCase().trim());
}

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
 * РМ-логіни які закріплені за кількома регіонами і у 1С повертаються
 * як «частковий РМ» (тільки в одному регіоні бачать менеджерів). Для них
 * робимо окремий обхід: Action 5 викликаємо через DIRECTOR_PROXY_LOGIN
 * (повна картина), фільтруємо до перерахованих regionCodes. Аналогічно у
 * /api/planning/aggregate цим логінам дається full company access.
 *
 * Костиль для Пашковської (rm.odessa) — РМ Одеси, але закріплена і за
 * Миколаївом де менеджери (Лопушанська, Клименко). 2026-05-18.
 */
export const MULTI_REGION_RM_OVERRIDES: Record<string, readonly string[]> = {
  'rm.odessa@emet.in.ua': ['ODS', 'NLV'],
};

/**
 * "Домашній" регіон РМ — де ВОНА САМА продає (планує клієнтів, має план 1С).
 * У всіх ІНШИХ регіонах вона показується лише як спостерігач — її особисті
 * forecasts/gap_closures НЕ входять у brand-сумі, planning-readiness, regional
 * статистику тих регіонів.
 *
 * Кейс Пашковської (2026-05-19): РМ Одеса+Миколаїв. Продає тільки в Одесі.
 * У Миколаїві її $9863 finalized на ELLANSE летіли у brand-сумі що давало
 * 277% «Запл.» (її дані у numerator, плану 1С на NLV у неї нема → 0 у
 * denominator). Фільтр у adaptRegionData робить її невидимою для NLV.
 */
export const MULTI_REGION_RM_HOME: Record<string, string> = {
  'rm.odessa@emet.in.ua': 'ODS',
};

/**
 * Чи дозволено сесії з даним логіном писати у систему планування коли
 * PLANNING_DISABLED=true.
 */
export function isPlanningWritesAllowed(login: string | null | undefined): boolean {
  if (!FEATURES.PLANNING_DISABLED) return true;
  if (!login) return false;
  return ADMIN_LOGINS.includes(login.toLowerCase().trim());
}

/**
 * Чи цей логін належить admin-у (itd@emet.in.ua).
 * Використовується для system kill-switch + adminPRoxy + admin UI gating.
 */
export function isAdminLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return ADMIN_LOGINS.includes(login.toLowerCase().trim());
}

/**
 * Хто має доступ до стратегічного KPI дашборду (`/admin/strategic-kpi`).
 * ITD (admin) + Саша (Director of Sales, sdu@emet.in.ua) — щоб директор
 * продажів міг переглядати без admin-повноважень.
 */
const STRATEGIC_KPI_LOGINS: readonly string[] = [
  ...ADMIN_LOGINS,
  DIRECTOR_PROXY_LOGIN,     // sdu@emet.in.ua
  'headofproduct@emet.in.ua',
  'ceo@emet.in.ua',
  'owner@emet.in.ua',      // розблоковано з ban-list 2026-07-07
  'cmo@emet.in.ua',        // маркетинг-директор, read-only (роль director у 1С)
];
export function isStrategicKpiLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return STRATEGIC_KPI_LOGINS.includes(login.toLowerCase().trim());
}

/**
 * Хто може ЗАЛИШАТИ коментар директора до плану менеджера — ТІЛЬКИ реальний
 * директор продажів (sdu) + admin. Проксі-директори (ceo/headofproduct/owner)
 * мають роль director лише для перегляду і коментувати план НЕ можуть.
 */
export function canAuthorPlanComment(login: string | null | undefined): boolean {
  if (!login) return false;
  return login.toLowerCase().trim() === DIRECTOR_PROXY_LOGIN || isAdminLogin(login);
}
