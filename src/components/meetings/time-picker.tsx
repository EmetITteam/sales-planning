'use client';

/**
 * TimePicker — iOS-style wheel picker (як у Будильнику iPhone). Дві колонки
 * (години + хвилини) що скролляться, snap по центру, активне значення
 * виділене у центральному окні-індикаторі.
 *
 * Без додаткових залежностей — чистий CSS scroll-snap + scroll listener
 * з debounce. Працює touchscreen, миша, клавіатура (стрілки коли focused).
 *
 * Структура:
 *  - Trigger: HH:MM mono + іконка
 *  - Dropdown: 2 колонки × scrollable list + центральний overlay-індикатор
 *  - OK кнопка внизу підтверджує вибір (закриває picker з committed value)
 *  - X / клік-за-межами — скасувати без зміни
 */

import { useEffect, useRef, useState } from 'react';
import { Clock, Check, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  startHour?: number;
  endHour?: number;
  minuteStep?: 1 | 5 | 10 | 15 | 30;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5; // непарне (центр + 2 з кожного боку)
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

export function TimePicker({
  value,
  onChange,
  className,
  startHour = 0,
  endHour = 23,
  minuteStep = 5,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(() => parseTime(value)[0]);
  const [minute, setMinute] = useState(() => parseTime(value)[1]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);

  // sync при зміні value ззовні (коли закритий)
  useEffect(() => {
    if (!open) {
      const [h, m] = parseTime(value);
      setHour(h);
      setMinute(m);
    }
  }, [value, open]);

  // ESC / click outside
  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancel();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter') commit();
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hour, minute]);

  // При відкритті — scroll до поточних значень
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const hIdx = hours.indexOf(hour);
      const mIdx = minutes.indexOf(minute);
      if (hoursRef.current && hIdx >= 0) hoursRef.current.scrollTop = hIdx * ITEM_HEIGHT;
      if (minutesRef.current && mIdx >= 0) minutesRef.current.scrollTop = mIdx * ITEM_HEIGHT;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpen = () => {
    const [h, m] = parseTime(value);
    // Якщо minute не кратний step — snap до найближчого кратного
    const snapped = minutes.includes(m) ? m : closestMultiple(m, minuteStep);
    setHour(h);
    setMinute(snapped);
    setOpen(true);
  };

  const commit = () => {
    const next = `${pad2(hour)}:${pad2(minute)}`;
    if (next !== value) onChange(next);
    setOpen(false);
  };

  const cancel = () => {
    const [h, m] = parseTime(value);
    setHour(h);
    setMinute(m);
    setOpen(false);
  };

  const handleScroll = (kind: 'hour' | 'minute') => {
    const el = kind === 'hour' ? hoursRef.current : minutesRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    if (kind === 'hour') {
      const next = hours[idx];
      if (next !== undefined && next !== hour) setHour(next);
    } else {
      const next = minutes[idx];
      if (next !== undefined && next !== minute) setMinute(next);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 h-11 px-3 rounded-[10px] border border-slate-200 bg-white text-[14px] font-mono font-semibold tracking-tight text-emet-ink hover:border-emet-blue focus:border-emet-blue focus:outline-none focus:ring-2 focus:ring-emet-blue/30 transition-all"
        aria-label="Вибрати час"
      >
        <span className="tabular-nums">{value || '--:--'}</span>
        <Clock className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[260px] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">Час</span>
            <span className="font-mono font-bold text-[15px] tabular-nums text-emet-blue">
              {pad2(hour)}:{pad2(minute)}
            </span>
          </div>

          {/* Wheel-picker body */}
          <div className="relative px-2 pt-2 pb-3 bg-white">
            <div className="flex gap-2">
              <WheelColumn
                ref={hoursRef}
                items={hours}
                selected={hour}
                onScroll={() => handleScroll('hour')}
                onPick={h => {
                  setHour(h);
                  const idx = hours.indexOf(h);
                  if (hoursRef.current) {
                    hoursRef.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
                  }
                }}
              />
              <div className="flex items-center justify-center w-4 font-mono font-bold text-[20px] text-emet-ink">:</div>
              <WheelColumn
                ref={minutesRef}
                items={minutes}
                selected={minute}
                onScroll={() => handleScroll('minute')}
                onPick={m => {
                  setMinute(m);
                  const idx = minutes.indexOf(m);
                  if (minutesRef.current) {
                    minutesRef.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
                  }
                }}
              />
            </div>

            {/* Center highlight band — overlay через pointer-events:none */}
            <div
              className="absolute left-2 right-2 pointer-events-none border-y border-emet-blue/30 bg-emet-blue/[0.04]"
              style={{
                top: `${PAD + 8}px`,
                height: `${ITEM_HEIGHT}px`,
              }}
            />

            {/* Top/bottom fade — щоб краї виглядали ефект wheel */}
            <div
              className="absolute left-2 right-2 pointer-events-none bg-gradient-to-b from-white to-transparent"
              style={{ top: '8px', height: `${PAD}px` }}
            />
            <div
              className="absolute left-2 right-2 pointer-events-none bg-gradient-to-t from-white to-transparent"
              style={{ bottom: '12px', height: `${PAD}px` }}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50/40">
            <button
              type="button"
              onClick={cancel}
              className="flex-1 h-9 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Скасувати
            </button>
            <button
              type="button"
              onClick={commit}
              className="flex-1 h-9 rounded-lg bg-emet-blue text-white text-[13px] font-bold hover:bg-emet-blue-light inline-flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface WheelColumnProps {
  items: number[];
  selected: number;
  onScroll: () => void;
  onPick: (v: number) => void;
}

const WheelColumn = ({
  ref,
  items,
  selected,
  onScroll,
  onPick,
}: WheelColumnProps & { ref: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="relative flex-1 overflow-y-scroll overscroll-contain snap-y snap-mandatory scrollbar-hide"
      style={{
        height: `${COLUMN_HEIGHT}px`,
        scrollbarWidth: 'none',
      }}
    >
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
      <div style={{ paddingTop: `${PAD}px`, paddingBottom: `${PAD}px` }}>
        {items.map(item => {
          const isSelected = item === selected;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onPick(item)}
              className={`w-full font-mono font-bold tabular-nums snap-center snap-always transition-all ${
                isSelected ? 'text-emet-ink text-[22px]' : 'text-slate-400 text-[18px]'
              }`}
              style={{ height: `${ITEM_HEIGHT}px`, lineHeight: `${ITEM_HEIGHT}px` }}
            >
              {pad2(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

function parseTime(s: string): [number, number] {
  if (!s) return [0, 0];
  const [h, m] = s.split(':');
  return [Number(h) || 0, Number(m) || 0];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function closestMultiple(n: number, step: number): number {
  return Math.round(n / step) * step;
}
