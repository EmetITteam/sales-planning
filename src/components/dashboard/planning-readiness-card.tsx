'use client';

/**
 * <PlanningReadinessCard> — overview готовності планування на дашборді Director.
 *
 * Метрика: «заповнила бренд» = є ≥1 рядок у forecasts АБО gap_closures для
 * (менеджер × бренд × місяць). Не сума, не %, а саме факт роботи у системі.
 *
 * Дані беруться з planAgg.byLogin (вже завантажено для дашборду через
 * usePlanningAggregate). Якщо byLogin[login][segment] існує → бренд заповнено.
 *
 * Стани:
 *  - Усі заповнили 9/9 → компактний «✓ Усі менеджери заповнили план» (без drill-down)
 *  - Хтось не заповнив → повний блок з expand-меню (як RegionAccordion)
 *
 * Вимикається через FEATURES.PLANNING_READINESS у feature-flags.ts.
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import type { RegionData } from '@/lib/types';
import { SEGMENTS } from '@/lib/mock-data';

interface PlanByLogin {
  [login: string]: { [segment: string]: { forecast: number; gap: number } };
}

interface Props {
  /** Сирий список регіонів з 1С Action 5 — для імен менеджерів. */
  regions: RegionData[];
  /** byLogin breakdown з /api/planning/aggregate (повертається коли всі менеджери у запиті). */
  planByLogin?: PlanByLogin | null;
  /** Загальна кількість брендів у плануванні (default = 9 з SEGMENTS). */
  totalBrands?: number;
}

const ALL_BRAND_CODES = SEGMENTS.map(s => s.code);

interface ManagerStat {
  login: string;
  name: string;
  filled: string[]; // segment codes that have rows
  missing: string[]; // segment codes that have NO rows
}

interface RegionStat {
  regionName: string;
  managers: ManagerStat[];
  filledCount: number; // менеджерів які мають ≥1 бренд
  totalCount: number;
  fullyFilledCount: number; // менеджерів які заповнили ВСІ бренди
}

function statusColor(filledCount: number, totalCount: number): 'green' | 'amber' | 'rose' {
  if (totalCount === 0) return 'rose';
  if (filledCount === totalCount) return 'green';
  if (filledCount === 0) return 'rose';
  return 'amber';
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
const barClass: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

// Назва бренду для display (Petaran замість PETARAN). З SEGMENTS.
const brandName = (code: string) => SEGMENTS.find(s => s.code === code)?.name ?? code;

export function PlanningReadinessCard({ regions, planByLogin, totalBrands = 9 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const stats = useMemo<RegionStat[]>(() => {
    if (!planByLogin) return [];
    return regions
      .map(r => {
        const managers: ManagerStat[] = r.managers.map(m => {
          const segMap = planByLogin[m.login] || {};
          const filled = ALL_BRAND_CODES.filter(code => segMap[code] !== undefined);
          const missing = ALL_BRAND_CODES.filter(code => segMap[code] === undefined);
          return { login: m.login, name: m.name, filled, missing };
        });
        const filledCount = managers.filter(m => m.filled.length > 0).length;
        const fullyFilledCount = managers.filter(m => m.filled.length === totalBrands).length;
        return {
          regionName: r.regionName,
          managers,
          filledCount,
          totalCount: managers.length,
          fullyFilledCount,
        };
      })
      .filter(r => r.totalCount > 0)
      // Сортуємо: проблемні регіони зверху (мало заповнених)
      .sort((a, b) => {
        const aPct = a.totalCount === 0 ? 1 : a.filledCount / a.totalCount;
        const bPct = b.totalCount === 0 ? 1 : b.filledCount / b.totalCount;
        return aPct - bPct;
      });
  }, [regions, planByLogin, totalBrands]);

  const total = useMemo(() => {
    let totalManagers = 0;
    let totalFilled = 0;
    let totalFullyFilled = 0;
    for (const r of stats) {
      totalManagers += r.totalCount;
      totalFilled += r.filledCount;
      totalFullyFilled += r.fullyFilledCount;
    }
    return { totalManagers, totalFilled, totalFullyFilled };
  }, [stats]);

  // Loading state (planAgg ще не догрузився)
  if (!planByLogin || total.totalManagers === 0) return null;

  // Усі заповнили повністю → компактний інлайн-стан без drill-down
  const allFullyFilled = total.totalFullyFilled === total.totalManagers;
  if (allFullyFilled) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold">Усі менеджери заповнили план</p>
            <p className="text-[11px] text-muted-foreground">
              {total.totalManagers} менеджерів · усі {totalBrands} брендів закрито
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700">✓ ПОВНІСТЮ</span>
        </div>
      </div>
    );
  }

  // Часткова готовність — повний блок з drill-down
  const filledPct = Math.round((total.totalFilled / total.totalManagers) * 100);
  const overallStatus = statusColor(total.totalFilled, total.totalManagers);
  const overallLabel = overallStatus === 'green' ? 'ГОТОВО' : overallStatus === 'amber' ? 'ЧАСТКОВО' : 'ВІДСТАВАННЯ';

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Header row — у стилі RegionAccordion */}
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
            <p className="text-[11px] text-muted-foreground">{total.totalManagers} менеджерів</p>
          </div>
        </div>

        {/* Mini-list регіонів у 2 колонки — БЕЗ % (тільки dot + назва + count) */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1 px-2">
          {stats.map(r => {
            const s = statusColor(r.filledCount, r.totalCount);
            return (
              <span key={r.regionName} className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass[s]}`} />
                <span className="font-semibold text-foreground/80 truncate">{r.regionName}</span>
                <span className="text-muted-foreground/60 ml-auto shrink-0 font-mono">{r.filledCount}/{r.totalCount}</span>
              </span>
            );
          })}
        </div>

        {/* Right cluster — як у RegionAccordion */}
        <div className="flex items-start gap-4 justify-end shrink-0 min-h-[56px]">
          <div className="text-right min-w-[140px]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Заповнили</p>
            <p className="text-[14px] font-bold font-mono leading-none mt-1.5 whitespace-nowrap">
              {total.totalFilled}<span className="text-muted-foreground/50 font-normal"> / </span><span className="text-muted-foreground/70">{total.totalManagers}</span>
            </p>
            <p className="text-[10px] text-muted-foreground leading-none mt-1">
              {total.totalFullyFilled} повністю · {total.totalFilled - total.totalFullyFilled} частково
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 w-14">
            <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]" style={{ width: `${filledPct}%` }} />
            </div>
            <span className="text-[11px] font-bold leading-none text-[#066aab]">{filledPct}%</span>
          </div>
          <div className="w-[100px]">
            <div className="h-[12px] leading-none mb-1.5" />
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-${overallStatus === 'green' ? 'emerald' : overallStatus === 'amber' ? 'amber' : 'rose'}-50 text-${overallStatus === 'green' ? 'emerald' : overallStatus === 'amber' ? 'amber' : 'rose'}-700`}>{overallLabel}</span>
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
            const s = statusColor(r.filledCount, r.totalCount);
            const isRegionExpanded = expandedRegions.has(r.regionName);
            const pct = r.totalCount === 0 ? 0 : Math.round((r.filledCount / r.totalCount) * 100);
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
                  className="w-full grid grid-cols-[20px_1fr_140px_80px_20px] gap-3 items-center px-4 py-3 cursor-pointer hover:bg-[#fafbfe] text-left"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shadow-sm ${dotClass[s]}`} />
                  <span className="text-[14px] font-bold">{r.regionName}</span>
                  <span className="text-[11px] text-muted-foreground text-right font-mono">{r.filledCount}/{r.totalCount} заповнили</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                      <div className={`h-full rounded-full ${barClass[s]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[11px] font-bold leading-none ${textClass[s]}`}>{pct}%</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${isRegionExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isRegionExpanded && (
                  <div className="px-4 pb-3 pt-2 border-t border-[#f0f2f8] grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {r.managers.map(m => {
                      const mgrStatus = m.filled.length === 0
                        ? 'rose'
                        : m.filled.length === totalBrands
                          ? 'green'
                          : 'amber';
                      return (
                        <div key={m.login} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className={`w-2 h-2 rounded-full ${dotClass[mgrStatus]}`} />
                            <span className={`font-semibold flex-1 truncate ${mgrStatus === 'rose' ? 'text-rose-700' : ''}`}>{m.name || m.login}</span>
                            <span className={`text-[11px] font-bold font-mono ${textClass[mgrStatus]}`}>{m.filled.length}/{totalBrands}</span>
                          </div>
                          {m.missing.length > 0 && m.filled.length > 0 && (
                            <p className="text-[10.5px] text-muted-foreground pl-4 leading-tight">
                              пропустила:{' '}
                              {m.missing.map((code, i) => (
                                <span key={code}>
                                  <span className="text-rose-500">●</span>{' '}
                                  <span className="font-medium">{brandName(code)}</span>
                                  {i < m.missing.length - 1 && ', '}
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      );
                    })}
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
