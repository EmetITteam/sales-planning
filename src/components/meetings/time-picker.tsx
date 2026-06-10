'use client';

/**
 * TimePicker — analog clock picker для вибору часу зустрічі. Material-style
 * 24-годинний з двома концентричними колами (зовнішнє: 1-12, внутрішнє:
 * 13-24/00). Стрілка вказує на обране значення, тап на цифру обирає її.
 *
 * UX:
 *  - Trigger показує `HH:MM` mono-шрифтом + іконку годинника
 *  - Клік → dropdown з clock-face (step 'hour')
 *  - Тап години → авто-перехід на step 'minute' з clock-face хвилин
 *    (0, 5, 10, ..., 55)
 *  - Тап хвилини → закриття + emit value
 *  - Кнопки у header: ‹ повернутися до годин, ✕ закрити, активне значення HH:MM
 *  - ESC / клік за межами → закрити без зміни
 */

import { useEffect, useRef, useState } from 'react';
import { Clock, ChevronLeft, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Крок хвилин (default 5). Допустимі: 1, 5, 10, 15, 30. */
  minuteStep?: 1 | 5 | 10 | 15 | 30;
}

const CLOCK_SIZE = 260;
const CENTER = CLOCK_SIZE / 2;
const OUTER_RADIUS = 100;
const INNER_RADIUS = 64;
const NUMBER_RADIUS = 16;
const MINUTE_OUTER_RADIUS = 100;
const MINUTE_NUMBER_RADIUS = 16;

export function TimePicker({
  value,
  onChange,
  className,
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

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 h-11 px-3 rounded-[10px] border border-slate-200 bg-white text-[14px] font-mono font-semibold tracking-tight text-emet-ink hover:border-emet-blue focus:border-emet-blue focus:outline-none focus:ring-2 focus:ring-emet-blue/30 transition-all"
        aria-label="Вибрати час"
      >
        <span className="tabular-nums">{displayHH}:{displayMM}</span>
        <Clock className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[300px] bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(6,42,61,0.12)] overflow-hidden">
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
              {step === 'hour' ? 'Година' : 'Хвилина'}
            </div>
            <div className="font-mono font-bold text-[16px] tabular-nums text-emet-blue">
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

          {/* Clock face */}
          <div className="p-3 flex justify-center">
            {step === 'hour' ? (
              <HourClock currentHour={hh} onPick={pickHour} />
            ) : (
              <MinuteClock currentMinute={mm} step={minuteStep} onPick={pickMinute} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * HourClock — 24-годинний циферблат. Зовнішнє коло = 1-12, внутрішнє коло
 * = 13-24 (24 показується як «00»). Стрілка вказує на обрану позицію.
 */
function HourClock({ currentHour, onPick }: { currentHour: number; onPick: (h: number) => void }) {
  // Hour → position у годинниковому колі (0-11 по 30° від 12-годинної позначки).
  // 12 і 24 (=00) знаходяться у позиції 12 (top). 1 і 13 — позиція 1, тощо.
  const positionOfHour = (h: number) => {
    if (h === 0) return 12;     // 00 = позиція 12 (нагорі), внутрішнє коло
    if (h === 12) return 12;    // 12 = позиція 12, зовнішнє коло
    return h % 12;
  };
  const isOuter = (h: number) => h >= 1 && h <= 12;

  const angleForPosition = (pos: number) =>
    ((pos === 12 ? 0 : pos) * 30 - 90) * (Math.PI / 180);

  const pointForHour = (h: number) => {
    const pos = positionOfHour(h);
    const angle = angleForPosition(pos);
    const r = isOuter(h) ? OUTER_RADIUS : INNER_RADIUS;
    return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
  };

  const handPoint = pointForHour(currentHour);

  return (
    <svg
      viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
      width={CLOCK_SIZE}
      height={CLOCK_SIZE}
      className="select-none"
    >
      {/* Фон циферблату */}
      <circle cx={CENTER} cy={CENTER} r={CLOCK_SIZE / 2 - 4} fill="#f8fafc" />

      {/* Стрілка */}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={handPoint.x}
        y2={handPoint.y}
        stroke="#066aab"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={CENTER} cy={CENTER} r="4" fill="#066aab" />
      <circle
        cx={handPoint.x}
        cy={handPoint.y}
        r={NUMBER_RADIUS + 2}
        fill="#066aab"
        opacity="0.18"
      />

      {/* Зовнішнє коло: години 1-12 */}
      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
        const pos = positionOfHour(h);
        const angle = angleForPosition(pos);
        const x = CENTER + OUTER_RADIUS * Math.cos(angle);
        const y = CENTER + OUTER_RADIUS * Math.sin(angle);
        const isSelected = h === currentHour;
        return (
          <g key={`out-${h}`} onClick={() => onPick(h)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={NUMBER_RADIUS}
              fill={isSelected ? '#066aab' : 'transparent'}
              className={isSelected ? '' : 'hover:fill-emet-blue/10'}
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-monospace, monospace"
              fontSize="14"
              fontWeight="600"
              fill={isSelected ? 'white' : '#0f172a'}
              className="pointer-events-none tabular-nums"
            >
              {String(h).padStart(2, '0')}
            </text>
          </g>
        );
      })}

      {/* Внутрішнє коло: години 13-24 (24 = 00) */}
      {Array.from({ length: 12 }, (_, i) => (i + 13 > 23 ? 0 : i + 13)).map((h, i) => {
        const labelHour = i + 13 > 23 ? 0 : i + 13;
        const pos = labelHour === 0 ? 12 : labelHour - 12;
        const angle = angleForPosition(pos);
        const x = CENTER + INNER_RADIUS * Math.cos(angle);
        const y = CENTER + INNER_RADIUS * Math.sin(angle);
        const isSelected = labelHour === currentHour;
        return (
          <g key={`in-${labelHour}`} onClick={() => onPick(labelHour)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={NUMBER_RADIUS - 2}
              fill={isSelected ? '#066aab' : 'transparent'}
              className={isSelected ? '' : 'hover:fill-emet-blue/10'}
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-monospace, monospace"
              fontSize="11"
              fontWeight="600"
              fill={isSelected ? 'white' : '#475569'}
              className="pointer-events-none tabular-nums"
            >
              {String(labelHour).padStart(2, '0')}
            </text>
            {/* Bigger invisible hit-zone */}
            <circle cx={x} cy={y} r={NUMBER_RADIUS} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * MinuteClock — циферблат хвилин (0-59, з кроком minuteStep). 12 номерних
 * позицій (00, 05, ..., 55) на колі, стрілка вказує на обране значення.
 */
function MinuteClock({
  currentMinute,
  step,
  onPick,
}: {
  currentMinute: number;
  step: number;
  onPick: (m: number) => void;
}) {
  // Завжди показуємо великі позначки кратні 5 (12 на колі) — це Material-style.
  // Якщо step менший — додатково обробляємо тапи у проміжках через хіт-зоны.
  const labels = Array.from({ length: 12 }, (_, i) => i * 5);
  const angleForMinute = (m: number) => ((m / 60) * 360 - 90) * (Math.PI / 180);

  const handAngle = angleForMinute(currentMinute);
  const handX = CENTER + MINUTE_OUTER_RADIUS * Math.cos(handAngle);
  const handY = CENTER + MINUTE_OUTER_RADIUS * Math.sin(handAngle);

  return (
    <svg
      viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
      width={CLOCK_SIZE}
      height={CLOCK_SIZE}
      className="select-none"
    >
      <circle cx={CENTER} cy={CENTER} r={CLOCK_SIZE / 2 - 4} fill="#f8fafc" />

      {/* Стрілка */}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={handX}
        y2={handY}
        stroke="#066aab"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={CENTER} cy={CENTER} r="4" fill="#066aab" />
      <circle
        cx={handX}
        cy={handY}
        r={MINUTE_NUMBER_RADIUS + 2}
        fill="#066aab"
        opacity="0.18"
      />

      {/* Дрібні точки кратні step між великими 5-хвилинними позначками */}
      {step < 5 &&
        Array.from({ length: 60 }, (_, i) => i)
          .filter(m => m % step === 0 && m % 5 !== 0)
          .map(m => {
            const a = angleForMinute(m);
            const x = CENTER + MINUTE_OUTER_RADIUS * Math.cos(a);
            const y = CENTER + MINUTE_OUTER_RADIUS * Math.sin(a);
            return <circle key={`dot-${m}`} cx={x} cy={y} r="1.5" fill="#cbd5e1" />;
          })}

      {/* Великі позначки 00, 05, ..., 55 */}
      {labels.map(m => {
        const a = angleForMinute(m);
        const x = CENTER + MINUTE_OUTER_RADIUS * Math.cos(a);
        const y = CENTER + MINUTE_OUTER_RADIUS * Math.sin(a);
        const isSelected = m === currentMinute;
        return (
          <g key={`min-${m}`} onClick={() => onPick(m)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={MINUTE_NUMBER_RADIUS}
              fill={isSelected ? '#066aab' : 'transparent'}
              className={isSelected ? '' : 'hover:fill-emet-blue/10'}
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-monospace, monospace"
              fontSize="14"
              fontWeight="600"
              fill={isSelected ? 'white' : '#0f172a'}
              className="pointer-events-none tabular-nums"
            >
              {String(m).padStart(2, '0')}
            </text>
          </g>
        );
      })}

      {/* Невидимий шар для тапу у будь-яку точку кола (drag-free): обчислюємо
          angle від center і знаходимо найближче кратне step. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={CLOCK_SIZE / 2 - 8}
        fill="transparent"
        onClick={e => {
          const rect = (e.target as SVGCircleElement).getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          // 0° = top → +90° clockwise. atan2(dy, dx) дає кут від +X (праворуч).
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          if (deg < 0) deg += 360;
          const rawMin = Math.round((deg / 360) * 60);
          const snapped = (Math.round(rawMin / step) * step) % 60;
          onPick(snapped);
        }}
      />
    </svg>
  );
}

function parseTime(s: string): [number, number] {
  if (!s) return [0, 0];
  const [h, m] = s.split(':');
  return [Number(h) || 0, Number(m) || 0];
}
