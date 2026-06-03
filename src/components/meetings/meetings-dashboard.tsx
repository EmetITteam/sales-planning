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
import { ClientDossierDialog } from './client-dossier-dialog';
import { MeetingOutcomeDialog } from './meeting-outcome-dialog';
import {
  computeStats,
  groupMeetingsByDate,
  type MeetingWithSync,
  type MeetingStartPayload,
} from '@/lib/meetings/mock-data';
import { useMeetings } from '@/lib/meetings/use-meetings';
import { useMyClients } from '@/lib/use-my-clients';
import { getClientAddress } from '@/lib/mityng-types';

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

  // Dossier dialog state (Sprint 1.5+).
  const [dossierClient, setDossierClient] = useState<{ id: string; name: string; phone: string } | null>(null);

  // Outcome dialog (survey + summary) — для «Коментар» на done та після finish.
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeMeeting, setOutcomeMeeting] = useState<MeetingWithSync | null>(null);

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

  // Map клієнтів з 1С getManagerClients — для phone на картці і dossier.
  // SWR-кешований, single fetch per page.
  const { clients: myClients, loading: clientsLoading } = useMyClients();
  const clientsByID = useMemo(() => {
    const m = new Map<string, typeof myClients[number]>();
    for (const c of myClients) m.set(c.ClientID, c);
    return m;
  }, [myClients]);

  // У mock-режимі демо-зустрічі мають fake clientID (`CL-ESTET-PODOL`),
  // який 1С не знає → getClientReport падає. Як тільки real клієнти
  // менеджера завантажились — round-robin'имо їх ID у моки + підтягуємо
  // адресу клієнта з 1С щоб демо не показувало hardcoded «вул. Хорива 42»
  // для кожного клієнта. Real API режим повертає вже з реальними ID/адресами.
  const effectiveMeetings = useMemo(() => {
    if (isUsingRealApi || myClients.length === 0) return meetings;
    return meetings.map((m, i) => {
      const real = myClients[i % myClients.length];
      if (!real) return m;
      const realAddress = getClientAddress(real);
      return {
        ...m,
        clientId1c: real.ClientID,
        plannedAddress: realAddress || m.plannedAddress,
        // Якщо мок мав zafiksovanu startAddress — заміняємо на real клієнтську
        startAddress: m.startAddress && realAddress ? realAddress : m.startAddress,
      };
    });
  }, [meetings, myClients, isUsingRealApi]);

  const handleClientClick = (clientId: string, fallbackName: string, fallbackPhone: string) => {
    setDossierClient({ id: clientId, name: fallbackName, phone: fallbackPhone });
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return effectiveMeetings;
    return effectiveMeetings.filter(m => m.status === statusFilter);
  }, [effectiveMeetings, statusFilter]);

  const stats = useMemo(() => computeStats(effectiveMeetings, today), [effectiveMeetings, today]);
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
    // Persist start moment до localStorage щоб LiveTimer пережив reload
    // (поки нема `started_at` колонки у БД).
    try {
      window.localStorage.setItem(`meetingStartedAt:${id}`, new Date().toISOString());
    } catch {
      /* private mode etc — мовчки ігноруємо */
    }
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
  const handleOutcome = (m: MeetingWithSync) => {
    setOutcomeMeeting(m);
    setOutcomeOpen(true);
  };
  const handleOutcomeSaved = async ({ comment }: { comment: string }) => {
    if (!outcomeMeeting) return;
    // Зберегти comment у нашій БД через PATCH meetings (op=update)
    try {
      if (comment !== outcomeMeeting.comment) {
        await apiUpdateMeeting(outcomeMeeting.id, { comment });
      }
      pushToast('success', 'Підсумки збережено.');
    } catch (e) {
      pushToast('error', `Анкета збережена, але comment не оновлено: ${(e as Error).message}`);
    }
  };
  const handleConfirmFinish = async (id: string, payload: MeetingStartPayload) => {
    setFinishOpen(false);
    setFinishingMeeting(null);
    // Прибираємо persistent start — таймер більше не потрібен
    try {
      window.localStorage.removeItem(`meetingStartedAt:${id}`);
    } catch {
      /* ignore */
    }
    try {
      const updated = await apiFinishMeeting(id, {
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
      // Після успішного finish — одразу відкрити outcome dialog (як у meeting-4.0)
      if (updated) {
        setOutcomeMeeting(updated);
        setOutcomeOpen(true);
      }
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

      {/* KPI віджети тільки у real-API режимі. У демо вони рахуються
          з 9 моків + замапованих клієнтів і вводять в оману (показують
          типу «6 сьогодні» хоча це 6 mock-stub'ів). */}
      {isUsingRealApi ? (
        <MeetingsWidgets stats={stats} />
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5 flex items-start gap-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <div className="text-[12px] text-amber-900 leading-snug">
            <strong>Демо-режим.</strong> Показуємо 9 прикладів зустрічей з іменами і телефонами ваших справжніх клієнтів. KPI-віджети тимчасово приховані, бо рахували б числа з моків. Реальна синхронізація з 1С — після ввімкнення buffer-sync workera (Sprint 1.5.3).
          </div>
        </div>
      )}
      <MeetingsFilters value={statusFilter} onChange={setStatusFilter} />

      {/* Day groups */}
      {(loading && meetings.length === 0) || (!isUsingRealApi && clientsLoading && myClients.length === 0) ? (
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
              onOutcomeMeeting={handleOutcome}
              clientsByID={clientsByID}
              onClientClick={handleClientClick}
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

      <ClientDossierDialog
        open={dossierClient !== null}
        clientId={dossierClient?.id ?? null}
        clientNameFallback={dossierClient?.name}
        phoneFallback={dossierClient?.phone}
        onClose={() => setDossierClient(null)}
      />

      <MeetingOutcomeDialog
        open={outcomeOpen}
        meeting={outcomeMeeting}
        onClose={() => setOutcomeOpen(false)}
        onSaved={handleOutcomeSaved}
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
