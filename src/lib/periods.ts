import type { PeriodInfo } from './types';

// Генерация недель для месяца
export function getWeeksForMonth(year: number, month: number): PeriodInfo[] {
  const weeks: PeriodInfo[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Найти первый понедельник
  let current = new Date(firstDay);
  const dayOfWeek = current.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  current.setDate(current.getDate() + diffToMonday);

  let id = 1;
  while (current <= lastDay) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    weeks.push({
      id: id++,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      month: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      isActive: false,
    });

    current.setDate(current.getDate() + 7);
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
