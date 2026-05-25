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
        <svg viewBox="0 0 36 36" className="w-[140px] h-[140px] flex-shrink-0">
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx="18" cy="18" r="15.92" fill="none"
              stroke={arc.color}
              strokeWidth="4"
              strokeDasharray={`${arc.pct} ${100 - arc.pct}`}
              strokeDashoffset={`-${arc.offset}`}
              transform="rotate(-90 18 18)"
            />
          ))}
          <text x="18" y="17" textAnchor="middle" style={{ fontSize: '4.6px', fontWeight: 700, fill: '#062a3d', fontFamily: 'JetBrains Mono, monospace' }}>
            {centerLabel}
          </text>
          {centerSub && (
            <text x="18" y="21.5" textAnchor="middle" style={{ fontSize: '1.7px', fill: 'rgba(6,42,61,0.58)' }}>
              {centerSub}
            </text>
          )}
        </svg>
        <div className="flex-1 flex flex-col gap-1 text-[11px] min-w-0">
          {arcs.map(arc => (
            <div key={arc.name} className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: arc.color }} />
              <span className="flex-1 text-[rgba(6,42,61,0.78)] truncate font-medium">{arc.name}</span>
              <span className="font-bold tabular-nums font-mono">{fmt(arc.value, arc.pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
