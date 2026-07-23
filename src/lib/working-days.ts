/**
 * Розрахунок робочих днів України.
 * Робочий день = понеділок-пʼятниця, мінус святкові дні.
 */

// Святкові дні України по роках (формат YYYY-MM-DD).
// 2026 (підтверджено користувачем):
//   31 травня — Трійця, вихідний переноситься на 1 червня (понеділок)
//   24 серпня — День Незалежності
//   25 грудня — Різдво Христове
//
// 1 травня (День праці) — рахуємо як робочий день у компанії
// (у нашому графіку продажів це робочий день, а не вихідний).
//
// ⚠️ TODO: підтвердити свята 2027+ з користувачем перед 31.12.2026.
// Поки на 2027+ повертається порожня множина — будуть лише weekend, без свят.
// Це безпечніше за «всі дні робочі».
const HOLIDAYS_BY_YEAR: Record<number, Set<string>> = {
  2026: new Set([
    '2026-06-01',
    '2026-08-24',
    '2026-12-25',
  ]),
  // ⚠️ 2027 — порожньо як placeholder. Підтвердити дати з користувачем
  // до 31.12.2026, інакше ВСІ дні січня 2027 будуть рахуватись робочими
  // (тільки weekend виключаться). Це безпечніший дефолт ніж "1 січня свято",
  // який міг би неочікувано не врахувати реальні рішення Кабміну.
  2027: new Set([]),
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function isHoliday(d: Date): boolean {
  const holidays = HOLIDAYS_BY_YEAR[d.getFullYear()];
  return holidays ? holidays.has(dateKey(d)) : false;
}

/**
 * Чи заповнені свята для року. Реальний рік України ЗАВЖДИ має свята (мінімум
 * 24.08 День Незалежності + 25.12 Різдво), тому ПОРОЖНІЙ або ВІДСУТНІЙ набір =
 * «не заповнено» (напр. 2027 — placeholder). Використовується щоб не рахувати
 * робочі дні мовчки лише як пн-пт, коли свята ще не внесені.
 */
export function isHolidayYearConfigured(year: number): boolean {
  const set = HOLIDAYS_BY_YEAR[year];
  return !!set && set.size > 0;
}

/**
 * Guard: кидає помилку, якщо свята року не заповнені. Викликати ПЕРЕД
 * розрахунками, де неточність критична (дедлайни звіту РОП «16:00 4-го роб.
 * дня»). Без цього рік без свят дав би НЕПРАВИЛЬНИЙ дедлайн (лише пн-пт).
 */
export function assertHolidaysConfigured(year: number): void {
  if (!isHolidayYearConfigured(year)) {
    throw new Error(
      `working-days: свята ${year} не заповнені у HOLIDAYS_BY_YEAR — розрахунок ` +
      `робочих днів був би неточним (лише пн-пт). Внесіть свята ${year} перед використанням.`,
    );
  }
}

// Warn ОДИН раз на рік у розрахункових функціях — щоб «мовчазний» пн-пт-режим
// був видимий у логах, але не ламав дашборди (на відміну від assert-guard).
const warnedYears = new Set<number>();
function warnIfHolidaysMissing(year: number): void {
  if (isHolidayYearConfigured(year) || warnedYears.has(year)) return;
  warnedYears.add(year);
  console.warn(
    `[working-days] свята ${year} не заповнені — робочі дні рахуються лише як ` +
    `пн-пт (без свят). Заповніть HOLIDAYS_BY_YEAR[${year}].`,
  );
}

export function isWorkingDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d);
}

/** Кількість робочих днів у місяці. month: 0-11 (як у Date) */
export function getWorkingDaysInMonth(year: number, month: number): number {
  warnIfHolidaysMissing(year);
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    if (isWorkingDay(new Date(year, month, day))) count++;
  }
  return count;
}

/**
 * Кількість робочих днів від 1-го числа місяця по asOfDate включно.
 * Якщо asOfDate < 1-го числа місяця — повертає 0.
 * Якщо asOfDate > останнього числа місяця — повертає всі робочі дні місяця.
 */
export function getPassedWorkingDays(year: number, month: number, asOfDate: Date): number {
  warnIfHolidaysMissing(year);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  if (asOfDate < monthStart) return 0;
  const endDate = asOfDate > monthEnd ? monthEnd : asOfDate;

  let count = 0;
  for (let day = 1; day <= endDate.getDate(); day++) {
    if (isWorkingDay(new Date(year, month, day))) count++;
  }
  return count;
}

/**
 * Дата N-го робочого дня в місяці. month: 0-11.
 * Якщо N перевищує кількість робочих днів — повертає останній робочий день місяця.
 * Використовується для порівняння з минулим місяцем на той же N-й робочий день.
 */
export function getNthWorkingDay(year: number, month: number, n: number): Date {
  warnIfHolidaysMissing(year);
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  let lastWorkingDay = new Date(year, month, 1);
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    if (isWorkingDay(d)) {
      count++;
      lastWorkingDay = d;
      if (count === n) return d;
    }
  }
  return lastWorkingDay;
}

/**
 * Прогрес місяця у відсотках по робочих днях.
 * Це і є "Розрахунковий %" — норма виконання плану на дату.
 */
export function getMonthProgressPct(year: number, month: number, asOfDate: Date): number {
  const total = getWorkingDaysInMonth(year, month);
  if (total === 0) return 0;
  const passed = getPassedWorkingDays(year, month, asOfDate);
  return (passed / total) * 100;
}
