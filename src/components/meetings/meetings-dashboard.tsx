/**
 * MeetingsDashboard — головна сторінка /meetings (Sprint 1.2).
 *
 * Skeleton на mock-даних (`src/lib/meetings/mock-data.ts`). Реальний sync
 * через Supabase + 1С buffer-worker додаємо у Sprint 1.5.
 *
 * Layout повторює `public/design-meetings-dashboard-v3.html` (locked 2026-06-02):
 *  - page title (icon + h1 + subtitle)
 *  - widgets row (4 KPI)
 *  - filters pills row
 *  - day-groups (cards inside each)
 */

'use client';

import { useState, useMemo } from 'react';
import { MeetingsWidgets } from './meetings-widgets';
import { MeetingsFilters, type StatusFilter } from './meetings-filters';
import { DayGroup } from './day-group';
import { MeetingForm, type MeetingFormMode, type MeetingFormData } from './meeting-form';
import {
  getMockMeetings,
  computeStats,
  groupMeetingsByDate,
  type MeetingWithSync,
} from '@/lib/meetings/mock-data';

export function MeetingsDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Form state — single instance shared across all cards + header create button.
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<MeetingFormMode>('create');
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithSync | undefined>();

  // Mock today (stable for render). У Sprint 1.5 → реальний now() з можливістю
  // «снапшот на дату» через PeriodFilter.
  const today = useMemo(() => new Date(), []);
  const all = useMemo(() => getMockMeetings(), []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return all;
    return all.filter(m => m.status === statusFilter);
  }, [all, statusFilter]);

  const stats = useMemo(() => computeStats(all, today), [all, today]);
  const groups = useMemo(() => groupMeetingsByDate(filtered), [filtered]);

  const handleCreate = () => {
    setEditingMeeting(undefined);
    setFormMode('create');
    setFormOpen(true);
  };
  const handleEdit = (m: MeetingWithSync) => {
    setEditingMeeting(m);
    setFormMode('edit');
    setFormOpen(true);
  };
  const handleSave = (data: MeetingFormData) => {
    // Sprint 1.5: реальний buffer-write через Supabase + cron-worker.
    // Поки логуємо у консоль і закриваємо форму — UI-демо.
    console.log('[MeetingForm save]', { mode: formMode, data, editingId: editingMeeting?.id });
    setFormOpen(false);
  };

  return (
    <div className="space-y-1">
      {/* Page title + Create button */}
      <div className="flex items-center gap-3.5 mb-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white inline-flex items-center justify-center shadow-[0_6px_16px_rgba(6,106,171,0.2)] shrink-0">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold text-emet-ink tracking-tight leading-tight">
            Мої зустрічі
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">
            {stats.total} на тиждень · {stats.today} сьогодні
            {stats.todayInProgress > 0 ? ` · ${stats.todayInProgress} у роботі` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.3)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.4)] active:translate-y-px transition-all shrink-0"
          aria-label="Нова зустріч"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span className="max-sm:hidden">Нова зустріч</span>
        </button>
      </div>

      <MeetingsWidgets stats={stats} />
      <MeetingsFilters value={statusFilter} onChange={setStatusFilter} />

      {/* Day groups */}
      {groups.length === 0 ? (
        <EmptyState filter={statusFilter} />
      ) : (
        <div>
          {groups.map(g => (
            <DayGroup
              key={g.date}
              date={g.date}
              meetings={g.items}
              today={today}
              onEditMeeting={handleEdit}
            />
          ))}
        </div>
      )}

      <MeetingForm
        open={formOpen}
        mode={formMode}
        initialMeeting={editingMeeting}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  const message =
    filter === 'all'
      ? 'У вас поки що нема запланованих зустрічей.'
      : 'За цим фільтром нічого не знайдено.';
  return (
    <div className="bg-white/55 backdrop-blur-xl border border-white/55 rounded-2xl p-10 text-center text-[13px] text-slate-500">
      {message}
    </div>
  );
}
