'use client';

/**
 * TimePicker — Google Calendar-style: текстовий input з валідацією + список
 * готових часів у дропдауні. Tap або ручний ввід — на вибір.
 *
 * UX:
 *  - Trigger: HH:MM mono + іконка годинника
 *  - Клік → dropdown з editable input + scrollable list (08:00 — 20:45,
 *    крок 15 хв; найближчий до поточного значення авто-scroll-иться у вид)
 *  - Click на рядок → emit + close
 *  - Друкуй у input HH:MM → Enter або blur підтверджує. Якщо неправильний
 *    формат — повертає попереднє значення.
 *  - Filter: коли друкуєш "11", у списку лишаються тільки часи що містять "11"
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Початок діапазону у списку (default 8). */
  startHour?: number;
  /** Кінець діапазону (default 20). */
  endHour?: number;
  /** Крок хвилин у списку (default 15). */
  minuteStep?: 5 | 10 | 15 | 30;
}

export function TimePicker({
  value,
  onChange,
  className,
  startHour = 8,
  endHour = 20,
  minuteStep = 15,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Sync draft з prop коли picker закритий
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  // ESC / click-outside
  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitDraft();
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, value]);

  // Auto-scroll до активного значення при відкритті
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (activeRef.current && listRef.current) {
        const list = listRef.current;
        const item = activeRef.current;
        list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
      }
    });
  }, [open]);

  // Список готових часів
  const presets = useMemo(() => {
    const out: string[] = [];
    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += minuteStep) {
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return out;
  }, [startHour, endHour, minuteStep]);

  // Фільтр по draft (коли друкуєш «11» → лишаються тільки часи з «11»)
  const filtered = useMemo(() => {
    const q = draft.trim();
    if (!q || isValidTime(q)) return presets;
    return presets.filter(t => t.includes(q));
  }, [presets, draft]);

  const commitDraft = () => {
    if (isValidTime(draft)) {
      const norm = normalize(draft);
      if (norm !== value) onChange(norm);
    } else {
      setDraft(value);
    }
  };

  const handleOpen = () => {
    setDraft(value);
    setOpen(true);
  };

  const handlePick = (t: string) => {
    onChange(t);
    setDraft(t);
    setOpen(false);
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
        <div className="absolute z-50 mt-1.5 left-0 right-0 min-w-[200px] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden">
          {/* Editable input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isValidTime(draft)) {
                    onChange(normalize(draft));
                    setOpen(false);
                  } else if (filtered.length > 0) {
                    handlePick(filtered[0]);
                  }
                }
              }}
              placeholder="HH:MM"
              autoFocus
              className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-slate-200 bg-white text-[14px] font-mono font-semibold tabular-nums text-emet-ink outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/20 transition-all"
            />
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setOpen(false);
              }}
              aria-label="Закрити"
              className="w-8 h-8 rounded-lg hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-slate-500 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable list */}
          <div
            ref={listRef}
            className="max-h-[260px] overflow-y-auto overscroll-contain py-1"
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                Нічого не знайдено. Введіть час вручну.
              </div>
            ) : (
              filtered.map(t => {
                const isActive = t === value;
                return (
                  <button
                    key={t}
                    ref={isActive ? activeRef : null}
                    type="button"
                    onClick={() => handlePick(t)}
                    className={`w-full px-4 py-2.5 flex items-center font-mono tabular-nums text-[14px] transition-colors ${
                      isActive
                        ? 'bg-emet-blue text-white font-bold'
                        : 'text-emet-ink hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isValidTime(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
}

function normalize(s: string): string {
  const [h, m] = s.trim().split(':');
  return `${String(Number(h)).padStart(2, '0')}:${String(Number(m)).padStart(2, '0')}`;
}
