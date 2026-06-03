/**
 * MeetingsFilters — pill-фільтри над списком зустрічей (Sprint 1.2).
 *
 * Поки контрольовані станом сторінки; майбутні фільтри (клієнт, бренд, мета)
 * додаємо як окремі компоненти-dropdown.
 */

'use client';

import { useState } from 'react';

export type StatusFilter = 'all' | 'planned' | 'in_progress' | 'done' | 'postponed';

interface Props {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}

const PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Усі' },
  { value: 'planned', label: 'Заплановані' },
  { value: 'in_progress', label: 'У роботі' },
  { value: 'done', label: 'Завершені' },
  { value: 'postponed', label: 'Відкладені' },
];

export function MeetingsFilters({ value, onChange }: Props) {
  // ClientPicker + Sort filters прибрано у Sprint 1.5+: непрацюючі stub-и
  // плутали користувача. Повернуться як працюючі компоненти у Sprint 1.7.
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {PILLS.map(p => (
        <Pill key={p.value} active={p.value === value} onClick={() => onChange(p.value)}>
          {p.label}
        </Pill>
      ))}
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

/**
 * ClientPickerStub — поки заглушка з UI-натяком. Реальний `ClientPicker`
 * (з пошуком, autocomplete) — Sprint 1.3 у `crm-shared/`.
 */
function ClientPickerStub() {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Доступно у наступному спринті"
      className={`min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white/60 backdrop-blur-md border-slate-200 text-slate-700 ${hover ? 'opacity-60' : ''}`}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      Клієнт
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function SortStub() {
  return (
    <button
      type="button"
      title="Доступно у наступному спринті"
      className="min-h-[38px] px-3.5 rounded-full border text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white/60 backdrop-blur-md border-slate-200 text-slate-700"
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 6h18" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
      Сортувати
    </button>
  );
}
