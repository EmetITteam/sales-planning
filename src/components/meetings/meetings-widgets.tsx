/**
 * MeetingsWidgets — 4 KPI картки зверху дашборду зустрічей (Sprint 1.2).
 *
 * Дизайн з v3: humanist Plus Jakarta Sans 800 для чисел (НЕ Mono), tabular-nums,
 * spec-tabular-feature. Кольорові точки у label.
 */

'use client';

import type { MeetingsStatsTotals } from '@/lib/meetings/mock-data';

interface Props {
  stats: MeetingsStatsTotals;
}

export function MeetingsWidgets({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <Widget
        color="emet-blue"
        label="Сьогодні"
        value={stats.today}
        caption={`${stats.todayInProgress} у роботі · ${stats.todayPlanned} заплановано`}
      />
      <Widget
        color="teal-700"
        label="Завершено за тиждень"
        value={stats.weekCompleted}
        caption="включно зі сьогодні"
      />
      <Widget
        color="amber-700"
        label="У роботі зараз"
        value={stats.todayInProgress}
        caption={stats.todayInProgress > 0 ? 'мерчандайз з геолокацією' : 'жодної'}
      />
      <Widget
        color="rose-700"
        label="Потребує правки"
        value={stats.needsFix}
        caption={stats.needsFix > 0 ? 'не синхр. з 1С' : 'усе синхр.'}
      />
    </div>
  );
}

interface WidgetProps {
  color: 'emet-blue' | 'teal-700' | 'amber-700' | 'rose-700';
  label: string;
  value: number;
  caption: string;
}

function Widget({ color, label, value, caption }: WidgetProps) {
  const labelColor =
    color === 'emet-blue'
      ? 'text-emet-blue'
      : color === 'teal-700'
      ? 'text-teal-700'
      : color === 'amber-700'
      ? 'text-amber-700'
      : 'text-rose-700';

  return (
    <div className="p-3.5 bg-white/55 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl shadow-[0_4px_16px_rgba(6,42,61,0.04)]">
      <div className={`text-[10px] font-bold uppercase tracking-[0.8px] mb-1.5 inline-flex items-center gap-1.5 ${labelColor}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {label}
      </div>
      <div
        className="font-sans text-[30px] font-extrabold tabular-nums leading-none text-emet-ink tracking-tighter"
        style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1, "salt" 1' }}
      >
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{caption}</div>
    </div>
  );
}
