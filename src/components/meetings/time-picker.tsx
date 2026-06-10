'use client';

/**
 * TimePicker — два режими у одному компоненті:
 *  1. **Текстовий input HH:MM** (за замовчуванням) — друкуй цифри руками,
 *     blur/Enter підтверджує. inputMode='numeric' → на mobile спливає
 *     цифрова клавіатура.
 *  2. **Wheel picker** (iOS-Будильник стиль) — клік на іконку годинника
 *     відкриває два «барабани» (години + хвилини), snap по центру,
 *     центральна смуга-індикатор. Готово / Скасувати у footer.
 *
 * UX логіка: на desktop достатньо клавіатури (швидко), на mobile або
 * хочеш «крутнути» — годинник. Обидва режими завжди доступні.
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
const VISIBLE_ITEMS = 5;
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
  const [wheel, setWheel] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hour, setHour] = useState(() => parseTime(value)[0]);
  const [minute, setMinute] = useState(() => parseTime(value)[1]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);

  // Sync draft + wheel при зміні value ззовні
  useEffect(() => {
    if (!wheel) {
      setDraft(value);
      const [h, m] = parseTime(value);
      setHour(h);
      setMinute(m);
    }
  }, [value, wheel]);

  // Click outside / ESC закривають wheel
  useEffect(() => {
    if (!wheel) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelWheel();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelWheel();
      if (e.key === 'Enter') commitWheel();
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheel, hour, minute]);

  // При відкритті wheel — scroll до поточних значень
  useEffect(() => {
    if (!wheel) return;
    requestAnimationFrame(() => {
      const hIdx = hours.indexOf(hour);
      const mIdx = minutes.indexOf(minute);
      if (hoursRef.current && hIdx >= 0) hoursRef.current.scrollTop = hIdx * ITEM_HEIGHT;
      if (minutesRef.current && mIdx >= 0) minutesRef.current.scrollTop = mIdx * ITEM_HEIGHT;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheel]);

  const openWheel = () => {
    const [h, m] = parseTime(value);
    setHour(h);
    setMinute(minutes.includes(m) ? m : closestMultiple(m, minuteStep));
    setWheel(true);
  };

  const commitWheel = () => {
    const next = `${pad2(hour)}:${pad2(minute)}`;
    if (next !== value) onChange(next);
    setDraft(next);
    setWheel(false);
  };

  const cancelWheel = () => {
    setDraft(value);
    setWheel(false);
  };

  const commitInput = () => {
    if (isValidTime(draft)) {
      const norm = normalize(draft);
      if (norm !== value) onChange(norm);
      setDraft(norm);
    } else {
      setDraft(value);
    }
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

  // Auto-маска при наборі: дозволяємо тільки цифри + двокрапку, авто-додаємо ':'
  // після другої цифри, обмежуємо довжину 5.
  const handleInputChange = (raw: string) => {
    let v = raw.replace(/[^\d:]/g, '');
    if (v.length > 5) v = v.slice(0, 5);
    if (v.length === 2 && !v.includes(':') && draft.length < 2) {
      v = `${v}:`;
    }
    setDraft(v);
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Trigger row: input (digits) + clock icon button (wheel) */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9:]*"
          value={draft}
          onChange={e => handleInputChange(e.target.value)}
          onBlur={commitInput}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitInput();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="HH:MM"
          maxLength={5}
          className="flex-1 min-w-0 h-11 px-3 rounded-[10px] border border-slate-200 bg-white text-[14px] font-mono font-semibold tabular-nums tracking-tight text-emet-ink outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
        />
        <button
          type="button"
          onClick={() => (wheel ? cancelWheel() : openWheel())}
          aria-label="Відкрити годинник"
          className={`h-11 w-11 rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:border-emet-blue hover:text-emet-blue flex items-center justify-center shrink-0 transition-all ${
            wheel ? 'bg-emet-blue/10 text-emet-blue border-emet-blue/30' : ''
          }`}
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>

      {/* Wheel dropdown */}
      {wheel && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[260px] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">Час</span>
            <span className="font-mono font-bold text-[15px] tabular-nums text-emet-blue">
              {pad2(hour)}:{pad2(minute)}
            </span>
          </div>

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

            {/* Центральна смуга-індикатор */}
            <div
              className="absolute left-2 right-2 pointer-events-none border-y border-emet-blue/30 bg-emet-blue/[0.04]"
              style={{ top: `${PAD + 8}px`, height: `${ITEM_HEIGHT}px` }}
            />
            {/* Градієнтні фейди */}
            <div
              className="absolute left-2 right-2 pointer-events-none bg-gradient-to-b from-white to-transparent"
              style={{ top: '8px', height: `${PAD}px` }}
            />
            <div
              className="absolute left-2 right-2 pointer-events-none bg-gradient-to-t from-white to-transparent"
              style={{ bottom: '12px', height: `${PAD}px` }}
            />
          </div>

          <div className="flex gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50/40">
            <button
              type="button"
              onClick={cancelWheel}
              className="flex-1 h-9 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Скасувати
            </button>
            <button
              type="button"
              onClick={commitWheel}
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
      style={{ height: `${COLUMN_HEIGHT}px`, scrollbarWidth: 'none' }}
    >
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
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

function isValidTime(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
}

function normalize(s: string): string {
  const [h, m] = s.trim().split(':');
  return `${pad2(Number(h))}:${pad2(Number(m))}`;
}
