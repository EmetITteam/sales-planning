import { fmtUSD, heroCardCls } from './hero-utils';

/**
 * Card 1 — «Виконання» (план / факт / % / норма / темп).
 * Loading skeleton поки 1С getRegistryPlans тягнеться АБО план=0 і це не trial.
 * Trial-новачок: 1С виставила $1-sentinel → % безглуздий, показуємо badge.
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function HeroVykonannya({
  index,
  planTotal,
  factTotal,
  pct,
  calcPct,
  forecastPct,
  completedCount,
  withPlanCount,
  isTrial,
  loading,
  onRefetchPlan,
}: {
  index: number;
  planTotal: number;
  factTotal: number;
  pct: number;
  calcPct: number;
  forecastPct: number;
  completedCount: number;
  withPlanCount: number;
  isTrial: boolean;
  loading?: boolean;
  onRefetchPlan?: () => void;
}) {
  // Loading skeleton — поки 1С getRegistryPlans тягнеться АБО план=0 і це не
  // trial. Background polling + auto-reload у parent оновлять дані без участі
  // користувача. Раніше після вичерпання fast retry (~21с) UI переходив у
  // false-0% rose — користувач бачив «відставання» хоча план просто ще не
  // завантажився з 1С.
  const showLoading = loading || (!isTrial && planTotal === 0);
  if (showLoading) {
    return (
      <div className={`${heroCardCls} ambient-accent`} style={{ ['--i' as string]: index }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emet-blue animate-pulse" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
        </div>
        <p className="text-[36px] font-bold tracking-[-1px] leading-none text-slate-300 animate-pulse">—</p>
        <div className="flex flex-col gap-1.5">
          <div className="h-2.5 w-24 bg-slate-200/60 rounded animate-pulse" />
          <div className="h-2.5 w-32 bg-slate-200/60 rounded animate-pulse" />
          <div className="h-2.5 w-20 bg-slate-200/60 rounded animate-pulse" />
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1">Завантаження плану з 1С…</p>
      </div>
    );
  }
  void onRefetchPlan;
  if (isTrial) {
    return (
      <div className={`${heroCardCls} ambient-accent`} style={{ ['--i' as string]: index }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
        </div>
        <p className="text-[36px] font-bold tracking-[-1px] leading-none text-slate-400">—</p>
        <div className="flex flex-col gap-1">
          <span className="inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-400/12 border border-slate-300/50 text-slate-600 backdrop-blur-sm">Новачок</span>
          <p className="text-[11px] text-muted-foreground leading-snug">1С ще не виставила план — менеджер на випробувальному. Факт: <span className="amount font-semibold text-foreground">{fmtUSD(factTotal)}</span></p>
        </div>
      </div>
    );
  }
  let pctColor = 'text-rose-600';
  if (pct >= 100) pctColor = 'text-emerald-700';
  else if (pct >= calcPct) pctColor = 'text-emerald-600';
  else if (pct >= calcPct - 10) pctColor = 'text-amber-600';
  let forecastColor = 'text-rose-600';
  if (forecastPct >= 100) forecastColor = 'text-emerald-700';
  else if (forecastPct >= 80) forecastColor = 'text-amber-600';
  const execPct = withPlanCount > 0 ? Math.round((completedCount / withPlanCount) * 100) : 0;
  const execColor = execPct >= 80 ? 'text-emerald-600' : execPct >= 50 ? 'text-amber-600' : 'text-rose-600';
  const amb = pct >= calcPct ? 'good' : pct >= calcPct - 15 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emet-blue shadow-[0_0_6px_currentColor] text-emet-blue" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
      </div>
      <div>
        <p className={`text-[36px] font-bold tracking-[-1px] tabular-nums leading-none ${pctColor}`}>
          {pct.toFixed(0)}<span className="text-[22px] font-medium text-muted-foreground">%</span>
        </p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">План:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right amount">{fmtUSD(planTotal)}</span>
        <span className="text-muted-foreground">Факт:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right amount">{fmtUSD(factTotal)}</span>
        <span className="text-muted-foreground">Норма:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right">{calcPct.toFixed(0)}%</span>
        <span className="text-muted-foreground">Темп:</span>
        <span className={`font-mono font-semibold tabular-nums text-right ${forecastColor}`}>{forecastPct.toFixed(0)}%</span>
      </div>
      <div className="pt-2 border-t border-slate-200/50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold font-mono tabular-nums">{completedCount}<span className="text-muted-foreground font-normal"> / {withPlanCount}</span></span>
          <span className={`text-[12px] font-bold ${execColor}`}>{execPct}%</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">клієнтів виконали запланований обсяг продажів</p>
      </div>
    </div>
  );
}
