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
};
