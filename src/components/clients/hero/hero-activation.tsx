import { heroCardCls } from './hero-utils';

/**
 * Card 3 — «План активації бази» (Action B): план з 1С vs факт активовано.
 * Має 2 toggle-фільтри: «з планом» + «у фокусі».
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function HeroActivation({
  index,
  rows,
  planSum,
  activatedSum,
  hasDoc,
  withPlanCount,
  focusedCount,
  activeFilter,
  onFilterChange,
}: {
  index: number;
  rows: Array<{ uiCat: string; label: string; dotClass: string; planCount: number; activated: number }>;
  planSum: number;
  activatedSum: number;
  hasDoc: boolean;
  withPlanCount: number;
  focusedCount: number;
  activeFilter: string;
  onFilterChange: (f: 'all' | 'focused' | 'with-plan') => void;
}) {
  const pct = planSum > 0 ? Math.round((activatedSum / planSum) * 100) : 0;
  let pctColor = 'text-rose-600';
  if (pct >= 80) pctColor = 'text-emerald-600';
  else if (pct >= 50) pctColor = 'text-amber-600';
  const planFilterActive = activeFilter === 'with-plan';
  const focusFilterActive = activeFilter === 'focused';
  const amb = !hasDoc ? 'accent' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План активації</p>
      </div>
      {hasDoc && planSum > 0 ? (
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
              {activatedSum}
              <span className="text-[22px] font-medium text-muted-foreground"> / {planSum}</span>
            </p>
            <p className={`text-[14px] font-bold ${pctColor}`}>{pct}%</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">активовано клієнтів з плану</p>
        </div>
      ) : (
        <div className="py-1">
          <p className="text-[13px] font-semibold text-muted-foreground">План активації не заведено в 1С</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[11px]">
          {rows.map(r => (
            <div key={r.uiCat} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${r.dotClass}`} />
              <span className="text-foreground flex-1 truncate">{r.label}</span>
              <span className="font-mono font-bold tabular-nums">
                <span className={r.activated >= r.planCount ? 'text-emerald-600' : 'text-foreground'}>{r.activated}</span>
                <span className="text-muted-foreground font-normal"> / {r.planCount}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => onFilterChange(planFilterActive ? 'all' : 'with-plan')}
          className={`flex items-center justify-between px-2 py-1 -mx-2 rounded-lg text-[11px] transition-colors ${
            planFilterActive
              ? 'bg-emet-blue/15 text-emet-blue font-bold'
              : 'hover:bg-emet-blue/5 text-foreground'
          }`}
          title="Клік — відфільтрувати лише клієнтів з планом"
        >
          <span>{planFilterActive ? '✓ ' : ''}Клієнтів з планом</span>
          <span className="font-mono font-bold tabular-nums">{withPlanCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onFilterChange(focusFilterActive ? 'all' : 'focused')}
          className={`flex items-center justify-between px-2 py-1 -mx-2 rounded-lg text-[11px] transition-colors ${
            focusFilterActive
              ? 'bg-violet-500/15 text-violet-700 font-bold'
              : 'hover:bg-violet-500/5 text-foreground'
          }`}
          title="Клік — відфільтрувати лише клієнтів у фокусі"
        >
          <span>{focusFilterActive ? '✓ ' : ''}Клієнтів у фокусі</span>
          <span className="font-mono font-bold tabular-nums">{focusedCount}</span>
        </button>
      </div>
    </div>
  );
}
