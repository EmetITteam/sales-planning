'use client';

import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatUSD, formatPct, getTrafficLight, calcForecastPercent } from '@/lib/format';
import { getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';

export interface BrandRowProps {
  segmentName: string;
  planAmount: number;
  factAmount: number;
  /** Норма календаря (calcPct) — однакова для всіх брендів дашборда */
  calcPct: number;
  /** Дата зрізу для run-rate (forecast) */
  asOfDate: Date;
  /**
   * Очікуваний % (план менеджера) — якщо не передано, рахується як mock:
   * факт + 60% від розриву (для РМ/директора, де реальних обіцянок немає).
   */
  expectedPercent?: number;
  /** Чи є реальний план менеджера (для бейджу 'план не заповнено') */
  hasManagerPlan?: boolean;
  /** Кількість клієнтів — лише на менеджерському дашборді */
  clientCount?: number;
  /** Сума факту минулого місяця на той самий N-й робочий день */
  prevMonthFactAmount?: number;
  prevMonthFactPercent?: number;
  /** Клік — для drill-down */
  onClick?: () => void;
  /** Read-only: без hover-ефекту і chevron */
  readOnly?: boolean;
}

export function BrandRow({
  segmentName,
  planAmount,
  factAmount,
  calcPct,
  asOfDate,
  expectedPercent,
  hasManagerPlan = true,
  clientCount,
  prevMonthFactAmount,
  prevMonthFactPercent,
  onClick,
  readOnly,
}: BrandRowProps) {
  const factPercent = planAmount > 0 ? (factAmount / planAmount) * 100 : 0;
  const tl = getTrafficLight(factPercent, calcPct);
  const dev = factPercent - calcPct;
  const factBarWidth = Math.min(factPercent, 100);

  // Forecast (run-rate) — для РМ/директора показуємо як ще один маркер
  const totalWD = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());
  const passedWD = getPassedWorkingDays(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
  const forecastPct = calcForecastPercent(factAmount, planAmount, passedWD, totalWD);

  // Очікуваний (план менеджера). Якщо не переданий — mock (факт + 60% від розриву).
  const computedExpectedPct = expectedPercent ?? (
    planAmount > 0 ? Math.min(factPercent + 0.6 * Math.max(0, 100 - factPercent), 100) : 0
  );

  // Динаміка vs минулий місяць
  const prev = prevMonthFactAmount ?? 0;
  const dynAmount = factAmount - prev;
  const dynPct = factPercent - (prevMonthFactPercent ?? 0);
  const dynBetter = dynAmount >= 0;
  const DynArrow = dynBetter ? TrendingUp : TrendingDown;

  const isInactive = planAmount === 0 && factAmount === 0;

  const Wrapper: React.ElementType = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`group w-full text-left bg-white rounded-2xl p-3 md:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] ${
        onClick && !readOnly ? 'hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] cursor-pointer hover:-translate-y-px' : ''
      } transition-all duration-200 ${isInactive ? 'opacity-50' : ''}`}
    >
      {/* === DESKTOP (md+): один рядок === */}
      <div className="hidden md:grid md:grid-cols-[140px_95px_115px_minmax(120px,1fr)_85px_85px_60px_170px_20px] gap-3 items-center">
        {/* 1. Бренд + точка */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full ${tl.dot} shadow-sm shrink-0`} />
          <span className="text-[14px] font-bold truncate">{segmentName}</span>
        </div>

        {/* 2. Бейдж */}
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-center ${tl.bg} ${tl.color}`}>
          {tl.label}
        </span>

        {/* 3. Факт % + відхилення */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold tracking-tight">{formatPct(factPercent)}</span>
          <span className={`text-[11px] font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
          </span>
        </div>

        {/* 4. Прогрес-бар + насічки + підпис */}
        <div className="min-w-0">
          <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc] transition-all duration-500"
              style={{ width: `${factBarWidth}%` }}
            />
            {/* Насічка прогнозу (run-rate, амбер) */}
            {forecastPct > 0 && forecastPct <= 100 && (
              <div
                className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-amber-500 rounded-full"
                style={{ left: `calc(${Math.min(forecastPct, 100)}% - 1px)` }}
                title={`Прогноз (темп): ${formatPct(forecastPct)}`}
              />
            )}
            {/* Насічка очікуваного (план менеджера, EMET-синя) */}
            {hasManagerPlan && (
              <div
                className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full"
                style={{ left: `calc(${Math.min(computedExpectedPct, 100)}% - 1px)` }}
                title={`Очікуваний (план менеджера): ${formatPct(computedExpectedPct)}`}
              />
            )}
          </div>
          <p className="text-[10px] mt-1 truncate flex items-center gap-2">
            <span><span className="text-amber-600">●</span> Прогноз: <span className="font-bold text-amber-600">{formatPct(forecastPct)}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span><span className="text-[#066aab]">●</span> Очік.: <span className="font-bold text-[#066aab]">{formatPct(computedExpectedPct)}</span></span>
            {!hasManagerPlan && (
              <span className="text-amber-600 font-semibold">· план не заповнено</span>
            )}
          </p>
        </div>

        {/* 5. План */}
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">План</p>
          <p className="text-[12px] font-bold amount">{formatUSD(planAmount)}</p>
        </div>

        {/* 6. Факт */}
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Факт</p>
          <p className="text-[12px] font-bold amount">{formatUSD(factAmount)}</p>
        </div>

        {/* 7. Клієнти (якщо є) */}
        {clientCount !== undefined ? (
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Клієнти</p>
            <p className="text-[12px] font-bold">{clientCount}</p>
          </div>
        ) : (
          <div />
        )}

        {/* 8. vs мин. міс. */}
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">vs мин. міс.</p>
          {prev > 0 ? (
            <p className={`text-[11px] font-semibold flex items-center justify-end gap-0.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
              <DynArrow className="h-3 w-3" />
              <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
              <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">—</p>
          )}
        </div>

        {/* 9. Chevron */}
        {onClick ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] group-hover:translate-x-0.5 transition-all" />
        ) : <div />}
      </div>

      {/* === MOBILE (<md): дві строки === */}
      <div className="md:hidden flex flex-col gap-2">
        {/* Mobile верх: бренд / бейдж / факт% / chevron */}
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full ${tl.dot} shrink-0`} />
          <span className="text-[14px] font-bold truncate flex-1">{segmentName}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${tl.bg} ${tl.color}`}>
            {tl.label}
          </span>
          <span className="text-[18px] font-extrabold tracking-tight">{formatPct(factPercent)}</span>
          <span className={`text-[10px] font-bold ${dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {dev >= 0 ? '+' : ''}{dev.toFixed(1)}%
          </span>
          {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
        </div>

        {/* Mobile прогрес-бар */}
        <div className="relative w-full h-2 rounded-full bg-[#f0f2f8] overflow-visible">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
            style={{ width: `${factBarWidth}%` }}
          />
          {forecastPct > 0 && forecastPct <= 100 && (
            <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-amber-500 rounded-full"
              style={{ left: `calc(${Math.min(forecastPct, 100)}% - 1px)` }} />
          )}
          {hasManagerPlan && (
            <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#066aab] rounded-full"
              style={{ left: `calc(${Math.min(computedExpectedPct, 100)}% - 1px)` }} />
          )}
        </div>

        {/* Mobile низ: проценти + суми + динаміка */}
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          <span><span className="text-amber-600">●</span> Прогноз <span className="font-bold text-amber-600">{formatPct(forecastPct)}</span></span>
          <span><span className="text-[#066aab]">●</span> Очік. <span className="font-bold text-[#066aab]">{formatPct(computedExpectedPct)}</span></span>
          <span className="text-muted-foreground">|</span>
          <span>План <span className="font-bold amount">{formatUSD(planAmount)}</span></span>
          <span>Факт <span className="font-bold amount">{formatUSD(factAmount)}</span></span>
          {clientCount !== undefined && <span>Клієнти <span className="font-bold">{clientCount}</span></span>}
          {prev > 0 && (
            <span className={`flex items-center gap-0.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'} font-semibold`}>
              <DynArrow className="h-3 w-3" />
              <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
              <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
