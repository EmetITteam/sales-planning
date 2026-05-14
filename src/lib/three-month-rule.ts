/**
 * Правило «активний/у gap по бренду» з фіксованим cutoff на плановий місяць.
 *
 * Бізнес-правило (узгоджено з директором продажів):
 *  - Клієнт «активний по бренду» якщо купував цей бренд у вікні
 *    [planMonthStart − 3 місяці, planMonthStart) — тобто у трьох календарних
 *    місяцях ДО планового періоду.
 *  - Купівля У МЕЖАХ планового місяця НЕ змінює бакет — це факт виконання
 *    плану, а не зміна категорії.
 *
 * Чому fixed cutoff (а не «90 днів від сьогодні»):
 *  - Класифікація має бути СТАБІЛЬНОЮ весь плановий місяць
 *  - Менеджер відкриває форму 2/3/5/20-го числа → бачить ті самі бакети
 *  - РМ і Director дашборди — стабільні цифри для звітності
 *  - Без цього клієнт що зробив покупку всередині планового місяця
 *    «переплигує» з gap у forecast — і виникають дублі (один клієнт у двох
 *    таблицях planування одночасно, як було з Кравченко 2026-05-14)
 *
 * Чому 90 днів (а не 3 календарні місяці):
 *  - Спрощення обчислень + збіг з історичною логікою (THREE_MONTHS_MS)
 *  - 90 ≈ середній квартал; різниця у пів-дня на місячному горизонті
 *    не критична для бізнес-рішення
 */

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Початок планового місяця у local-часі (00:00 1-го числа).
 *
 * @param planMonth — формат 'YYYY-MM' або 'YYYY-MM-DD' (наприклад '2026-05'
 *                    або '2026-05-01'). Перші 7 символів використовуються.
 */
export function getPlanMonthStartMs(planMonth: string): number {
  const ym = planMonth.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error(`Invalid planMonth format: '${planMonth}'. Expected YYYY-MM or YYYY-MM-DD.`);
  }
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
}

/**
 * Cutoff timestamp = початок планового місяця мінус 90 днів.
 * Для travня 2026 (2026-05-01 00:00) cutoff ≈ 2026-02-01 00:00.
 */
export function getCutoffMs(planMonth: string): number {
  return getPlanMonthStartMs(planMonth) - THREE_MONTHS_MS;
}

/**
 * Чи цей клієнт активний по бренду для конкретного планового місяця.
 *
 * Active = купив у вікні [cutoff, planMonthStart) — лише ДО початку плану.
 * Купівлі ВСЕРЕДИНІ планового місяця → не active (це факт, не зміна категорії).
 *
 * @param lastPurchaseDate — рядок 'YYYY-MM-DD' або null
 * @param planMonth — 'YYYY-MM' або 'YYYY-MM-DD'
 * @returns true якщо клієнт у бакеті «активний», false — у бакеті «gap»
 */
export function isActiveForBrand(
  lastPurchaseDate: string | null | undefined,
  planMonth: string,
): boolean {
  if (!lastPurchaseDate) return false;
  const [y, m, d] = lastPurchaseDate.split('-').map(Number);
  if (!y || !m || !d) return false;
  const lastBuyMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const planMonthStartMs = getPlanMonthStartMs(planMonth);
  const cutoffMs = planMonthStartMs - THREE_MONTHS_MS;
  return lastBuyMs >= cutoffMs && lastBuyMs < planMonthStartMs;
}
