export function formatUSD(amount: number): string {
  return '$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Run-rate прогноз: екстраполяція факту по поточному темпу на повний місяць у %.
 * Якщо немає робочих днів пройдено або плану — повертає 0.
 */
export function calcForecastPercent(
  factAmount: number,
  planAmount: number,
  passedWorkingDays: number,
  totalWorkingDays: number,
): number {
  if (passedWorkingDays === 0 || planAmount === 0) return 0;
  const projectedFact = (factAmount / passedWorkingDays) * totalWorkingDays;
  return (projectedFact / planAmount) * 100;
}

/**
 * "Очікуваний" — % виконання якщо менеджер виконає всі обіцянки (прогноз + закриття розриву).
 * Якщо менеджер не заповнив прогноз/розриви — повертає звичайний factPercent.
 */
export function calcExpectedPercent(
  factAmount: number,
  forecastSum: number,
  gapClosureSum: number,
  planAmount: number,
): number {
  if (planAmount === 0) return 0;
  return ((factAmount + forecastSum + gapClosureSum) / planAmount) * 100;
}

/** Відсоток зі знаком: "+5.2%" або "-3.1%" */
export function formatSignedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/** Відсоток без знака: "5.2%" */
export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** % виконання: value / total × 100. Безпечне ділення (0 при total<=0). */
export function pctOf(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

export function formatPeriod(weekStart: string, weekEnd: string): string {
  return `${formatDateShort(weekStart)} — ${formatDateShort(weekEnd)}`;
}

export function getProbColor(prob: number) {
  if (prob === 100) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (prob === 70) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
}

/**
 * Світлофор: порівнюємо поточний % виконання (factPct) з нормою на дату (calcPct).
 * Використовується скрізь у дашбордах для кольору точки/бейджу/тексту.
 *   diff >= -5%  → На плані (зелений)
 *   diff >= -15% → Ризик (бурштиновий)
 *   інше         → Відставання (червоний)
 *
 * @param pct — поточний % (factPercent у більшості випадків)
 * @param expected — норма для порівняння (calcPct: % робочих днів пройдено)
 */
export function getTrafficLight(pct: number, expected: number) {
  const diff = pct - expected;
  if (diff >= -5) return { color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500', label: 'На плані' };
  if (diff >= -15) return { color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500', label: 'Ризик' };
  return { color: 'text-rose-600', bg: 'bg-rose-50', dot: 'bg-rose-500', label: 'Відставання' };
}
