import type { PeriodInfo } from './types';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Генерація наростаючих періодів строго в рамках місяця
// Кожен період: з 1-го числа до кінця тижня
export function getWeeksForMonth(year: number, month: number): PeriodInfo[] {
  const weeks: PeriodInfo[] = [];
  const monthFirst = new Date(year, month, 1);
  const monthLast = new Date(year, month + 1, 0);

  // Знаходимо кінці тижнів (неділі) в межах місяця
  let current = new Date(year, month, 1);
  let id = 1;

  while (current.getTime() <= monthLast.getTime()) {
    const dow = current.getDay(); // 0=нд, 1=пн...
    const daysToSunday = dow === 0 ? 0 : 7 - dow;
    const weekEnd = new Date(year, month, current.getDate() + daysToSunday);
    const clampedEnd = weekEnd.getTime() > monthLast.getTime() ? new Date(monthLast) : weekEnd;

    // Наростаючий: завжди з 1-го числа
    weeks.push({
      id: id++,
      weekStart: toDateStr(monthFirst), // завжди 1-е число
      weekEnd: toDateStr(clampedEnd),
      month: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      isActive: false,
    });

    current = new Date(year, month, clampedEnd.getDate() + 1);
  }

  // Поточний тиждень
  const now = new Date();
  for (let i = 0; i < weeks.length; i++) {
    const we = new Date(weeks[i].weekEnd);
    const prevEnd = i > 0 ? new Date(weeks[i - 1].weekEnd) : new Date(year, month, 0);
    if (now > prevEnd && now <= we) {
      weeks[i].isActive = true;
    }
  }

  return weeks;
}

const MONTH_NAMES_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export function getMonthName(year: number, month: number): string {
  return `${MONTH_NAMES_UK[month]} ${year}`;
}

export function getMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_UK[m]} ${y}`;
    options.push({ value, label });
  }
  return options;
}

export function formatWeekShort(weekStart: string, weekEnd: string): string {
  const [, sm, sd] = weekStart.split('-');
  const [, em, ed] = weekEnd.split('-');
  return `${sd}.${sm} — ${ed}.${em}`;
}

// Кількість днів у наростаючому періоді
export function getDaysInPeriod(weekEnd: string): number {
  const end = new Date(weekEnd);
  return end.getDate(); // бо починається з 1-го
}
