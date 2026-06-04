/**
 * MeetingsFilters — pill-фільтри над списком зустрічей.
 *
 * Status pills (Усі / Заплановані / У роботі / Завершені / Відкладені) +
 * пошук по клієнту + сортування. Клієнт-фільтр відкриває ClientPickerDialog
 * і повертає clientId1c. Сортування — toggle часу asc/desc.
 */

'use client';

import { useState } from 'react';
import { X, Calendar, Search, ChevronDown } from 'lucide-react';
import { DATE_PRESET_LABELS, type DatePreset } from '@/lib/meetings/date-presets';

export type StatusFilter = 'all' | 'planned' | 'in_progress' | 'done' | 'postponed';

interface Props {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  datePreset: DatePreset;
  onDatePresetChange: (next: DatePreset) => void;
  search: string;
  onSearchChange: (next: string) => void;
}

const PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Усі' },
  { value: 'planned', label: 'Заплановані' },
  { value: 'in_progress', label: 'У роботі' },
  { value: 'done', label: 'Завершені' },
  { value: 'postponed', label: 'Відкладені' },
];

export function MeetingsFilters({
  value,
  onChange,
  datePreset,
  onDatePresetChange,
  search,
  onSearchChange,
}: Props) {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 mb-5">
      {/* Row 1: Search input (full-width) — як у meeting-app пошук
          одночасно по клієнту і зустрічі. */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Пошук клієнта або зустрічі..."
          className="w-full text-[13px] bg-white/60 backdrop-blur-md border border-slate-200 rounded-full pl-10 pr-3.5 py-2.5 min-h-[40px] outline-none focus:border-emet-blue focus:bg-white transition-all placeholder:text-slate-400"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Очистити пошук"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-slate-100 inline-flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Row 2: chips */}
      <div className="flex flex-wrap items-center gap-2">

      {/* Date preset chip + dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPresetMenuOpen(v => !v)}
          className="min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold inline-flex items-center gap-1.5 bg-emet-blue/10 border-emet-blue/40 text-emet-blue hover:bg-emet-blue/15 transition-all"
        >
          <Calendar className="w-3.5 h-3.5" />
          {DATE_PRESET_LABELS[datePreset]}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {presetMenuOpen && (
          <>
            {/* click-outside backdrop */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setPresetMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute z-40 mt-1 left-0 bg-white rounded-xl border border-slate-200 shadow-[0_8px_24px_rgba(6,42,61,0.10)] min-w-[180px] py-1.5">
              {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p, i) => (
                <div key={p}>
                  {(i === 2 || i === 4) && <div className="my-1 border-t border-slate-100" />}
                  <button
                    type="button"
                    onClick={() => {
                      onDatePresetChange(p);
                      setPresetMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-[12px] font-semibold hover:bg-emet-blue/5 ${
                      datePreset === p ? 'text-emet-blue' : 'text-slate-700'
                    }`}
                  >
                    {DATE_PRESET_LABELS[p]}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {PILLS.map(p => (
        <Pill key={p.value} active={p.value === value} onClick={() => onChange(p.value)}>
          {p.label}
        </Pill>
      ))}

      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = active
    ? 'bg-emet-blue text-white border-emet-blue'
    : 'bg-white/60 backdrop-blur-md text-slate-700 border-slate-200 hover:bg-white hover:border-slate-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold transition-all ${cls}`}
    >
      {children}
    </button>
  );
}
