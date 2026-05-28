'use client';

/**
 * <DonutChart> — inline SVG donut + легенда збоку.
 *
 * Використання:
 *   <DonutChart
 *     title="Регіони у Представництвах"
 *     subtitle="Частка кожного у факті ($771K)"
 *     centerLabel="$771K"
 *     centerSub="факт"
 *     segments={[
 *       { name: 'Київ', value: 337696, color: '#066aab' },
 *       ...
 *     ]}
 *   />
 *
 * Сегменти автоматично нормалізуються до 100% (значення можна давати у будь-якій
 * одиниці — баксах, штуках, відсотках). Дрібні сегменти (<1.5%) показуються у легенді
 * але як одна тонка лінія у колі — щоб не зливалось.
 */

interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

interface Props {
  title: string;
  subtitle?: string;
  segments: DonutSegment[];
  /** Великий текст у центрі donut-а (наприклад $771K). */
  centerLabel: string;
  /** Маленький текст під ним (наприклад «факт»). */
  centerSub?: string;
  /** Як форматувати значення у легенді. За замовч. — відсотки. */
  formatValue?: (v: number, pct: number) => string;
}

export function DonutChart({ title, subtitle, segments, centerLabel, centerSub, formatValue }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="glass-card p-5">
        <h3 className="text-[13px] font-bold mb-1">{title}</h3>
        {subtitle && <p className="text-[10.5px] text-muted-foreground mb-3">{subtitle}</p>}
        <p className="text-[12px] text-muted-foreground text-center py-8">Немає даних</p>
      </div>
    );
  }

  // Підраховуємо % і offset для кожного сегменту.
  // Circumference = 100 (для r=15.92 dasharray розраховується як з 100% кола).
  let cumOffset = 0;
  const arcs = segments
    .filter(s => s.value > 0)
    .map(s => {
      const pct = (s.value / total) * 100;
      const arc = { ...s, pct, offset: cumOffset };
      cumOffset += pct;
      return arc;
    });

  const fmt = formatValue ?? ((_v, pct) => pct.toFixed(1) + '%');

  return (
    <div className="glass-card p-5">
      <h3 className="text-[13px] font-bold">{title}</h3>
      {subtitle && <p className="text-[10.5px] text-muted-foreground mb-3 leading-snug">{subtitle}</p>}
      <div className="flex items-center gap-4">
        <div className="relative w-[140px] h-[140px] flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full block">
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx="18" cy="18" r="15.92" fill="none"
                stroke={arc.color}
                strokeWidth="4"
                strokeDasharray={`${arc.pct} ${100 - arc.pct}`}
                strokeDashoffset={`-${arc.offset}`}
                transform="rotate(-90 18 18)"
                className="transition-all duration-500"
              />
            ))}
          </svg>
          {/* HTML overlay для центральних чисел — раніше SVG text 4.6px давав
              jitter на 140px viewport (audit findings). Тепер чітко без масштабу. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono font-bold text-[18px] leading-none text-foreground tabular-nums">
              {centerLabel}
            </span>
            {centerSub && (
              <span className="text-[10px] mt-1 text-muted-foreground uppercase tracking-wider">
                {centerSub}
              </span>
            )}
          </div>
        </div>
        {/* max-w обмежує легенду — інакше на широкій картці flex-1 розпирає
            рядок і назва/% «розлітаються» по краях. Пунктирний leader з'єднує
            їх візуально. На вузькому екрані flex-1 просто заповнює доступне. */}
        <div className="flex-1 max-w-[300px] flex flex-col gap-1.5 text-[11px] min-w-0">
          {arcs.map(arc => (
            <div key={arc.name} className="flex items-baseline gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 translate-y-[1px]" style={{ background: arc.color }} />
              <span className="text-[rgba(6,42,61,0.78)] truncate font-medium min-w-0">{arc.name}</span>
              <span aria-hidden className="flex-1 min-w-[10px] border-b border-dotted border-[rgba(6,42,61,0.28)]" />
              <span className="font-bold tabular-nums font-mono flex-shrink-0 text-foreground">{fmt(arc.value, arc.pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
