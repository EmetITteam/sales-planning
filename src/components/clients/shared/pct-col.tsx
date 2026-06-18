/**
 * <PctCol> — праве вирівнювання колонки «% виконання».
 * Traffic-light colors: ≥100 emerald-dark, ≥80 emerald, ≥50 amber, <50 rose.
 * loading/disabled → '—'.
 *
 * Виокремлено з clients-page.tsx (Day 2 рефактору god-component).
 */
export function PctCol({
  pct,
  loading,
  disabled,
}: {
  pct: number | null;
  loading: boolean;
  disabled: boolean;
}) {
  let cls = 'text-muted-foreground/50';
  if (!loading && !disabled && pct !== null) {
    if (pct >= 100) cls = 'text-emerald-700';
    else if (pct >= 80) cls = 'text-emerald-600';
    else if (pct >= 50) cls = 'text-amber-600';
    else cls = 'text-rose-600';
  }
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
        Викон.
      </p>
      <p className={`text-[13px] font-bold font-mono tabular-nums mt-1 leading-none ${cls}`}>
        {loading || disabled || pct === null ? '—' : `${pct.toFixed(0)}%`}
      </p>
    </div>
  );
}
