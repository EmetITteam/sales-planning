/**
 * MeetingsFilters — pill-фільтри над списком зустрічей.
 *
 * Status pills (Усі / Заплановані / У роботі / Завершені / Відкладені) +
 * пошук по клієнту + сортування. Клієнт-фільтр відкриває ClientPickerDialog
 * і повертає clientId1c. Сортування — toggle часу asc/desc.
 */

'use client';

import { useState } from 'react';
import { ArrowUpDown, Users, X } from 'lucide-react';
import { ClientPickerDialog } from './client-picker-dialog';

export type StatusFilter = 'all' | 'planned' | 'in_progress' | 'done' | 'postponed';
export type SortDir = 'asc' | 'desc';

interface Props {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  clientFilter: { id: string; name: string } | null;
  onClientFilterChange: (next: { id: string; name: string } | null) => void;
  sortDir: SortDir;
  onSortDirChange: (next: SortDir) => void;
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
  clientFilter,
  onClientFilterChange,
  sortDir,
  onSortDirChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {PILLS.map(p => (
        <Pill key={p.value} active={p.value === value} onClick={() => onChange(p.value)}>
          {p.label}
        </Pill>
      ))}

      <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

      {/* Client filter */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={`min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all ${
          clientFilter
            ? 'bg-emet-blue/10 border-emet-blue/40 text-emet-blue'
            : 'bg-white/60 backdrop-blur-md border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
        }`}
      >
        <Users className="w-3.5 h-3.5" />
        {clientFilter ? (
          <span className="max-w-[140px] truncate">{clientFilter.name}</span>
        ) : (
          'Клієнт'
        )}
        {clientFilter && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Прибрати фільтр"
            onClick={e => {
              e.stopPropagation();
              onClientFilterChange(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onClientFilterChange(null);
              }
            }}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-emet-blue/20 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Sort toggle */}
      <button
        type="button"
        onClick={() => onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
        title={sortDir === 'asc' ? 'Спочатку ранні' : 'Спочатку пізні'}
        className="min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white/60 backdrop-blur-md border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 transition-all"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        {sortDir === 'asc' ? 'Час ↑' : 'Час ↓'}
      </button>

      <ClientPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedClientId={clientFilter?.id}
        onSelect={picked => {
          onClientFilterChange({ id: picked.clientId1c, name: picked.clientName });
          setPickerOpen(false);
        }}
      />
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
