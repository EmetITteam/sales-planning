import { heroCardCls } from './hero-utils';
import { CAT_COLOR, CAT_LABEL, type UICategory } from '../client-helpers';

/**
 * Card 2 — «База клієнтів»: всього + категорії + купили цього міс + резерв.
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function HeroBaza({
  index,
  baseTotal,
  counts,
  boughtByCategory,
  totalBought,
  reservedCount,
  reservedActiveCount,
}: {
  index: number;
  baseTotal: number;
  counts: Record<UICategory, number>;
  boughtByCategory: Record<UICategory, number>;
  totalBought: number;
  reservedCount: number;
  reservedActiveCount: number;
}) {
  const visibleCats: UICategory[] = ['active', 'sleeping', 'new', 'lost', 'none'];
  return (
    <div className={`${heroCardCls} ambient-accent`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">База клієнтів</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">{baseTotal}</p>
        <p className="text-[11px] text-muted-foreground">клієнтів</p>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px]">
        <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <span /><span />
          <span className="text-right">база</span>
          <span className="text-right">купили</span>
        </div>
        {visibleCats.filter(c => counts[c] > 0).map(c => (
          <div key={c} className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center">
            <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c].dot}`} />
            <span className="text-foreground">{CAT_LABEL[c]}</span>
            <span className="font-mono font-bold tabular-nums text-right">{counts[c]}</span>
            <span className="font-mono font-bold tabular-nums text-right text-emerald-600">{boughtByCategory[c] ?? 0}</span>
          </div>
        ))}
        {reservedCount > 0 && (
          <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Резерв</span>
            <span className="font-mono font-bold tabular-nums text-right">{reservedCount}</span>
            <span className="font-mono font-bold tabular-nums text-right text-emerald-600">{reservedActiveCount}</span>
          </div>
        )}
        <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center pt-1 mt-1 border-t border-white/40 font-bold">
          <span /><span className="text-foreground">Разом купили</span>
          <span />
          <span className="font-mono tabular-nums text-right text-emerald-600">{totalBought}</span>
        </div>
      </div>
    </div>
  );
}
