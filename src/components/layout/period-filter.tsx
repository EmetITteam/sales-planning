'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { getWeeksForMonth, getMonthOptions, formatWeekShort, weekEndToId } from '@/lib/periods';
import { Calendar, ChevronDown, Check } from 'lucide-react';

export function PeriodFilter() {
  const { currentPeriod, setCurrentPeriod } = useAppStore();
  const [open, setOpen] = useState(false);
  // Синхронізовано з currentPeriod.month — інакше при smart-default у попередньому
  // місяці dropdown відкриється на хардкодному квітні.
  const [selectedMonth, setSelectedMonth] = useState(() => currentPeriod.month.slice(0, 7));

  const months = getMonthOptions();
  const [year, month] = selectedMonth.split('-').map(Number);
  const weeks = useMemo(() => getWeeksForMonth(year, month - 1), [year, month]);

  const currentLabel = formatWeekShort(currentPeriod.weekStart, currentPeriod.weekEnd);
  const currentMonthLabel = months.find(m => m.value === selectedMonth)?.label ?? '';
  const ref = useRef<HTMLDivElement>(null);

  // Закривати при кліку поза dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Невеликий delay щоб не перехопити клік що відкрив
    const timer = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/60 backdrop-blur-md border border-white/50 hover:border-emet-blue/30 hover:bg-white/80 transition-all cursor-pointer"
      >
        <Calendar className="h-4 w-4 text-emet-blue" />
        <span className="text-[13px] font-semibold text-foreground">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Dropdown */}
          <div className="absolute top-full mt-2 left-0 z-50 w-[320px] glass-card overflow-hidden shadow-[0_8px_40px_rgba(6,42,61,0.12)]">
            {/* Month selector */}
            <div className="px-4 py-3 border-b border-[#e2e7ef]">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Місяць</p>
              <div className="flex gap-1.5 flex-wrap">
                {months.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setSelectedMonth(m.value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      selectedMonth === m.value
                        ? 'bg-emet-blue text-white shadow-sm'
                        : 'bg-[#f4f7fb] text-muted-foreground hover:bg-emet-50'
                    }`}
                  >
                    {m.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Weeks */}
            <div className="px-2 py-2 max-h-[250px] overflow-y-auto">
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{currentMonthLabel} — тижні</p>
              {weeks.map((w, i) => {
                const isSelected = w.weekEnd === currentPeriod.weekEnd;
                return (
                  <button
                    key={w.weekEnd}
                    onClick={() => { setCurrentPeriod(w); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emet-50 text-emet-blue'
                        : 'hover:bg-[#f4f7fb] text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-bold ${
                        isSelected ? 'bg-emet-blue text-white' : 'bg-[#f0f2f8] text-muted-foreground'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold">{formatWeekShort(w.weekStart, w.weekEnd)}</p>
                        {w.isActive && (
                          <span className="text-[10px] text-emet-blue font-medium">Поточний тиждень</span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-emet-blue" />}
                  </button>
                );
              })}
            </div>

            {/* Month total button */}
            <div className="px-3 py-2.5 border-t border-[#e2e7ef]">
              <button
                onClick={() => {
                  // ⚠️ НЕ через toISOString() — UTC-зсув обрізає 30.04 у 29.04
                  // на серверах поза UTC. Будуємо рядок вручну.
                  const lastDay = new Date(year, month, 0).getDate();
                  const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
                  setCurrentPeriod({
                    id: weekEndToId(monthEnd),
                    weekStart: `${selectedMonth}-01`,
                    weekEnd: monthEnd,
                    month: `${selectedMonth}-01`,
                    isActive: false,
                  });
                  setOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emet-blue/5 to-emet-blue-light/5 hover:from-emet-blue/10 hover:to-emet-blue-light/10 border border-emet-blue/10 text-[13px] font-semibold text-emet-blue transition-all cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5" />
                Весь {currentMonthLabel.toLowerCase()}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
