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

import { useState, useMemo, useEffect } from 'react';
import { MeetingsWidgets } from './meetings-widgets';
import { MeetingsFilters, type StatusFilter } from './meetings-filters';
import { DayGroup } from './day-group';
import { MeetingForm, type MeetingFormMode, type MeetingFormData } from './meeting-form';
import { StartMeetingDialog, FinishMeetingDialog } from './location-capture-dialog';
import {
  computeStats,
  groupMeetingsByDate,
  type MeetingWithSync,
  type MeetingStartPayload,
} from '@/lib/meetings/mock-data';
import { useMeetings } from '@/lib/meetings/use-meetings';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function MeetingsDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Form state — single instance shared across all cards + header create button.
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<MeetingFormMode>('create');
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithSync | undefined>();

  // Start / Finish meeting dialog state (Sprint 1.4 + 1.5).
  const [startOpen, setStartOpen] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState<MeetingWithSync | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishingMeeting, setFinishingMeeting] = useState<MeetingWithSync | null>(null);

  // Toast state — мінімальний host без global provider (Sprint 1.6+ — refactor).
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mock today (stable for render). У Sprint 1.6 → можливість «снапшот на дату»
  // через PeriodFilter.
  const today = useMemo(() => new Date(), []);

  // Sprint 1.5: useMeetings перемикається між моками й real API через
  // NEXT_PUBLIC_MEETINGS_USE_REAL_API='true'.
  const {
    meetings,
    loading,
    error: loadError,
    isUsingRealApi,
    createMeeting: apiCreateMeeting,
    updateMeeting: apiUpdateMeeting,
    startMeeting: apiStartMeeting,
    finishMeeting: apiFinishMeeting,
  } = useMeetings();

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return meetings;
    return meetings.filter(m => m.status === statusFilter);
  }, [meetings, statusFilter]);

  const stats = useMemo(() => computeStats(meetings, today), [meetings, today]);
  const groups = useMemo(() => groupMeetingsByDate(filtered), [filtered]);

  const pushToast = (kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, kind, message }]);
  };

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
  const handleSave = async (data: MeetingFormData) => {
    try {
      if (formMode === 'create') {
        await apiCreateMeeting({
          clientId1c: data.clientId1c,
          date: data.date,
          time: data.time,
          durationMin: data.durationMin,
          purpose: data.purpose || null,
          comment: data.comment || null,
          plannedAddress: data.plannedAddress || null,
        });
        pushToast('success', 'Зустріч створено.');
      } else if (editingMeeting) {
        await apiUpdateMeeting(editingMeeting.id, {
          clientId1c: data.clientId1c,
          date: data.date,
          time: data.time,
          durationMin: data.durationMin,
          purpose: data.purpose || null,
          comment: data.comment || null,
          plannedAddress: data.plannedAddress || null,
        });
        pushToast('success', 'Зміни збережено.');
      }
      setFormOpen(false);
    } catch (e) {
      pushToast('error', `Помилка: ${(e as Error).message}`);
    }
  };
  const handleStart = (m: MeetingWithSync) => {
    setStartingMeeting(m);
    setStartOpen(true);
  };
  const handleConfirmStart = async (id: string, payload: MeetingStartPayload) => {
    setStartOpen(false);
    setStartingMeeting(null);
    try {
      await apiStartMeeting(id, payload);
      pushToast(
        'success',
        payload.geoManual
          ? 'Зустріч розпочато (адресу введено вручну).'
          : 'Зустріч розпочато. Координати зафіксовано.',
      );
    } catch (e) {
      pushToast('error', `Не вдалось розпочати: ${(e as Error).message}`);
    }
  };
  const handleFinish = (m: MeetingWithSync) => {
    setFinishingMeeting(m);
    setFinishOpen(true);
  };
  const handleConfirmFinish = async (id: string, payload: MeetingStartPayload) => {
    setFinishOpen(false);
    setFinishingMeeting(null);
    try {
      await apiFinishMeeting(id, {
        address: payload.address,
        lat: payload.lat,
        lon: payload.lon,
        geoManual: payload.geoManual,
      });
      pushToast(
        'success',
        payload.geoManual
          ? 'Зустріч завершено (адресу введено вручну).'
          : 'Зустріч завершено. Координати зафіксовано.',
      );
    } catch (e) {
      pushToast('error', `Не вдалось завершити: ${(e as Error).message}`);
    }
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
            {!isUsingRealApi && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                демо
              </span>
            )}
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
      {loading && meetings.length === 0 ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : groups.length === 0 ? (
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
              onStartMeeting={handleStart}
              onFinishMeeting={handleFinish}
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

      <StartMeetingDialog
        open={startOpen}
        meeting={startingMeeting}
        onClose={() => setStartOpen(false)}
        onConfirm={handleConfirmStart}
      />

      <FinishMeetingDialog
        open={finishOpen}
        meeting={finishingMeeting}
        onClose={() => setFinishOpen(false)}
        onConfirm={handleConfirmFinish}
      />

      <ToastHost toasts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
    </div>
  );
}

/** Простий toast-host. Кожен toast auto-dismiss через 4с. */
function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map(t => window.setTimeout(() => onDismiss(t.id), 4000));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:max-w-[360px] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const cls =
          t.kind === 'success'
            ? 'bg-teal-600 text-white'
            : t.kind === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-emet-ink text-white';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-[13px] font-semibold shadow-[0_12px_28px_rgba(6,42,61,0.25)] ${cls}`}
          >
            {t.message}
          </div>
        );
      })}
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

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="bg-white/55 backdrop-blur-xl border border-white/55 rounded-2xl p-5 animate-pulse"
        >
          <div className="h-3 w-32 bg-slate-200 rounded mb-2.5" />
          <div className="h-4 w-52 bg-slate-200 rounded mb-1.5" />
          <div className="h-3 w-40 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
      <div className="text-[14px] font-bold text-rose-700 mb-1">Не вдалось завантажити зустрічі</div>
      <div className="text-[12px] text-slate-600">{message}</div>
    </div>
  );
}
