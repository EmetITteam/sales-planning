'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { getWeeksForMonth, getMonthOptions, formatWeekShort, weekEndToId } from '@/lib/periods';
import { Calendar, ChevronDown, Check } from 'lucide-react';

export function PeriodFilter() {
  const { currentPeriod, setCurrentPeriod } = useAppStore();
  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('2026-04');

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
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#e2e7ef] hover:border-[#066aab]/30 hover:shadow-sm transition-all cursor-pointer"
      >
        <Calendar className="h-4 w-4 text-[#066aab]" />
        <span className="text-[13px] font-semibold text-foreground">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Dropdown */}
          <div className="absolute top-full mt-2 left-0 z-50 w-[320px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#e2e7ef] overflow-hidden">
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
                        ? 'bg-[#066aab] text-white shadow-sm'
                        : 'bg-[#f4f7fb] text-muted-foreground hover:bg-[#e8f4fc]'
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
                        ? 'bg-[#e8f4fc] text-[#066aab]'
                        : 'hover:bg-[#f4f7fb] text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-bold ${
                        isSelected ? 'bg-[#066aab] text-white' : 'bg-[#f0f2f8] text-muted-foreground'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold">{formatWeekShort(w.weekStart, w.weekEnd)}</p>
                        {w.isActive && (
                          <span className="text-[10px] text-[#066aab] font-medium">Поточний тиждень</span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-[#066aab]" />}
                  </button>
                );
              })}
            </div>

            {/* Month total button */}
            <div className="px-3 py-2.5 border-t border-[#e2e7ef]">
              <button
                onClick={() => {
                  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];
                  setCurrentPeriod({
                    id: weekEndToId(monthEnd),
                    weekStart: `${selectedMonth}-01`,
                    weekEnd: monthEnd,
                    month: `${selectedMonth}-01`,
                    isActive: false,
                  });
                  setOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-[#066aab]/5 to-[#0880cc]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 border border-[#066aab]/10 text-[13px] font-semibold text-[#066aab] transition-all cursor-pointer"
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
