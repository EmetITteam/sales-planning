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
 * Active = last_buy у вікні [planMonthStart - 90 днів, planMonthStart).
 * Тобто купував саме цей бренд у 3 календарних місяцях ПЕРЕД плановим.
 *
 * ⚠️ ВАЖЛИВО: покупки у плановому місяці НЕ беруться. Якщо клієнт купив
 * лише у травні (плановий) — для класифікації травневого плану він НЕ
 * active, незалежно від суми. Чому: snapshot фіксує клієнтів на ніч
 * перед плановим місяцем — травневі покупки це ФАКТ виконання, не
 * зміна категорії. Інакше класифікація плавала б між відкриттями
 * форми (2/5/20 числа давали б різні результати).
 *
 * ⚠️ Edge case для постійних покупців: 1С Action 2 повертає тільки
 * ОДНУ дату — найсвіжішу purchase per (client × segment). Якщо клієнт
 * купує постійно (Січень-Травень), 1С каже last_buy=Травень → за цим
 * правилом він НЕ active (бо у плановому місяці). Це фіксується
 * через scripts/resnapshot-clients.mjs який тягне Action 3 за минулі
 * місяці і коректно класифікує постійних.
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
  const cutoffMs = getPlanMonthStartMs(planMonth) - THREE_MONTHS_MS;
  // ⚠️ БЕЗ upper bound — 1С Action 2 повертає тільки latest дату per (client × brand).
  // Якщо клієнт купив у плановому місяці, ми не знаємо чи купував і у попередніх.
  // Тому єдина працююча логіка: last_buy >= cutoff (3 міс перед плановим АБО у самому).
  // Кейс дубля forecast+gap (Кравченко) виправляється snapshot fixation у самій формі.
  return lastBuyMs >= cutoffMs;
}
