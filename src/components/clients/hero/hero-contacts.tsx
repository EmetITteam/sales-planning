import { Calendar, Phone } from 'lucide-react';
import { heroCardCls } from './hero-utils';

/**
 * Card 4 — «Контактна активність» (зустрічі + дзвінки цього міс).
 * Поки активності вантажаться (3 чанки 1С) — показуємо loader щоб не
 * відобразити всю базу як red «без контактів».
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function HeroContacts({
  index,
  loading,
  baseTotal,
  withCall,
  withMeeting,
  coveragePct,
  noContacts,
  noContactsWithPlan,
  noContactsWithoutPlan,
}: {
  index: number;
  loading: boolean;
  baseTotal: number;
  withCall: number;
  withMeeting: number;
  coveragePct: number;
  noContacts: number;
  noContactsWithPlan: number;
  noContactsWithoutPlan: number;
}) {
  // baseTotal лишається у пропсах для майбутніх використань (debug, hover-tooltip)
  void baseTotal;
  let pctColor = 'text-rose-600';
  if (coveragePct >= 80) pctColor = 'text-emerald-600';
  else if (coveragePct >= 50) pctColor = 'text-amber-600';
  const amb = loading ? 'accent' : coveragePct >= 80 ? 'good' : coveragePct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#d97706]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Контактна активність</p>
      </div>
      {loading ? (
        <div className="py-2">
          <p className="text-[36px] font-bold tracking-[-1px] leading-none text-slate-300 animate-pulse">—</p>
          <p className="text-[10px] text-muted-foreground mt-2">рахуємо контактну активність…</p>
        </div>
      ) : (<>
      <div>
        <p className={`text-[36px] font-bold tracking-[-1px] tabular-nums leading-none ${pctColor}`}>
          {coveragePct.toFixed(0)}<span className="text-[22px] font-medium text-muted-foreground">%</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">бази покрито подіями</p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Calendar className="h-3 w-3 text-emet-blue" />зустрічі:
        </span>
        <span className="font-mono font-bold tabular-nums text-right">{withMeeting}</span>
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Phone className="h-3 w-3 text-emerald-600" />дзвінки:
        </span>
        <span className="font-mono font-bold tabular-nums text-right">{withCall}</span>
        <span className="text-muted-foreground border-t border-white/40 pt-1 mt-0.5">без контактів:</span>
        <span className="font-mono font-bold tabular-nums text-right text-rose-600 border-t border-white/40 pt-1 mt-0.5">
          {noContacts}
        </span>
        <span className="text-[10px] text-muted-foreground/70 col-span-2 leading-snug">
          ↳ з планом: <span className="font-bold text-rose-600">{noContactsWithPlan}</span>
          {' · '}без плану: <span className="font-bold">{noContactsWithoutPlan}</span>
        </span>
      </div>
      </>)}
    </div>
  );
}
