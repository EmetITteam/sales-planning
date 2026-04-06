import type { PeriodInfo } from './types';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Генерація тижнів строго в рамках місяця
export function getWeeksForMonth(year: number, month: number): PeriodInfo[] {
  const weeks: PeriodInfo[] = [];
  const monthFirst = new Date(year, month, 1);
  const monthLast = new Date(year, month + 1, 0);

  let weekStart = new Date(year, month, 1);
  let id = 1;

  while (weekStart.getTime() <= monthLast.getTime()) {
    // Кінець тижня — найближча неділя, але не пізніше останнього дня місяця
    const dow = weekStart.getDay(); // 0=нд, 1=пн...
    const daysToSunday = dow === 0 ? 0 : 7 - dow;
    const weekEnd = new Date(year, month, weekStart.getDate() + daysToSunday);

    // Обрізаємо по останньому дню місяця
    const clampedEnd = weekEnd.getTime() > monthLast.getTime() ? new Date(monthLast) : weekEnd;

    weeks.push({
      id: id++,
      weekStart: toDateStr(weekStart),
      weekEnd: toDateStr(clampedEnd),
      month: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      isActive: false,
    });

    // Наступний тиждень = день після кінця поточного
    weekStart = new Date(year, month, clampedEnd.getDate() + 1);
  }

  // Поточний тиждень
  const now = new Date(2026, 3, 6); // 6 квітня 2026 для демо
  weeks.forEach(w => {
    const ws = new Date(w.weekStart);
    const we = new Date(w.weekEnd);
    if (now >= ws && now <= we) {
      w.isActive = true;
    }
  });

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
