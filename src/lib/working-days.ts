/**
 * Розрахунок робочих днів України.
 * Робочий день = понеділок-пʼятниця, мінус святкові дні.
 */

// Святкові дні України 2026 (підтверджені, формат YYYY-MM-DD)
// 31 травня — Трійця, вихідний переноситься на 1 червня (понеділок)
// 24 серпня — День Незалежності
// 25 грудня — Різдво Христове
const HOLIDAYS_2026: Set<string> = new Set([
  '2026-06-01',
  '2026-08-24',
  '2026-12-25',
]);

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
  return HOLIDAYS_2026.has(dateKey(d));
}

export function isWorkingDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d);
}

/** Кількість робочих днів у місяці. month: 0-11 (як у Date) */
export function getWorkingDaysInMonth(year: number, month: number): number {
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
