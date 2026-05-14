'use client';

/**
 * <PlanningReadinessCard> — overview готовності планування на дашборді Director.
 *
 * Облік ведеться ЗА МЕНЕДЖЕРАМИ (а не за окремими «brand documents»).
 * Адмін хоче бачити: «скільки людей завершили планування, скільки в процесі,
 * скільки ще не торкнулись» — а не «скільки документів».
 *
 * Кожен менеджер має один з трьох станів:
 *   🟢 finalized — ВСІ 9 брендів finalized (повністю закрив план)
 *   🟡 partial   — хоча б один бренд (finalized або draft), але не всі finalized
 *   ⚪ empty     — жодного бренду не торкнувся
 *
 * Регіон-стейтус:
 *   GREEN — усі менеджери регіону finalized
 *   AMBER — є partial (у роботі)
 *   ROSE  — усі менеджери empty
 *
 * Drilldown показує per-manager розклад: які бренди фіналізовано, які чернетка,
 * які пусто — щоб admin міг точково підштовхнути менеджера.
 *
 * Вимикається через FEATURES.PLANNING_READINESS у feature-flags.ts.
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import type { RegionData } from '@/lib/types';
import { SEGMENTS } from '@/lib/mock-data';
import { classifyManagerStatus } from '@/lib/passive-rows';

interface PlanByLogin {
  [login: string]: { [segment: string]: { forecast: number; gap: number; finalized: boolean } };
}

interface Props {
  /** Сирий список регіонів з 1С Action 5 — для імен менеджерів. */
  regions: RegionData[];
  /** byLogin breakdown з /api/planning/aggregate. */
  planByLogin?: PlanByLogin | null;
  /** Загальна кількість брендів у плануванні (default = 9 з SEGMENTS). */
  totalBrands?: number;
}

const ALL_BRAND_CODES = SEGMENTS.map(s => s.code);

type ManagerStatus = 'finalized' | 'partial' | 'empty';

interface ManagerStat {
  login: string;
  name: string;
  status: ManagerStatus;
  finalized: string[]; // brand codes finalized
  draft: string[];     // brand codes with rows but not finalized
  empty: string[];     // brand codes without rows
}

interface RegionStat {
  regionName: string;
  managers: ManagerStat[];
  /** Скільки менеджерів повністю fіналізували план (всі брендів). */
  managersFinalized: number;
  /** Скільки менеджерів частково (хоч щось почали але не всі finalized). */
  managersPartial: number;
  /** Скільки взагалі не торкнулись. */
  managersEmpty: number;
  totalManagers: number;
}

function regionStatusColor(
  fin: number,
  partial: number,
  total: number,
): 'green' | 'amber' | 'rose' {
  if (total === 0) return 'rose';
  if (fin === total) return 'green';
  if (fin + partial > 0) return 'amber';
  return 'rose';
}

const dotClass: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};
const textClass: Record<string, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
};
const badgeBgClass: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
};

const brandName = (code: string) => SEGMENTS.find(s => s.code === code)?.name ?? code;

export function PlanningReadinessCard({ regions, planByLogin, totalBrands = 9 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const stats = useMemo<RegionStat[]>(() => {
    if (!planByLogin) return [];
    return regions
      .map(r => {
        // Виключаємо менеджерів які НЕ планують у цьому регіоні цього місяця:
        // 1С Action 5 повертає історичних «хвостів» (менеджер мав факт минулого
        // місяця у іншому регіоні де він уже не працює). totalPlan=0 + factи=0 у
        // поточному місяці → ця людина не має бути у readiness цього регіону.
        // Приклад: Пашковська (rm.odessa) показується у Миколаєві з planом=0,
        // а реально планує тільки в Одесі ($65K плану).
        const managers: ManagerStat[] = r.managers
          .filter(m => {
            const totalPlan = m.segments.reduce((a, s) => a + s.planAmount, 0);
            const totalFact = m.segments.reduce((a, s) => a + s.factAmount, 0);
            return totalPlan > 0 || totalFact > 0;
          })
          .map(m => {
          const segMap = planByLogin[m.login] || {};
          const finalized: string[] = [];
          const draft: string[] = [];
          const empty: string[] = [];
          // Бренд має byLogin entry ТІЛЬКИ якщо у ньому є хоч один рядок
          // з amount > 0 (passive rows відфільтровані у aggregate route).
          // Тому бренд з усіма passive рядками автоматично → empty.
          for (const code of ALL_BRAND_CODES) {
            const row = segMap[code];
            if (!row) empty.push(code);
            else if (row.finalized) finalized.push(code);
            else draft.push(code);
          }
          const status: ManagerStatus = classifyManagerStatus(
            finalized.length + draft.length,
            finalized.length,
            totalBrands,
          );
          return { login: m.login, name: m.name, status, finalized, draft, empty };
        });
        return {
          regionName: r.regionName,
          managers,
          managersFinalized: managers.filter(m => m.status === 'finalized').length,
          managersPartial: managers.filter(m => m.status === 'partial').length,
          managersEmpty: managers.filter(m => m.status === 'empty').length,
          totalManagers: managers.length,
        };
      })
      .filter(r => r.totalManagers > 0)
      .sort((a, b) => {
        // Спочатку відстаючі (empty), потім часткові, потім завершені
        const aDone = a.managersFinalized === a.totalManagers ? 1 : 0;
        const bDone = b.managersFinalized === b.totalManagers ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const aProgress = a.totalManagers === 0 ? 0 : (a.managersFinalized + a.managersPartial) / a.totalManagers;
        const bProgress = b.totalManagers === 0 ? 0 : (b.managersFinalized + b.managersPartial) / b.totalManagers;
        return aProgress - bProgress;
      });
  }, [regions, planByLogin, totalBrands]);

  const total = useMemo(() => {
    let mgrFin = 0, mgrPartial = 0, mgrEmpty = 0, mgrAll = 0;
    for (const r of stats) {
      mgrFin += r.managersFinalized;
      mgrPartial += r.managersPartial;
      mgrEmpty += r.managersEmpty;
      mgrAll += r.totalManagers;
    }
    return { mgrFin, mgrPartial, mgrEmpty, mgrAll };
  }, [stats]);

  if (!planByLogin || total.mgrAll === 0) return null;

  // Усі fіналізували → компактний інлайн
  const allFinalized = total.mgrFin === total.mgrAll && total.mgrAll > 0;
  if (allFinalized) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold">Усі менеджери фіналізували план</p>
            <p className="text-[11px] text-muted-foreground">
              {total.mgrAll} менеджерів · усі {totalBrands} брендів закрито
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700">✓ ФІНАЛ</span>
        </div>
      </div>
    );
  }

  // Stacked bar % — за менеджерами
  const finPct = total.mgrAll === 0 ? 0 : Math.round((total.mgrFin / total.mgrAll) * 100);
  const partialPct = total.mgrAll === 0 ? 0 : Math.round((total.mgrPartial / total.mgrAll) * 100);
  const overallStatus = regionStatusColor(total.mgrFin, total.mgrPartial, total.mgrAll);
  const overallLabel = overallStatus === 'green' ? 'ГОТОВО' : overallStatus === 'amber' ? 'У РОБОТІ' : 'ВІДСТАВАННЯ';

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#fafbfe] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-5 w-5 text-[#066aab]" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold truncate">Готовність планування</p>
            <p className="text-[11px] text-muted-foreground">{total.mgrAll} менеджерів</p>
          </div>
        </div>

        {/* Mini-list регіонів — менеджерські лічильники */}
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 px-2">
          {stats.map(r => {
            const s = regionStatusColor(r.managersFinalized, r.managersPartial, r.totalManagers);
            const tooltip = `${r.regionName}: ${r.managersFinalized} повністю · ${r.managersPartial} частково · ${r.managersEmpty} не торкнулись`;
            return (
              <span key={r.regionName} className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap min-w-0" title={tooltip}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass[s]}`} />
                <span className="font-semibold text-foreground/80 truncate flex-1 min-w-0">{r.regionName}</span>
                <span className="font-mono shrink-0">
                  <span className="text-emerald-600 font-bold">{r.managersFinalized}</span>
                  {r.managersPartial > 0 && <span className="text-amber-600 font-bold">+{r.managersPartial}</span>}
                  <span className="text-muted-foreground/60">/{r.totalManagers}</span>
                </span>
              </span>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-start gap-4 justify-end shrink-0 min-h-[56px]">
          <div className="text-right min-w-[180px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Менеджерів</p>
            <p className="text-[14px] font-bold font-mono leading-none mt-1.5 whitespace-nowrap">
              <span className="text-emerald-600">{total.mgrFin}</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className="text-amber-600">{total.mgrPartial}</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className="text-muted-foreground/70">{total.mgrAll}</span>
            </p>
            <p className="text-[10px] text-muted-foreground leading-none mt-1">
              <span className="text-emerald-600 font-semibold">{total.mgrFin}</span> повністю ·{' '}
              <span className="text-amber-600 font-semibold">{total.mgrPartial}</span> частково ·{' '}
              <span className="font-semibold">{total.mgrEmpty}</span> не торкнулись
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 w-20">
            {/* Stacked bar: emerald (finalized managers) + amber (partial managers) */}
            <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${finPct}%` }} />
              <div className="absolute inset-y-0 bg-amber-500" style={{ left: `${finPct}%`, width: `${partialPct}%` }} />
            </div>
            <span className="text-[11px] font-bold leading-none text-emerald-600">{finPct}%</span>
          </div>
          <div className="w-[100px]">
            <div className="h-[12px] leading-none mb-1.5" />
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${badgeBgClass[overallStatus]}`}>{overallLabel}</span>
          </div>
          <div>
            <div className="h-[12px] leading-none mb-1.5" />
            <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Expanded — список регіонів */}
      {expanded && (
        <div className="px-5 pb-4 pt-3 space-y-2 bg-[#fafbfe] border-t border-[#f0f2f8]">
          {stats.map(r => {
            const s = regionStatusColor(r.managersFinalized, r.managersPartial, r.totalManagers);
            const isRegionExpanded = expandedRegions.has(r.regionName);
            const rFinPct = r.totalManagers === 0 ? 0 : Math.round((r.managersFinalized / r.totalManagers) * 100);
            const rPartialPct = r.totalManagers === 0 ? 0 : Math.round((r.managersPartial / r.totalManagers) * 100);
            return (
              <div key={r.regionName} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <button
                  onClick={() => {
                    setExpandedRegions(prev => {
                      const next = new Set(prev);
                      if (next.has(r.regionName)) next.delete(r.regionName);
                      else next.add(r.regionName);
                      return next;
                    });
                  }}
                  className="w-full grid grid-cols-[20px_1fr_220px_100px_20px] gap-3 items-center px-4 py-3 cursor-pointer hover:bg-[#fafbfe] text-left"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shadow-sm ${dotClass[s]}`} />
                  <span className="text-[14px] font-bold">{r.regionName}</span>
                  <span className="text-[11px] text-right">
                    <span className="text-emerald-600 font-bold">{r.managersFinalized}</span>
                    <span className="text-muted-foreground/60"> повністю · </span>
                    <span className="text-amber-600 font-bold">{r.managersPartial}</span>
                    <span className="text-muted-foreground/60"> частково · </span>
                    <span className="font-bold">{r.managersEmpty}</span>
                    <span className="text-muted-foreground/60"> з {r.totalManagers}</span>
                  </span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden relative">
                      <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${rFinPct}%` }} />
                      <div className="absolute inset-y-0 bg-amber-500" style={{ left: `${rFinPct}%`, width: `${rPartialPct}%` }} />
                    </div>
                    <span className={`text-[11px] font-bold leading-none ${textClass[s]}`}>{rFinPct}%</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${isRegionExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isRegionExpanded && (
                  <div className="px-4 pb-3 pt-2 border-t border-[#f0f2f8] grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {r.managers.map(m => (
                      <div key={m.login} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className={`w-2 h-2 rounded-full ${dotClass[m.status === 'finalized' ? 'green' : m.status === 'partial' ? 'amber' : 'rose']}`} />
                          <span className={`font-semibold flex-1 truncate ${m.status === 'empty' ? 'text-rose-700' : ''}`}>{m.name || m.login}</span>
                          <span className="text-[11px] font-mono shrink-0">
                            <span className="text-emerald-600 font-bold">{m.finalized.length}</span>
                            <span className="text-muted-foreground/40">/</span>
                            <span className="text-amber-600 font-bold">{m.draft.length}</span>
                            <span className="text-muted-foreground/40">/</span>
                            <span className="text-muted-foreground/60">{totalBrands}</span>
                          </span>
                        </div>
                        {(m.draft.length > 0 || (m.empty.length > 0 && m.status !== 'empty')) && (
                          <div className="pl-4 text-[10.5px] leading-tight space-y-0.5">
                            {m.draft.length > 0 && (
                              <p className="text-amber-700">
                                чернетка:{' '}
                                {m.draft.map((code, i) => (
                                  <span key={code}>
                                    <span className="font-medium">{brandName(code)}</span>
                                    {i < m.draft.length - 1 && ', '}
                                  </span>
                                ))}
                              </p>
                            )}
                            {m.empty.length > 0 && m.status === 'partial' && (
                              <p className="text-muted-foreground">
                                не заповнено:{' '}
                                {m.empty.map((code, i) => (
                                  <span key={code}>
                                    <span className="font-medium">{brandName(code)}</span>
                                    {i < m.empty.length - 1 && ', '}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
