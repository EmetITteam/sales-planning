'use client';

/**
 * Розклад клієнтів по 1С-категорії (УНІКАЛЬНІ) — заплановано / база / купили
 * + похідні %. На відміну від CategoryStatsTable (сума plannedCount по всіх
 * брендах, «не унікальні») тут кожен клієнт рахується раз по своїй 1С-категорії.
 *
 * Візуально уніфіковано з CategoryStatsTable (glass-card ambient, плитки-іконки,
 * desktop-grid + mobile 2×N). Джерело: /api/onec/region-stats → clientCategory.
 * Регіон-рівень + дрилдаун по менеджерах (згортається).
 */

import { useState } from 'react';
import { Users, RefreshCw, UserPlus, UserMinus, CircleSlash, ChevronDown } from 'lucide-react';
import { pctOf } from '@/lib/format';
import type { ClientCategoryBreakdown, ClientCatCounts, RegionStatsCategory } from '@/lib/use-region-stats';

const CATS: { key: RegionStatsCategory; label: string; icon: typeof Users; iconClass: string; bgClass: string }[] = [
  { key: 'active', label: 'Активні', icon: Users, iconClass: 'text-emet-blue', bgClass: 'bg-emet-50' },
  { key: 'sleeping', label: 'Сплячі', icon: RefreshCw, iconClass: 'text-amber-600', bgClass: 'bg-amber-50' },
  { key: 'lost', label: 'Втрачені', icon: UserMinus, iconClass: 'text-slate-500', bgClass: 'bg-slate-100' },
  { key: 'new', label: 'Нові', icon: UserPlus, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50' },
  { key: 'none', label: 'Без закупок', icon: CircleSlash, iconClass: 'text-slate-500', bgClass: 'bg-slate-100' },
];

const GRID = 'md:grid-cols-[32px_minmax(120px,1.1fr)_repeat(6,minmax(46px,1fr))]';

const fp = (n: number) => `${n.toFixed(1)}%`;
const pctColor = (p: number) => p >= 100 ? 'text-emerald-600' : p >= 50 ? 'text-amber-600' : 'text-rose-600';

function sumCounts(bc: Record<RegionStatsCategory, ClientCatCounts>): ClientCatCounts {
  return CATS.reduce((a, c) => ({
    base: a.base + bc[c.key].base,
    planned: a.planned + bc[c.key].planned,
    bought: a.bought + bc[c.key].bought,
  }), { base: 0, planned: 0, bought: 0 });
}

/** Один рядок категорії — desktop grid + mobile 2×3. */
function CatRow({ meta, c, total }: {
  meta?: typeof CATS[number]; c: ClientCatCounts; total?: boolean;
}) {
  const Icon = meta?.icon;
  const pPlanBase = pctOf(c.planned, c.base);
  const pBoughtPlan = pctOf(c.bought, c.planned);
  const pBoughtBase = pctOf(c.bought, c.base);
  return (
    <div className={`border-t border-[#f0f2f8] px-4 md:px-5 py-3 ${total ? 'bg-[#f7f9fc]' : ''}`}>
      {/* Desktop */}
      <div className={`hidden md:grid ${GRID} gap-3 items-center`}>
        {Icon && meta ? (
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${meta.bgClass}`}>
            <Icon className={`h-4 w-4 ${meta.iconClass}`} />
          </div>
        ) : <div />}
        <p className={`text-[13px] ${total ? 'font-bold' : 'font-medium'}`}>{meta?.label ?? 'Разом'}</p>
        <p className="text-right text-[14px] font-bold tabular-nums text-emet-blue">{c.planned}</p>
        <p className="text-right text-[14px] font-bold tabular-nums text-muted-foreground">{c.base}</p>
        <p className="text-right text-[13px] font-bold tabular-nums text-muted-foreground">{fp(pPlanBase)}</p>
        <p className="text-right text-[14px] font-bold tabular-nums text-emerald-700">{c.bought}</p>
        <p className={`text-right text-[14px] font-bold tabular-nums ${pctColor(pBoughtPlan)}`}>{fp(pBoughtPlan)}</p>
        <p className="text-right text-[13px] font-bold tabular-nums text-emet-blue">{fp(pBoughtBase)}</p>
      </div>
      {/* Mobile */}
      <div className="md:hidden flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          {Icon && meta ? (
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${meta.bgClass}`}>
              <Icon className={`h-4 w-4 ${meta.iconClass}`} />
            </div>
          ) : <div className="w-8" />}
          <p className={`text-[13px] leading-tight ${total ? 'font-bold' : 'font-semibold'}`}>{meta?.label ?? 'Разом'}</p>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2 pl-[42px]">
          <Stat label="Заплан." value={String(c.planned)} valueClass="text-emet-blue" />
          <Stat label="База" value={String(c.base)} valueClass="text-muted-foreground" />
          <Stat label="% запл." value={fp(pPlanBase)} valueClass="text-muted-foreground" />
          <Stat label="Купили" value={String(c.bought)} valueClass="text-emerald-700" />
          <Stat label="% з запл." value={fp(pBoughtPlan)} valueClass={pctColor(pBoughtPlan)} />
          <Stat label="% з бази" value={fp(pBoughtBase)} valueClass="text-emet-blue" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</span>
      <span className={`text-[12px] font-bold tabular-nums truncate ${valueClass ?? ''}`}>{value}</span>
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
    <div className="glass-card ambient-accent overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
        <h3 className="text-[14px] font-bold">Розклад по категоріях клієнтів (1С)</h3>
        {title && <span className="text-[11px] text-muted-foreground">{title}</span>}
      </div>

      {/* Заголовки колонок (desktop) */}
      <div className={`hidden md:grid ${GRID} gap-3 px-5 py-2 border-b border-[#f0f2f8] text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`}>
        <div />
        <div>Категорія</div>
        <div className="text-right" title="Клієнтів категорії з планом хоча б в одному бренді (унікальні)">Заплан.</div>
        <div className="text-right" title="Усього клієнтів категорії у базі (унікальні)">База</div>
        <div className="text-right" title="Заплановано / база">% запл.</div>
        <div className="text-right" title="Купили цього місяця (унікальні)">Купили</div>
        <div className="text-right" title="Купили / заплановано">% з запл.</div>
        <div className="text-right" title="Купили / база">% з бази</div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <svg className="h-5 w-5 animate-spin text-emet-blue" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[12px] font-medium">Збираємо категорії клієнтів…</p>
        </div>
      ) : data ? (
        <>
          {CATS.map(cat => <CatRow key={cat.key} meta={cat} c={data.region[cat.key]} />)}
          <CatRow c={sumCounts(data.region)} total />

          {/* Дрилдаун по менеджерах */}
          {data.byManager.length > 0 && (
            <div className="border-t border-[#e2e7ef]">
              <button
                onClick={() => setShowManagers(v => !v)}
                className="w-full px-5 py-2.5 flex items-center justify-between text-[12px] font-semibold text-muted-foreground hover:bg-[#f7f9fc] transition-colors cursor-pointer"
              >
                <span>По менеджерах ({data.byManager.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showManagers ? 'rotate-180' : ''}`} />
              </button>
              {showManagers && data.byManager.map(m => (
                <div key={m.login} className="border-t border-[#eef1f7] bg-[#fcfdff]">
                  <div className="px-5 pt-2.5 pb-1 text-[12px] font-bold text-foreground/80">{managerNames[m.login] || m.login}</div>
                  {CATS.filter(cat => m.byCategory[cat.key].base > 0).map(cat => (
                    <CatRow key={cat.key} meta={cat} c={m.byCategory[cat.key]} />
                  ))}
                  <CatRow c={sumCounts(m.byCategory)} total />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Немає даних</div>
      )}
    </div>
  );
}
