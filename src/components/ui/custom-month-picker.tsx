'use client';

/**
 * CustomMonthPicker — кастомний month-picker у стилі додатку (замість
 * native browser month input, який у Chrome виглядає у своєму нестилі —
 * рос. місяці, неправильні шрифти, контрастна підсвітка).
 *
 * Trigger — pill-button (label передається prop). Popover показує grid
 * 12 місяців × вибір року (з ± стрілками). Outside click закриває.
 *
 * Сумісний з overlay-input API: коли користувач обирає місяць,
 * викликається `onChange(value)` де value = 'YYYY-MM'.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const UA_MONTHS_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

interface Props {
  /** Поточне значення YYYY-MM. */
  value: string;
  /** Підпис на trigger-кнопці (наприклад «Свій»). */
  label: string;
  /** Чи активний trigger (для підсвітки). */
  active: boolean;
  /** Викликається коли обрано новий місяць. */
  onChange: (month: string) => void;
}

export function CustomMonthPicker({ value, label, active, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => {
    const y = parseInt(value.slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // Позиціонування popover під trigger коли відкриваємо. Portal до body —
  // інакше glass-card батьки з backdrop-blur роблять його «прозорим».
  // Clamp у viewport — інакше на mobile picker вилазить за правий край.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_W = 268;
    const MARGIN = 8;
    const maxLeft = window.innerWidth - POPOVER_W - MARGIN;
    const naturalLeft = rect.left + window.scrollX;
    const clampedLeft = Math.max(MARGIN, Math.min(naturalLeft, maxLeft + window.scrollX));
    setCoords({
      top: rect.bottom + window.scrollY + 8,
      left: clampedLeft,
    });
  }, [open]);

  // Закривати при кліку поза dropdown.
  // ⚠️ mousedown а не click: click+setTimeout pattern «через раз не
  // відкриває» — bubble-ing toggle button до document closing handler
  // встигав до того як setOpen(true) відрендериться. mousedown спрацьовує
  // ДО click, тому handler перевіряє ref.contains нормально.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(t);
      const insidePopover = popoverRef.current?.contains(t);
      if (!insideTrigger && !insidePopover) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Синхронізовано: коли value змінюється ззовні (інша presetтова кнопка) —
  // оновлюємо рік picker, щоб відкривши «Свій» юзер бачив актуальний рік.
  // Render-phase setState (React 19 canonical): порівнюємо prev value, оновлюємо
  // pickerYear інлайн. React оптимізує — renders without commit.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    const y = parseInt(value.slice(0, 4), 10);
    if (Number.isFinite(y)) setPickerYear(y);
  }

  const selectedMonth = parseInt(value.slice(5, 7), 10); // 1-12
  const selectedYear = parseInt(value.slice(0, 4), 10);

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1; // 1-12

  const handlePick = (monthIdx: number) => {
    const month = String(monthIdx + 1).padStart(2, '0');
    onChange(`${pickerYear}-${month}`);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
          active
            ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
      </button>

      {open && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, backgroundColor: '#ffffff' }}
          className="z-[100] w-[268px] rounded-2xl border border-slate-200 overflow-hidden shadow-[0_12px_48px_rgba(6,42,61,0.22)]"
        >
          {/* Year switcher */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e2e7ef]">
            <button
              type="button"
              onClick={() => setPickerYear(y => y - 1)}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emet-blue transition-colors"
              aria-label="Попередній рік"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[14px] font-bold text-emet-ink tabular-nums">{pickerYear}</span>
            <button
              type="button"
              onClick={() => setPickerYear(y => y + 1)}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emet-blue transition-colors"
              aria-label="Наступний рік"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Months grid 3×4 */}
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {UA_MONTHS_SHORT.map((m, idx) => {
              const isSelected = pickerYear === selectedYear && idx + 1 === selectedMonth;
              const isToday = pickerYear === todayY && idx + 1 === todayM;
              const isFuture = pickerYear > todayY || (pickerYear === todayY && idx + 1 > todayM);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={isFuture}
                  onClick={() => handlePick(idx)}
                  className={`relative h-9 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-sm'
                      : isFuture
                        ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'bg-[#f4f7fb] text-foreground hover:bg-emet-50 hover:text-emet-blue'
                  }`}
                >
                  {m}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emet-blue" />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
