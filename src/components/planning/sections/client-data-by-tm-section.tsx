import type React from 'react';
import { AlertCircle, Users, UserPlus, RefreshCw } from 'lucide-react';
import { formatUSD, pctOf } from '@/lib/format';
import type { ClientCategorySummary } from '@/lib/types';

const CAT_ICONS: Record<string, React.ReactNode> = {
  active: <Users className="h-4 w-4 text-emet-blue" />,
  new: <UserPlus className="h-4 w-4 text-emerald-600" />,
  sleeping_lost: <RefreshCw className="h-4 w-4 text-amber-600" />,
};

type UnplannedRow = { factAmount: number };

/**
 * Секція «Дані по клієнтах по ТМ» — підсумкова таблиця по 3 категоріям
 * (Активні / Нові / Активація) + блок «Незаплановані» + footer «Всього».
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function ClientDataByTmSection({
  categories,
  totalCatClients,
  totalCatAmount,
  totalCatFact,
  totalCatPct,
  unplannedAll,
  unplannedByCategory,
  planAmount,
  clientsLoading,
  clientsError,
  hasSegmentClients,
}: {
  categories: ClientCategorySummary[];
  totalCatClients: number;
  totalCatAmount: number;
  totalCatFact: number;
  totalCatPct: number;
  unplannedAll: UnplannedRow[];
  unplannedByCategory: {
    active: UnplannedRow[];
    sleeping: UnplannedRow[];
    lost: UnplannedRow[];
    new: UnplannedRow[];
    none: UnplannedRow[];
  };
  planAmount: number;
  clientsLoading: boolean;
  clientsError: string | null;
  /** true якщо segmentClients.length > 0 — щоб показати loader замість таблиці. */
  hasSegmentClients: boolean;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
        <h3 className="text-[14px] font-bold">Дані по клієнтах по ТМ</h3>
        {clientsLoading && (
          <span className="flex items-center gap-1.5 text-[11px] text-emet-blue font-medium">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Завантажуємо клієнтів…
          </span>
        )}
        {clientsError && <span className="text-[11px] text-rose-600" title={clientsError}>1С недоступний — показуємо порожньо</span>}
      </div>
      {clientsLoading && !hasSegmentClients ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <p className="text-[12px]">Збираємо активних, сплячих, нових клієнтів…</p>
        </div>
      ) : (
      <div className="divide-y divide-[#f0f2f8]">
        {categories.map(cat => (
          <div key={cat.category} className="px-4 md:px-5 py-3">
            {/* Desktop — grid */}
            <div className="hidden md:grid md:grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb] shrink-0">{CAT_ICONS[cat.category]}</div>
              <p className="text-[13px] font-medium">{cat.label}</p>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Заплан.</p><p className="text-[14px] font-bold">{cat.clientCount}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Очікувана сума</p><p className="text-[14px] font-bold font-mono amount">{formatUSD(cat.expectedAmount)}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Факт</p><p className="text-[14px] font-bold font-mono amount text-emerald-700">{formatUSD(cat.factAmount)}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">% план</p><p className="text-[14px] font-bold text-emet-blue">{cat.planCoveragePercent.toFixed(1)}%</p></div>
            </div>
            {/* Mobile — header + 2×2 grid */}
            <div className="md:hidden flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb] shrink-0">{CAT_ICONS[cat.category]}</div>
                <p className="text-[13px] font-semibold leading-tight">{cat.label}</p>
              </div>
              <div className="grid grid-cols-4 gap-x-2 pl-[42px]">
                <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Заплан.</p><p className="text-[13px] font-bold tabular-nums">{cat.clientCount}</p></div>
                <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Очікув.</p><p className="text-[12px] font-bold font-mono amount tabular-nums">{formatUSD(cat.expectedAmount)}</p></div>
                <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Факт</p><p className="text-[12px] font-bold font-mono amount tabular-nums text-emerald-700">{formatUSD(cat.factAmount)}</p></div>
                <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">% план</p><p className="text-[13px] font-bold tabular-nums text-emet-blue">{cat.planCoveragePercent.toFixed(1)}%</p></div>
              </div>
            </div>
          </div>
        ))}
        {/* Незаплановані — покупці без плану. Розбиваємо по категоріях, сума=факт. */}
        {unplannedAll.length > 0 && (() => {
          const unplannedTotal = unplannedAll.reduce((s, b) => s + b.factAmount, 0);
          const unplannedPct = pctOf(unplannedTotal, planAmount);
          const subRows: Array<[string, UnplannedRow[]]> = [
            ['Активний', unplannedByCategory.active],
            ['Сплячий', unplannedByCategory.sleeping],
            ['Втрачений', unplannedByCategory.lost],
            ['Новий', unplannedByCategory.new],
            ['Без закупок', unplannedByCategory.none],
          ];
          return (
            <>
              <div className="px-4 md:px-5 py-3 bg-fuchsia-50/40">
                {/* Desktop */}
                <div className="hidden md:grid md:grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-fuchsia-100">
                    <AlertCircle className="h-4 w-4 text-fuchsia-600" />
                  </div>
                  <p className="text-[13px] font-semibold">Незаплановані <span className="text-[10px] text-muted-foreground font-normal">(купили без плану)</span></p>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">Купили</p><p className="text-[14px] font-bold">{unplannedAll.length}</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">—</p><p className="text-[14px] font-bold text-muted-foreground/40">—</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">Факт</p><p className="text-[14px] font-bold font-mono amount text-fuchsia-700">{formatUSD(unplannedTotal)}</p></div>
                  <div className="text-right"><p className="text-[10px] text-muted-foreground">% план</p><p className="text-[14px] font-bold text-fuchsia-700">{unplannedPct.toFixed(1)}%</p></div>
                </div>
                {/* Mobile */}
                <div className="md:hidden flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-fuchsia-100 shrink-0">
                      <AlertCircle className="h-4 w-4 text-fuchsia-600" />
                    </div>
                    <p className="text-[13px] font-semibold leading-tight">Незаплановані <span className="text-[10px] text-muted-foreground font-normal">(без плану)</span></p>
                  </div>
                  <div className="grid grid-cols-3 gap-x-2 pl-[42px]">
                    <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Купили</p><p className="text-[13px] font-bold tabular-nums">{unplannedAll.length}</p></div>
                    <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Факт</p><p className="text-[12px] font-bold font-mono amount tabular-nums text-fuchsia-700">{formatUSD(unplannedTotal)}</p></div>
                    <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">% план</p><p className="text-[13px] font-bold tabular-nums text-fuchsia-700">{unplannedPct.toFixed(1)}%</p></div>
                  </div>
                </div>
              </div>
              {subRows.filter(([, items]) => items.length > 0).map(([label, items]) => {
                const sum = items.reduce((s, b) => s + b.factAmount, 0);
                return (
                  <div key={`unp-${label}`}
                       className="flex items-center justify-between gap-3 px-5 md:px-5 py-2 md:pl-12 pl-12 bg-fuchsia-50/20">
                    <p className="text-[12px] text-muted-foreground flex-1 min-w-0 truncate">↳ {label} <span className="text-muted-foreground/70">· {items.length}</span></p>
                    <p className="text-[12px] font-mono amount text-muted-foreground shrink-0">{formatUSD(sum)}</p>
                  </div>
                );
              })}
            </>
          );
        })()}

        <div className="px-4 md:px-5 py-3 bg-[#f4f7fb]">
          {/* Desktop */}
          <div className="hidden md:grid md:grid-cols-[32px_1fr_70px_100px_90px_60px] gap-3 items-center">
            <div />
            <p className="text-[13px] font-bold">Всього</p>
            <p className="text-[14px] font-bold text-right">{totalCatClients}</p>
            <p className="text-[14px] font-bold font-mono text-right amount">{formatUSD(totalCatAmount)}</p>
            <p className="text-[14px] font-bold font-mono text-right amount text-emerald-700">{formatUSD(totalCatFact)}</p>
            <p className="text-[14px] font-bold text-emet-blue text-right">{totalCatPct.toFixed(1)}%</p>
          </div>
          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-2">
            <p className="text-[13px] font-bold">Всього</p>
            <div className="grid grid-cols-4 gap-x-2 pl-2">
              <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Клієнтів</p><p className="text-[13px] font-bold tabular-nums">{totalCatClients}</p></div>
              <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Очікув.</p><p className="text-[12px] font-bold font-mono amount tabular-nums">{formatUSD(totalCatAmount)}</p></div>
              <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Факт</p><p className="text-[12px] font-bold font-mono amount tabular-nums text-emerald-700">{formatUSD(totalCatFact)}</p></div>
              <div><p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">% план</p><p className="text-[13px] font-bold tabular-nums text-emet-blue">{totalCatPct.toFixed(1)}%</p></div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
