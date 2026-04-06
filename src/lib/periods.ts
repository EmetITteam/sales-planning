import type { PeriodInfo } from './types';

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Генерация недель строго в рамках месяца
export function getWeeksForMonth(year: number, month: number): PeriodInfo[] {
  const weeks: PeriodInfo[] = [];
  const monthFirst = new Date(year, month, 1);
  const monthLast = new Date(year, month + 1, 0);

  // Начинаем всегда с 1-го числа месяца
  let weekStart = new Date(monthFirst);
  let id = 1;

  while (weekStart <= monthLast) {
    // Конец недели — ближайшее воскресенье, но не позже последнего дня месяца
    const dayOfWeek = weekStart.getDay(); // 0=вс, 1=пн...
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);

    // Обрезаем по последнему дню месяца
    const clampedEnd = weekEnd > monthLast ? monthLast : weekEnd;

    weeks.push({
      id: id++,
      weekStart: toDateStr(weekStart),
      weekEnd: toDateStr(clampedEnd),
      month: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      isActive: false,
    });

    // Следующая неделя начинается на следующий день после конца текущей
    weekStart = new Date(clampedEnd);
    weekStart.setDate(weekStart.getDate() + 1);
  }

  // Пометить текущую неделю активной
  const now = new Date(2026, 2, 6); // для демо
  weeks.forEach(w => {
    if (now >= new Date(w.weekStart) && now <= new Date(w.weekEnd)) {
      w.isActive = true;
    }
  });

  return weeks;
}

// Список месяцев
export function getMonthOptions() {
  return [
    { value: '2026-01', label: 'Січень 2026' },
    { value: '2026-02', label: 'Лютий 2026' },
    { value: '2026-03', label: 'Березень 2026' },
    { value: '2026-04', label: 'Квітень 2026' },
  ];
}

export function formatWeekShort(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart);
  const e = new Date(weekEnd);
  const sd = String(s.getDate()).padStart(2, '0');
  const sm = String(s.getMonth() + 1).padStart(2, '0');
  const ed = String(e.getDate()).padStart(2, '0');
  const em = String(e.getMonth() + 1).padStart(2, '0');
  return `${sd}.${sm} — ${ed}.${em}`;
}
