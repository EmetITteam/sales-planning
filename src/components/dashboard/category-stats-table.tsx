'use client';

import { Users, UserPlus, RefreshCw, AlertCircle } from 'lucide-react';
import { formatUSD } from '@/lib/format';
import type { CategoryStat, PlanCategoryKey } from '@/lib/use-planning-aggregate';
import type { RegionStatsCategoryStat } from '@/lib/use-region-stats';

interface RowStat {
  plannedCount: number;
  plannedSum: number;
  factCount: number;
  factSum: number;
}

interface Props {
  /** Plan-частина (з нашої БД через /api/planning/aggregate). */
  plan: Record<PlanCategoryKey, CategoryStat> | null;
  /** Fact-частина (з 1С через /api/onec/region-stats). */
  fact: Record<PlanCategoryKey, RegionStatsCategoryStat> | null;
  /** Заголовок-контекст: «Регіон Дніпро» або «Petaran · 8 регіонів». */
  title?: string;
  loading?: boolean;
}

/**
 * Розклад планування + факт по 4 категоріях клієнтів + блок «Незаплановані».
 *
 * Використовується:
 *  - На РМ-дашборді під hero-картками регіону (агрегат по всіх менеджерах)
 *  - У Director у `BrandRegionGroup` expand перед списком регіонів
 *
 * Структура (4 бейджа + рядок «Незаплановані»):
 *  ┌────────────────────────────────────────────┐
 *  │ 👥 Активні       │ Заплановано: 48 / $12k │
 *  │                  │ Факт:         35 / $9.8k│
 *  │                  │ Виконання:    79%       │
 *  ├────────────────────────────────────────────┤
 *  │ 👤+ Нові         │ ...                    │
 *  │ 🔄 Активізація   │ ...                    │
 *  │ ⚠ Незаплановані │ ...                    │
 *  └────────────────────────────────────────────┘
 *
 * 'Активізація' = sleeping + lost + none (БЗ).
 * 'Незаплановані' = ті хто купили (factCount/factSum) але НЕ були ані у Прогнозі
 *  ані у Закритті розриву. На рівні регіону = факт активних/сплячих/etc., де
 *  plannedCount = 0 але factCount > 0 — обчислюється у CategoryStatsTable
 *  на рівні даних (передається окремо).
 */

const CAT_META: Array<{
  key: PlanCategoryKey | 'activation' | 'unplanned';
  label: string;
  icon: typeof Users;
  iconClass: string;
  bgClass: string;
}> = [
  { key: 'active',     label: 'Активні клієнти',          icon: Users,       iconClass: 'text-[#066aab]', bgClass: 'bg-[#e8f4fc]' },
  { key: 'new',        label: 'Нові клієнти по ТМ',       icon: UserPlus,    iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50' },
  { key: 'activation', label: 'Активізація (Сплячі/Втрачені/БЗ)', icon: RefreshCw, iconClass: 'text-amber-600',  bgClass: 'bg-amber-50' },
  { key: 'unplanned',  label: 'Незаплановані', icon: AlertCircle, iconClass: 'text-fuchsia-600', bgClass: 'bg-fuchsia-50' },
];

export function CategoryStatsTable({ plan, fact, title, loading }: Props) {
  // Агрегуємо у 4 групи що показуються:
  // active = active
  // new = new
  // activation = sleeping + lost + none
  // unplanned = факт там де plan = 0 (по 4 групах разом)
  const rows: Record<'active' | 'new' | 'activation' | 'unplanned', RowStat> = {
    active:     { plannedCount: 0, plannedSum: 0, factCount: 0, factSum: 0 },
    new:        { plannedCount: 0, plannedSum: 0, factCount: 0, factSum: 0 },
    activation: { plannedCount: 0, plannedSum: 0, factCount: 0, factSum: 0 },
    unplanned:  { plannedCount: 0, plannedSum: 0, factCount: 0, factSum: 0 },
  };
  if (plan) {
    rows.active.plannedCount += plan.active.plannedCount;
    rows.active.plannedSum   += plan.active.plannedSum;
    rows.new.plannedCount    += plan.new.plannedCount;
    rows.new.plannedSum      += plan.new.plannedSum;
    rows.activation.plannedCount += plan.sleeping.plannedCount + plan.lost.plannedCount + plan.none.plannedCount;
    rows.activation.plannedSum   += plan.sleeping.plannedSum   + plan.lost.plannedSum   + plan.none.plannedSum;
  }
  if (fact) {
    rows.active.factCount += fact.active.factCount;
    rows.active.factSum   += fact.active.factSum;
    rows.new.factCount    += fact.new.factCount;
    rows.new.factSum      += fact.new.factSum;
    rows.activation.factCount += fact.sleeping.factCount + fact.lost.factCount + fact.none.factCount;
    rows.activation.factSum   += fact.sleeping.factSum   + fact.lost.factSum   + fact.none.factSum;
  }
  // Unplanned: факт − planned. Якщо negative — 0 (плановано більше ніж купили).
  // На рівні categories: треба факт там де НЕ запланованого. Грубо беремо
  // загальний факт − плановий факт. Тут просто покажемо різницю по сумах
  // (точне: «купили без плану»). Це апроксимація — точніше треба у backend.
  const totalFactCount = rows.active.factCount + rows.new.factCount + rows.activation.factCount;
  const totalFactSum   = rows.active.factSum   + rows.new.factSum   + rows.activation.factSum;
  const totalPlannedCount = rows.active.plannedCount + rows.new.plannedCount + rows.activation.plannedCount;
  const totalPlannedSum   = rows.active.plannedSum   + rows.new.plannedSum   + rows.activation.plannedSum;
  rows.unplanned.factCount = Math.max(0, totalFactCount - totalPlannedCount);
  rows.unplanned.factSum   = Math.max(0, totalFactSum   - totalPlannedSum);

  // % факт = виконання плану цієї категорії = factSum / plannedSum × 100
  const pctFact = (r: RowStat) => r.plannedSum > 0 ? Math.round((r.factSum / r.plannedSum) * 1000) / 10 : 0;
  // % план = частка категорії від ЗАГАЛЬНОГО планування (структура плану по категоріях)
  const totalPlanForShare = totalPlannedSum;
  const pctPlan = (r: RowStat) => totalPlanForShare > 0 ? Math.round((r.plannedSum / totalPlanForShare) * 1000) / 10 : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        {title && <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
          <h3 className="text-[14px] font-bold">Розклад по категоріях клієнтів</h3>
          <span className="text-[11px] text-muted-foreground">{title}</span>
        </div>}
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <svg className="h-5 w-5 animate-spin text-[#066aab]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[12px] font-medium">Збираємо категорії клієнтів…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {title && (
        <div className="px-5 py-3 border-b border-[#e2e7ef] flex items-center justify-between">
          <h3 className="text-[14px] font-bold">Розклад по категоріях клієнтів</h3>
          <span className="text-[11px] text-muted-foreground">{title}</span>
        </div>
      )}
      <div className="hidden md:grid md:grid-cols-[32px_minmax(160px,1.4fr)_repeat(3,1fr)_60px_60px] gap-3 px-5 py-2 border-b border-[#f0f2f8] text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div />
        <div>Категорія</div>
        <div className="text-right">Заплановано</div>
        <div className="text-right">Сума план</div>
        <div className="text-right">Факт</div>
        <div className="text-right" title="Частка категорії від загальної планової суми">% план</div>
        <div className="text-right" title="Виконання плану цієї категорії = факт / план">% факт</div>
      </div>
      {CAT_META.map(cat => {
        const Icon = cat.icon;
        const r = rows[cat.key as keyof typeof rows];
        const pPlan = pctPlan(r);
        const pFact = pctFact(r);
        return (
          <div key={cat.key}
            className="flex md:grid md:grid-cols-[32px_minmax(160px,1.4fr)_repeat(3,1fr)_60px_60px] flex-wrap gap-x-3 gap-y-1 items-center px-4 md:px-5 py-3 border-t border-[#f0f2f8]">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${cat.bgClass}`}>
              <Icon className={`h-4 w-4 ${cat.iconClass}`} />
            </div>
            <p className="text-[13px] font-medium flex-1 min-w-0">{cat.label}</p>
            <div className="text-right basis-[60px] md:basis-auto">
              <p className="text-[10px] text-muted-foreground md:hidden">Заплан.</p>
              <p className="text-[14px] font-bold tabular-nums">{r.plannedCount}</p>
            </div>
            <div className="text-right basis-[90px] md:basis-auto">
              <p className="text-[10px] text-muted-foreground md:hidden">Сума план</p>
              <p className="text-[14px] font-bold font-mono amount">{formatUSD(r.plannedSum)}</p>
            </div>
            <div className="text-right basis-[90px] md:basis-auto">
              <p className="text-[10px] text-muted-foreground md:hidden">Факт</p>
              <p className="text-[12px] font-bold font-mono amount text-emerald-700">{formatUSD(r.factSum)}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{r.factCount} кл.</p>
            </div>
            <div className="text-right basis-[60px] md:basis-auto">
              <p className="text-[10px] text-muted-foreground md:hidden">% план</p>
              <p className="text-[13px] font-bold text-muted-foreground tabular-nums">{pPlan.toFixed(1)}%</p>
            </div>
            <div className="text-right basis-[60px] md:basis-auto">
              <p className="text-[10px] text-muted-foreground md:hidden">% факт</p>
              <p className={`text-[14px] font-bold tabular-nums ${pFact >= 100 ? 'text-emerald-600' : pFact >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {pFact.toFixed(1)}%
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
