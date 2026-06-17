import { CheckCircle2, AlertCircle } from 'lucide-react';
import { isHiddenProperty } from '../client-helpers';

/**
 * Об'єднана картка «Інформація по клієнту» — компактна на 1 строчку.
 * Освіта · ✓ Документи · властивості-chips (inline).
 * Технічні properties (viber-валідність тощо) сховані через isHiddenProperty.
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */
export function ClientInfoBlock({
  clientInfo,
}: {
  clientInfo: import('@/lib/mityng-types').ClientInfoFromReport;
}) {
  const props = (clientInfo.properties ?? []).filter(p => !isHiddenProperty(p));
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Інформація по клієнту
      </h3>
      <div className="glass-card-soft px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Освіта:</span>
          <span className="font-semibold text-[13px]">{clientInfo.education || '—'}</span>
        </div>
        <span className="text-muted-foreground/30">·</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {clientInfo.documents ? (
            <span className="text-emerald-700 inline-flex items-center gap-1 text-[13px] font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Документи
            </span>
          ) : (
            <span className="text-rose-700 inline-flex items-center gap-1 text-[13px] font-semibold">
              <AlertCircle className="h-3.5 w-3.5" /> Без документів
            </span>
          )}
        </div>
        {props.length > 0 && <span className="text-muted-foreground/30">·</span>}
        {props.map((prop, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emet-blue/8 text-emet-blue text-[11px] font-semibold border border-emet-blue/15">
            <span className="w-1.5 h-1.5 rounded-full bg-emet-blue" />
            {prop}
          </span>
        ))}
      </div>
    </div>
  );
}
