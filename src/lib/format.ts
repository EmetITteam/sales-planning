export function formatUSD(amount: number): string {
  return '$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
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

export function getStatusColor(factPct: number, expectedPct: number): 'green' | 'yellow' | 'red' {
  const diff = factPct - expectedPct;
  if (diff >= -5) return 'green';
  if (diff >= -15) return 'yellow';
  return 'red';
}

export function getProbColor(prob: number) {
  if (prob === 100) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (prob === 70) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
}

export function getTrafficLight(pct: number, expected: number) {
  const diff = pct - expected;
  if (diff >= -5) return { color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500', label: 'На плані' };
  if (diff >= -15) return { color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500', label: 'Ризик' };
  return { color: 'text-rose-600', bg: 'bg-rose-50', dot: 'bg-rose-500', label: 'Відставання' };
}
