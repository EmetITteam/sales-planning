import type React from 'react';
import { Target, Clock, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatUSD, formatDateShort } from '@/lib/format';
import type { ForecastRow, GapClosureRow } from '@/lib/types';

type Metric = {
  label: string;
  value: string;
  icon: React.ReactNode;
  grad: string;
  isAmount: boolean;
  badge?: { text: string; ok: boolean };
  subline?: string;
};

/**
 * 4-метрики рядок: План / Очікуване / Факт / Відхилення.
 *
 * - План: великий + subline «Заплановано: $X» якщо є.
 * - Очікуване: на дату weekEnd, з підписом «(N р.д.)» — пройдених робочих днів.
 * - Факт: emerald gradient + traffic-light badge (ok = factPct ≥ expectedPct).
 * - Відхилення: emerald/rose gradient, +/- prefix.
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function PlanningMetricsRow({
  planAmount,
  factAmount,
  expectedAmount,
  factPct,
  expectedPct,
  deviation,
  passedWorkingDays,
  periodEndDate,
  prevMonthFactAmount,
  prevMonthPlanAmount,
  forecasts,
  gapClosures,
}: {
  planAmount: number;
  factAmount: number;
  expectedAmount: number;
  factPct: number;
  expectedPct: number;
  deviation: number;
  passedWorkingDays: number;
  periodEndDate: string;
  prevMonthFactAmount: number;
  prevMonthPlanAmount: number;
  forecasts: ForecastRow[];
  gapClosures: GapClosureRow[];
}) {
  const prevFactPct = prevMonthPlanAmount > 0
    ? (prevMonthFactAmount / prevMonthPlanAmount) * 100
    : 0;
  const factSubline = prevMonthFactAmount > 0
    ? `Мин. міс.: ${formatUSD(prevMonthFactAmount)} · ${prevFactPct.toFixed(1)}%`
    : null;
  const plannedAmountForSegment = forecasts.reduce((s, f) => s + (Number(f.forecastAmount) || 0), 0)
    + gapClosures.reduce((s, g) => s + (Number(g.potentialAmount) || 0), 0);
  const planSubline = plannedAmountForSegment > 0
    ? `Заплановано: ${formatUSD(plannedAmountForSegment)}`
    : null;

  const metrics: Metric[] = [
    {
      label: 'План місяця',
      value: formatUSD(planAmount),
      icon: <Target className="h-4.5 w-4.5" />,
      grad: 'from-emet-blue to-emet-blue-light',
      isAmount: true,
      subline: planSubline ?? undefined,
    },
    {
      label: `Очікуване на ${formatDateShort(periodEndDate)} (${passedWorkingDays} р.д.)`,
      value: formatUSD(Math.round(expectedAmount)),
      icon: <Clock className="h-4.5 w-4.5" />,
      grad: 'from-emet-blue to-emet-blue-light',
      isAmount: true,
    },
    {
      label: 'Факт',
      value: formatUSD(factAmount),
      icon: <DollarSign className="h-4.5 w-4.5" />,
      grad: 'from-emerald-500 to-teal-600',
      badge: { text: `${factPct.toFixed(1)}%`, ok: factPct >= expectedPct },
      isAmount: true,
      subline: factSubline ?? undefined,
    },
    {
      label: 'Відхилення',
      value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`,
      icon: deviation >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />,
      grad: deviation >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600',
      isAmount: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map(m => (
        <div key={m.label} className="glass-card p-4 relative overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${m.grad} text-white`}>{m.icon}</div>
            {m.badge && (
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm border ${m.badge.ok ? 'bg-emerald-500/12 border-emerald-300/40 text-emerald-600' : 'bg-rose-500/12 border-rose-300/40 text-rose-600'}`}>
                {m.badge.ok ? <ArrowUpRight className="inline h-2.5 w-2.5" /> : <ArrowDownRight className="inline h-2.5 w-2.5" />} {m.badge.text}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-medium">{m.label}</p>
          <p className={`text-xl font-extrabold tracking-tight ${m.isAmount ? 'amount' : ''}`}>{m.value}</p>
          {m.subline && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate" title={m.subline}>{m.subline}</p>
          )}
        </div>
      ))}
    </div>
  );
}
