/**
 * Логіка «passive rows» (amount = 0):
 *
 * Менеджер може зберегти клієнта у плануванні з сумою 0 — це означає
 * «пам'ятаю, але не планую цього періоду». Такі рядки:
 *  - НЕ враховуються у counter'ах (totalForecast, кількість клієнтів)
 *  - НЕ зараховуються у заповненість бренду (PlanningReadinessCard)
 *  - АЛЕ залишаються у списку форми (сортуються вниз) і потрапляють у
 *    «Незаплановані покупці» якщо у клієнта з'явиться факт
 *
 * Узгоджено з користувачем 2026-05-14.
 */

/**
 * Чи цей рядок «passive» — тобто сума 0 (або негативна).
 *
 * Прийнято за правило `<= 0`, щоб помилкові негативи (раптом такі з'являться
 * через bug у формі) теж попадали у passive bucket замість завищувати totals.
 */
export function isPassiveAmount(amount: number | null | undefined): boolean {
  const n = Number(amount) || 0;
  return n <= 0;
}

/**
 * Сортування рядків прогнозу для форми планування.
 *
 * Пріоритет (від верху до низу):
 *  1. Активні (не completed, amount > 0)
 *  2. Passive (amount = 0) — пам'ятати, не планувати
 *  3. Completed (виконані) — завжди в низ
 *
 * У межах однієї групи — алфавіт по українській локалі.
 */
export interface ForecastSortable {
  forecastAmount: number;
  completed: boolean;
  clientName: string;
}

export function compareForecastRows<T extends ForecastSortable>(a: T, b: T): number {
  // Виконані завжди в низ
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  // Passive (amount=0) — після активних, але перед completed
  const aPassive = isPassiveAmount(a.forecastAmount);
  const bPassive = isPassiveAmount(b.forecastAmount);
  if (aPassive !== bPassive) return aPassive ? 1 : -1;
  // У межах групи — алфавіт
  return (a.clientName || '').localeCompare(b.clientName || '', 'uk');
}

export interface GapSortable {
  potentialAmount: number;
  completed: boolean;
  clientName: string;
}

export function compareGapRows<T extends GapSortable>(a: T, b: T): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const aPassive = isPassiveAmount(a.potentialAmount);
  const bPassive = isPassiveAmount(b.potentialAmount);
  if (aPassive !== bPassive) return aPassive ? 1 : -1;
  return (a.clientName || '').localeCompare(b.clientName || '', 'uk');
}

/**
 * Класифікація стану менеджера для PlanningReadinessCard:
 *  - finalized  — усі бренди finalized І мають хоч одну active суму
 *  - partial    — частково заповнено
 *  - empty      — жодного бренду з активною сумою
 *
 * `brandsWithActiveAmount` — бренди де є хоч один рядок з amount > 0
 * `brandsFinalized`        — бренди з finalized_at != null у period_summaries
 *                            AND які мають хоч одну active суму (intersection)
 *
 * Тобто бренд з finalized=true але усіма рядками amount=0 НЕ зараховується
 * як finalized — це «не заповнений».
 */
export function classifyManagerStatus(
  brandsWithActiveCount: number,
  brandsFinalizedActiveCount: number,
  totalBrands: number,
): 'finalized' | 'partial' | 'empty' {
  if (brandsFinalizedActiveCount === totalBrands) return 'finalized';
  if (brandsWithActiveCount === 0) return 'empty';
  return 'partial';
}
