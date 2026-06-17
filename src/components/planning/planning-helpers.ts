import { Phone, MessageCircle, Calendar, GraduationCap } from 'lucide-react';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { getMonthName } from '@/lib/periods';
import { pctOf } from '@/lib/format';
interface PeriodLike {
  month: string;
  weekStart: string;
  weekEnd: string;
}

/**
 * Етапи планування. Доступні і у «Прогноз по активних», і у «Закриття розриву».
 * Опція "Навчання" розкриває селектор обучень з 1С (плюс поле коментаря).
 */
export const STAGE_OPTIONS = [
  { value: 'Дзвінок', icon: Phone },
  { value: 'Мессенджер', icon: MessageCircle },
  { value: 'Зустріч', icon: Calendar },
  { value: 'Навчання', icon: GraduationCap },
] as const;

/**
 * Чисті обчислення «очікувано / факт / відхилення» по поточному періоду.
 *
 * Використовує РОБОЧІ ДНІ (не календарні), як на дашборді. Свята України
 * враховані у working-days.ts.
 *
 * ⚠️ Парсимо вручну (не `new Date(string)`) — на UTC-серверах локальний час
 * може зсунутись на день назад: `new Date('2026-05-01')` → квітень при .getMonth().
 *
 * Виокремлено з planning-form.tsx (Day 6 рефактору god-component).
 */
export function computePeriodStats({
  currentPeriod,
  planAmount,
  factAmount,
}: {
  currentPeriod: PeriodLike;
  planAmount: number;
  factAmount: number;
}) {
  const [my, mm, md] = currentPeriod.month.split('-').map(Number);
  const periodMonth = new Date(my || new Date().getFullYear(), (mm || 1) - 1, md || 1);
  const [ey, em, ed] = currentPeriod.weekEnd.split('-').map(Number);
  const periodEndDate = new Date(ey || my || new Date().getFullYear(), (em || mm || 1) - 1, ed || md || 1);
  const totalWorkingDays = getWorkingDaysInMonth(periodMonth.getFullYear(), periodMonth.getMonth());
  const passedWorkingDays = getPassedWorkingDays(periodMonth.getFullYear(), periodMonth.getMonth(), periodEndDate);
  const periodLabel = getMonthName(periodMonth.getFullYear(), periodMonth.getMonth());
  const expectedAmount = totalWorkingDays > 0 ? (planAmount / totalWorkingDays) * passedWorkingDays : 0;
  const expectedPct = pctOf(expectedAmount, planAmount);
  const factPct = pctOf(factAmount, planAmount);
  const deviation = factPct - expectedPct;

  return {
    periodMonth,
    periodEndDate,
    totalWorkingDays,
    passedWorkingDays,
    periodLabel,
    expectedAmount,
    expectedPct,
    factPct,
    deviation,
  };
}
