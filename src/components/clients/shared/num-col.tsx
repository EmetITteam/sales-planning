/**
 * <NumCol> — праве вирівнювання числової колонки (план/факт/розрив тощо).
 * Stateless, hidden md-: на mobile показується через inline-блок у ClientRow.
 *
 * Виокремлено з clients-page.tsx (Day 2 рефактору god-component).
 */
export function NumCol({
  label,
  value,
  loading,
  emptyAs = 'zero',
}: {
  label: string;
  value: number | null;
  loading: boolean;
  /** 'zero' → показати «$0» сірим; null → показати «—». */
  emptyAs?: 'zero' | null;
}) {
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
        {label}
      </p>
      <p className="text-[13px] font-bold font-mono tabular-nums mt-1 leading-none whitespace-nowrap amount">
        {loading ? (
          <span className="text-muted-foreground/40">—</span>
        ) : value && value > 0 ? (
          `$${Math.round(value).toLocaleString('en-US')}`
        ) : emptyAs === 'zero' ? (
          <span className="text-muted-foreground/60">$0</span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </p>
    </div>
  );
}
