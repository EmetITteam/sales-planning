'use client';

/**
 * PlanningPeriodBar — фільтр-панель ТІЛЬКИ для блоку «Планування».
 *
 * Перенесена з глобальної шапки 2026-06-04, бо інші блоки (Мої клієнти,
 * Огляд компанії, Зустрічі) мають свої власні фільтри під свій use-case.
 * /planning лишається на тижнево-місячному ритмі звітності — його ламати не
 * можна.
 *
 * Що показує:
 *  - PeriodFilter (тиждень/місяць) — currentPeriod зі store
 *  - LIVE-toggle (Zap) — миттєво на сьогодні
 *  - LIVE pill (червона точка + дата) — коли live активний
 */

import { useAppStore } from '@/lib/store';
import { PeriodFilter } from './period-filter';
import { monthlyPeriodMeta } from '@/lib/periods';
import { Zap } from 'lucide-react';

export function PlanningPeriodBar() {
  const { liveMode, setLiveMode, setCurrentPeriod } = useAppStore();

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-2">
      {/* Period filter — приглушений у live-режимі (live перекриває звітний період) */}
      <div className={`shrink-0 ${liveMode ? 'opacity-50 pointer-events-none' : ''}`}>
        <PeriodFilter />
      </div>

      {/* LIVE toggle.
          При активації окрім liveMode перемикаємо період на поточний місяць —
          інакше пілюля «LIVE · <сьогодні>» сперечається з даними попереднього
          місяця (бо період stays там де користувач його лишив). */}
      <button
        onClick={() => {
          const next = !liveMode;
          setLiveMode(next);
          if (next) {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const meta = monthlyPeriodMeta(`${monthStr}-01`);
            setCurrentPeriod({ ...meta, isActive: true });
          }
        }}
        className={`inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3.5 rounded-full border text-[12px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
          liveMode
            ? 'bg-amber-50/70 backdrop-blur-md border-amber-300/70 text-amber-700 shadow-sm'
            : 'bg-white/60 backdrop-blur-md border-white/50 text-muted-foreground hover:border-amber-200 hover:text-amber-700'
        }`}
        title={liveMode ? 'Перейти на звітний фільтр' : 'Перегляд "на сьогодні" (read-only)'}
        aria-label="На сьогодні"
      >
        <Zap className={`h-3.5 w-3.5 ${liveMode ? 'fill-amber-400' : ''}`} />
        <span className="hidden sm:inline">На сьогодні</span>
      </button>

      {liveMode && (
        <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-amber-500/12 border border-amber-300/40 text-amber-800 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
          <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b]" />
          LIVE · {new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'long' })}
        </span>
      )}
    </div>
  );
}
