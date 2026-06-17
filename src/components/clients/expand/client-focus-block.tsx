import type { ClientFocusItem } from '@/lib/use-my-clients';

/**
 * Блок «Діючі фокуси клієнта» — між «Інформація» і «План×Факт».
 * Показує всі активні фокуси як glass-card-soft рядки з focusName + dates.
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */
export function ClientFocusBlock({ focuses }: { focuses: ClientFocusItem[] }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Діючі фокуси клієнта · {focuses.length}
      </h3>
      <div className="space-y-1.5">
        {focuses.map((f, i) => (
          <div key={i} className="glass-card-soft p-3 grid grid-cols-[8px_minmax(0,1fr)_auto] gap-3 items-center">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <p className="text-[13px] font-semibold leading-snug">{f.focusName}</p>
            {(f.since || f.validUntil) && (
              <p className="text-[10px] text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                {f.since || '?'} → {f.validUntil || 'безстроково'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
