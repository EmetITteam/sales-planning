import { useMemo } from 'react';
import {
  canonicalSegmentCode,
  cleanBrandName,
  currentYearMonth,
  fmtYMShort,
  lastNMonthsBefore,
  parseMonthLabelToYM,
} from '../client-helpers';

/**
 * Історія покупок по брендах — таблиця у стилі План×Факт.
 *
 * Виключаємо поточний місяць — він вже у блоку «План × Факт цього місяця».
 * Місяці сортуємо хронологічно asc (старіші ліворуч → свіжі праворуч).
 * Фіксоване вікно з 6 ПОСЛІДОВНИХ місяців ДО поточного (без нього).
 * Біля кожного бренду — позначка «В плануванні» / «Немає в плані».
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */
export function ThreeMonthHistory({
  salesReport,
  yearlySalesReport,
  planBrands,
}: {
  salesReport: import('@/lib/mityng-types').ClientReport['salesReport'] | undefined;
  yearlySalesReport: import('@/lib/mityng-types').ClientReport['yearlySalesReport'];
  planBrands: Record<string, number>;
}) {
  // Пріоритет: yearlySalesReport (12 міс) → fallback salesReport (3 міс).
  const sourceBrands = yearlySalesReport?.brands ?? salesReport?.brands ?? [];
  const currentYM = currentYearMonth();
  const MAX_MONTHS = 6;

  // Статичне вікно: 6 ПОСЛІДОВНИХ місяців ДО поточного (без нього), asc.
  // Місяць без покупок = $0 (раніше колонки виходили розріджені).
  const monthOrder = lastNMonthsBefore(currentYM, MAX_MONTHS);
  const windowSet = new Set(monthOrder);

  // Кожен бренд: сума по YM у межах вікна.
  const brands = sourceBrands.map(b => {
    const byYM: Record<string, number> = {};
    for (const m of (b.salesByMonth ?? [])) {
      const ym = parseMonthLabelToYM(m.month);
      if (ym && windowSet.has(ym)) byYM[ym] = (byYM[ym] ?? 0) + (Number(m.amount) || 0);
    }
    const total = monthOrder.reduce((s, ym) => s + (byYM[ym] ?? 0), 0);
    return { ...b, byYM, totalAmount: total };
  }).filter(b => b.totalAmount > 0);

  // Нормалізуємо planBrands ключі через canonicalSegmentCode (Vitaran Cosmetics→OTHER).
  const planSet = useMemo(() => {
    const s = new Set<string>();
    for (const k of Object.keys(planBrands)) {
      if ((planBrands[k] ?? 0) > 0) s.add(canonicalSegmentCode(k));
    }
    return s;
  }, [planBrands]);

  const isBrandInPlan = (brandName: string): boolean => {
    return planSet.has(canonicalSegmentCode(brandName));
  };

  if (brands.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Покупки попередніх місяців
        </h3>
        <p className="text-[12px] text-muted-foreground">Покупок за попередні місяці не було.</p>
      </div>
    );
  }

  const sorted = [...brands].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Покупки за останні 6 місяців
      </h3>
      <div className="space-y-1.5">
        {sorted.map(b => {
          const byMonth = b.byYM;
          const inPlan = isBrandInPlan(b.brandName);
          const total = Math.round(b.totalAmount || 0);
          const planPill = (
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
              inPlan
                ? 'bg-emet-blue/10 text-emet-blue border border-emet-blue/20'
                : 'bg-slate-400/10 text-slate-500 border border-slate-300/50'
            }`}>
              {inPlan ? 'В плані' : 'Немає в плані'}
            </span>
          );
          return (
            <div key={b.brandName} className="glass-card-soft p-3">
              {/* MOBILE: brand + статус + total зверху, місяці inline-list ТІЛЬКИ якщо є покупка. */}
              <div className="md:hidden">
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${inPlan ? 'bg-emet-blue' : 'bg-slate-400'}`} />
                  <span className="font-semibold text-[13px] truncate min-w-0">{cleanBrandName(b.brandName)}</span>
                  {!inPlan && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-400/10 text-slate-500 border border-slate-300/50">
                      не в плані
                    </span>
                  )}
                  <span className="ml-auto font-mono font-bold tabular-nums text-[13px] shrink-0 amount">${total.toLocaleString('en-US')}</span>
                </div>
                {(() => {
                  const purchases = monthOrder
                    .map(m => ({ month: m, amount: byMonth[m] ?? 0 }))
                    .filter(p => p.amount > 0);
                  if (purchases.length === 0) {
                    return (
                      <div className="pl-4 text-[11px] text-muted-foreground/60">
                        За 6 місяців покупок не зафіксовано.
                      </div>
                    );
                  }
                  // 3 колонки — місяці вирівнюються один під одним.
                  return (
                    <div className="pl-4 grid grid-cols-3 gap-x-3 gap-y-1.5">
                      {purchases.map(p => (
                        <div key={p.month} className="flex flex-col leading-none">
                          <span className="text-[9px] uppercase text-muted-foreground font-semibold">{fmtYMShort(p.month)}</span>
                          <span className="font-mono font-bold tabular-nums text-[12px] mt-1 amount">${Math.round(p.amount).toLocaleString('en-US')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* DESKTOP */}
              <div
                className="hidden md:grid items-center gap-3"
                style={{ gridTemplateColumns: `minmax(160px,1.4fr) repeat(${monthOrder.length}, minmax(70px,1fr)) 90px 120px` }}
              >
                <div className="font-semibold text-[13px] truncate flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${inPlan ? 'bg-emet-blue' : 'bg-slate-400'}`} />
                  {cleanBrandName(b.brandName)}
                </div>
                {monthOrder.map(m => {
                  const amount = byMonth[m] ?? 0;
                  return (
                    <div key={m} className="text-right">
                      <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">{fmtYMShort(m)}</p>
                      <p className={`font-mono font-bold tabular-nums text-[12px] mt-1 leading-none amount ${amount > 0 ? '' : 'text-muted-foreground/40'}`}>
                        {amount > 0 ? `$${Math.round(amount).toLocaleString('en-US')}` : '—'}
                      </p>
                    </div>
                  );
                })}
                <div className="text-right border-l border-white/50 pl-3">
                  <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">Всього</p>
                  <p className="font-mono font-bold tabular-nums text-[14px] mt-1 leading-none amount">
                    ${total.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="flex justify-end">{planPill}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
