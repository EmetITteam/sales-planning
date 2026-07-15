'use client';

/**
 * Розклад клієнтів по 1С-категорії (УНІКАЛЬНІ) — заплановано / база / купили
 * + похідні %. На відміну від CategoryStatsTable (сума plannedCount по всіх
 * брендах, «не унікальні») тут кожен клієнт рахується раз по своїй 1С-категорії.
 *
 * Джерело: /api/onec/region-stats → clientCategory (ростер Action 2 ∩ план ∩ факт).
 * Регіон-рівень + дрилдаун по менеджерах (згортається).
 */

import { useState } from 'react';
import { Users, RefreshCw, UserPlus, UserMinus, CircleSlash, ChevronDown } from 'lucide-react';
import { pctOf, formatPct } from '@/lib/format';
import type { ClientCategoryBreakdown, ClientCatCounts, RegionStatsCategory } from '@/lib/use-region-stats';

const CATS: { key: RegionStatsCategory; label: string; icon: typeof Users; color: string }[] = [
  { key: 'active', label: 'Активні', icon: Users, color: 'text-emet-blue' },
  { key: 'sleeping', label: 'Сплячі', icon: RefreshCw, color: 'text-amber-500' },
  { key: 'lost', label: 'Втрачені', icon: UserMinus, color: 'text-slate-400' },
  { key: 'new', label: 'Нові', icon: UserPlus, color: 'text-emerald-500' },
  { key: 'none', label: 'Без закупок', icon: CircleSlash, color: 'text-slate-400' },
];

const GRID = 'grid grid-cols-[1.3fr_repeat(6,minmax(52px,1fr))] gap-2 items-center';

function sumCounts(bc: Record<RegionStatsCategory, ClientCatCounts>): ClientCatCounts {
  return CATS.reduce((a, c) => ({
    base: a.base + bc[c.key].base,
    planned: a.planned + bc[c.key].planned,
    bought: a.bought + bc[c.key].bought,
  }), { base: 0, planned: 0, bought: 0 });
}

function CatRow({ label, icon: Icon, color, c, bold }: {
  label: string; icon?: typeof Users; color?: string; c: ClientCatCounts; bold?: boolean;
}) {
  return (
    <div className={`${GRID} px-4 py-2 text-[12.5px] border-b border-[#f0f2f8] last:border-b-0 ${bold ? 'bg-[#f7f9fc] font-bold' : ''}`}>
      <span className="flex items-center gap-1.5 min-w-0">
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />}
        <span className={`truncate ${bold ? 'font-bold' : 'font-medium'}`}>{label}</span>
      </span>
      <span className="text-right tabular-nums font-semibold text-emet-blue">{c.planned}</span>
      <span className="text-right tabular-nums text-muted-foreground">{c.base}</span>
      <span className="text-right tabular-nums">{formatPct(pctOf(c.planned, c.base))}</span>
      <span className="text-right tabular-nums font-semibold text-emerald-600">{c.bought}</span>
      <span className="text-right tabular-nums">{formatPct(pctOf(c.bought, c.planned))}</span>
      <span className="text-right tabular-nums text-muted-foreground">{formatPct(pctOf(c.bought, c.base))}</span>
    </div>
  );
}

export function ClientCategoryUniqueTable({ data, managerNames, title, loading }: {
  data: ClientCategoryBreakdown | null;
  managerNames: Record<string, string>;
  title?: string;
  loading?: boolean;
}) {
  const [showManagers, setShowManagers] = useState(false);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
        <h3 className="text-[14px] font-bold">Розклад по категоріях клієнтів</h3>
        {title && <span className="text-[11px] text-muted-foreground">{title}</span>}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Шапка колонок */}
          <div className={`${GRID} px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#f0f2f8]`}>
            <span>Категорія</span>
            <span className="text-right" title="Клієнтів категорії із планом хоча б в одному бренді (унікальні)">Заплан.</span>
            <span className="text-right" title="Усього клієнтів категорії у базі (унікальні)">База</span>
            <span className="text-right" title="Заплановано / база">% запл.</span>
            <span className="text-right" title="Купили цього місяця (унікальні)">Купили</span>
            <span className="text-right" title="Купили / заплановано">% з запл.</span>
            <span className="text-right" title="Купили / база">% з бази</span>
          </div>

          {loading && !data ? (
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`${GRID} px-4 py-2 border-b border-[#f0f2f8]`}>
                <div className="h-3.5 w-24 bg-[#f0f2f8] rounded animate-pulse" />
                {[...Array(6)].map((_, j) => <div key={j} className="h-3.5 w-8 bg-[#f0f2f8] rounded animate-pulse ml-auto" />)}
              </div>
            ))
          ) : data ? (
            <>
              {CATS.map(cat => (
                <CatRow key={cat.key} label={cat.label} icon={cat.icon} color={cat.color} c={data.region[cat.key]} />
              ))}
              <CatRow label="Разом" c={sumCounts(data.region)} bold />
            </>
          ) : (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Немає даних</div>
          )}
        </div>
      </div>

      {/* Дрилдаун по менеджерах */}
      {data && data.byManager.length > 0 && (
        <div className="border-t border-[#e2e7ef]">
          <button
            onClick={() => setShowManagers(v => !v)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-[12px] font-semibold text-muted-foreground hover:bg-[#f7f9fc] transition-colors"
          >
            <span>По менеджерах ({data.byManager.length})</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showManagers ? 'rotate-180' : ''}`} />
          </button>
          {showManagers && (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                {data.byManager.map(m => {
                  const total = sumCounts(m.byCategory);
                  return (
                    <div key={m.login} className="border-t border-[#f0f2f8]">
                      <div className="px-4 pt-2 pb-1 text-[12px] font-bold text-foreground/80">{managerNames[m.login] || m.login}</div>
                      {CATS.filter(cat => m.byCategory[cat.key].base > 0).map(cat => (
                        <CatRow key={cat.key} label={cat.label} icon={cat.icon} color={cat.color} c={m.byCategory[cat.key]} />
                      ))}
                      <CatRow label="Разом" c={total} bold />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
