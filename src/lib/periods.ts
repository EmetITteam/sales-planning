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
  const now = new Date(2026, 3, 6); // 6 квітня для демо
  for (let i = 0; i < weeks.length; i++) {
    const we = new Date(weeks[i].weekEnd);
    const prevEnd = i > 0 ? new Date(weeks[i - 1].weekEnd) : new Date(year, month, 0);
    if (now > prevEnd && now <= we) {
      weeks[i].isActive = true;
    }
  }

  return weeks;
}

export function getMonthOptions() {
  return [
    { value: '2026-01', label: 'Січень 2026' },
    { value: '2026-02', label: 'Лютий 2026' },
    { value: '2026-03', label: 'Березень 2026' },
    { value: '2026-04', label: 'Квітень 2026' },
  ];
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
