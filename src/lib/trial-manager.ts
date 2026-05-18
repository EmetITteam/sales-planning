/**
 * Sentinel-detection «менеджер на випробувальному».
 *
 * Бізнес-кейс: новий менеджер на випробувальному терміні ще не має плану
 * у 1С. Замість $0 (що завжди легітимно — продав/не продав) 1С ставить
 * $1 на кожен сегмент щоб «щось було». Це наша магічна позначка trial.
 *
 * Без обробки: факт $1143 / план $1 = 12700% — дашборд вибухає.
 *
 * Узгоджено з user 2026-05-18. Тимчасове рішення без зміни схеми БД.
 * Коли 1С перейде на нормальний механізм (наприклад null або окреме
 * поле trial=true у користувача) — замінити цей файл на правильний helper.
 */

/** Чи цей бренд має trial-план ($1 sentinel). */
export function isTrialBrandPlan(planAmount: number): boolean {
  return planAmount > 0 && planAmount <= 1;
}

/**
 * Чи цей менеджер на випробувальному.
 * Critеria: ВСІ бренди мають план <= $1 (тобто 1С виставила sentinel-и).
 * Якщо хоч один бренд має реальний план — менеджер вже не trial.
 */
export function isTrialManager(segmentPlans: number[]): boolean {
  if (segmentPlans.length === 0) return false;
  return segmentPlans.every(p => p <= 1);
}
