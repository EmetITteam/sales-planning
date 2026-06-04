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
import {
  DATE_PRESET_LABELS,
  formatRangeLabel,
  type DatePreset,
  type DateRange,
} from '@/lib/meetings/date-presets';

export type StatusFilter = 'all' | 'planned' | 'in_progress' | 'done' | 'postponed';

interface Props {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  datePreset: DatePreset;
  onDatePresetChange: (next: DatePreset) => void;
  customRange: DateRange;
  onCustomRangeChange: (next: DateRange) => void;
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
  customRange,
  onCustomRangeChange,
  search,
  onSearchChange,
}: Props) {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(customRange.startDateString);
  const [draftEnd, setDraftEnd] = useState(customRange.endDateString);

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
          {datePreset === 'custom'
            ? formatRangeLabel(customRange)
            : DATE_PRESET_LABELS[datePreset]}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {presetMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setPresetMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute z-40 mt-1 left-0 bg-white rounded-xl border border-slate-200 shadow-[0_8px_24px_rgba(6,42,61,0.10)] min-w-[200px] py-1.5">
              {(['today', 'tomorrow', 'this-week', 'last-week', 'this-month', 'last-month'] as DatePreset[]).map((p, i) => (
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
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  setPresetMenuOpen(false);
                  setDraftStart(customRange.startDateString);
                  setDraftEnd(customRange.endDateString);
                  setCustomOpen(true);
                }}
                className={`w-full text-left px-3 py-2 text-[12px] font-semibold hover:bg-emet-blue/5 inline-flex items-center gap-1.5 ${
                  datePreset === 'custom' ? 'text-emet-blue' : 'text-slate-700'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Свій діапазон…
              </button>
            </div>
          </>
        )}

        {/* Custom range popover */}
        {customOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setCustomOpen(false)}
              aria-hidden
            />
            <div className="absolute z-40 mt-1 left-0 bg-white rounded-xl border border-slate-200 shadow-[0_8px_24px_rgba(6,42,61,0.10)] p-3 min-w-[260px]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Свій діапазон
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-slate-600">
                  Від
                  <input
                    type="date"
                    value={draftStart}
                    max={draftEnd}
                    onChange={e => setDraftStart(e.target.value)}
                    className="mt-1 w-full text-[13px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emet-blue"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  До
                  <input
                    type="date"
                    value={draftEnd}
                    min={draftStart}
                    onChange={e => setDraftEnd(e.target.value)}
                    className="mt-1 w-full text-[13px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emet-blue"
                  />
                </label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setCustomOpen(false)}
                    className="flex-1 min-h-[36px] px-3 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    disabled={!draftStart || !draftEnd || draftStart > draftEnd}
                    onClick={() => {
                      onCustomRangeChange({
                        startDateString: draftStart,
                        endDateString: draftEnd,
                      });
                      onDatePresetChange('custom');
                      setCustomOpen(false);
                    }}
                    className="flex-1 min-h-[36px] px-3 rounded-lg bg-emet-blue text-white text-[12px] font-bold hover:bg-emet-blue-light disabled:opacity-40"
                  >
                    Застосувати
                  </button>
                </div>
              </div>
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
