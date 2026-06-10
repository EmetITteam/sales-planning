'use client';

/**
 * TimePicker — 2-step picker для вибору часу зустрічі: спочатку години,
 * потім хвилини. Замість native `<input type="time">` (на десктопі
 * виглядає як stacked-колонки годин/хвилин — користувачу не подобається).
 *
 * UX:
 *  - Кнопка-trigger показує `HH:MM` mono-шрифтом + іконку годинника
 *  - Клік → dropdown sheet з step 1 (Година)
 *  - Тап години → перехід на step 2 (Хвилина)
 *  - Тап хвилини → закриття + emit value
 *  - «Назад» зі step 2 → step 1 (поміняти годину)
 *  - ESC / клік за межами → закрити без зміни
 *
 * Час повертається у форматі `HH:MM` (наприклад `14:30`).
 */

import { useEffect, useRef, useState } from 'react';
import { Clock, ChevronLeft, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Перша година у списку (default 8). */
  startHour?: number;
  /** Остання година у списку (default 20). */
  endHour?: number;
  /** Крок хвилин (default 5). Допустимі: 5, 10, 15, 30. */
  minuteStep?: 5 | 10 | 15 | 30;
}

export function TimePicker({
  value,
  onChange,
  className,
  startHour = 8,
  endHour = 20,
  minuteStep = 5,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'hour' | 'minute'>('hour');
  const containerRef = useRef<HTMLDivElement>(null);

  const [hh, mm] = parseTime(value);
  const displayHH = String(hh).padStart(2, '0');
  const displayMM = String(mm).padStart(2, '0');

  // Закриваємо по кліку поза компонентом + ESC.
  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setStep('hour');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setStep('hour');
      }
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleOpen = () => {
    setStep('hour');
    setOpen(true);
  };

  const pickHour = (h: number) => {
    onChange(`${String(h).padStart(2, '0')}:${displayMM}`);
    setStep('minute');
  };

  const pickMinute = (m: number) => {
    onChange(`${displayHH}:${String(m).padStart(2, '0')}`);
    setOpen(false);
    setStep('hour');
  };

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 h-11 px-3 rounded-[10px] border border-slate-200 bg-white text-[14px] font-mono font-semibold tracking-tight text-emet-ink hover:border-emet-blue focus:border-emet-blue focus:outline-none focus:ring-2 focus:ring-emet-blue/30 transition-all"
        aria-label="Вибрати час"
      >
        <span className="tabular-nums">{displayHH}:{displayMM}</span>
        <Clock className="w-4 h-4 text-slate-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 left-0 right-0 min-w-[280px] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-slate-100 bg-slate-50/60">
            {step === 'minute' && (
              <button
                type="button"
                onClick={() => setStep('hour')}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/60 flex items-center justify-center text-slate-600"
                aria-label="Назад до годин"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1 text-[12px] font-bold uppercase tracking-[0.7px] text-slate-600">
              {step === 'hour' ? 'Година' : `Хвилина · ${displayHH}:__`}
            </div>
            <div className="font-mono font-bold text-[14px] tabular-nums text-emet-blue">
              {displayHH}:{displayMM}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStep('hour');
              }}
              className="w-8 h-8 rounded-lg hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-slate-500"
              aria-label="Закрити"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid */}
          <div className="p-2.5">
            {step === 'hour' ? (
              <div className="grid grid-cols-4 gap-1.5">
                {hours.map(h => {
                  const isSelected = h === hh;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => pickHour(h)}
                      className={`h-11 rounded-xl font-mono font-bold text-[15px] tabular-nums transition-all ${
                        isSelected
                          ? 'bg-emet-blue text-white shadow-sm'
                          : 'bg-slate-50 text-emet-ink hover:bg-emet-blue/10 hover:text-emet-blue'
                      }`}
                    >
                      {String(h).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {minutes.map(m => {
                  const isSelected = m === mm;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMinute(m)}
                      className={`h-11 rounded-xl font-mono font-bold text-[15px] tabular-nums transition-all ${
                        isSelected
                          ? 'bg-emet-blue text-white shadow-sm'
                          : 'bg-slate-50 text-emet-ink hover:bg-emet-blue/10 hover:text-emet-blue'
                      }`}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** «HH:MM» або «HH:MM:SS» → [hours, minutes]. NaN-safe. */
function parseTime(s: string): [number, number] {
  if (!s) return [0, 0];
  const [h, m] = s.split(':');
  return [Number(h) || 0, Number(m) || 0];
}
