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
import { ClaimFormDialog } from '@/components/claims/claim-form-dialog';
import { MeetingOutcomeDialog } from './meeting-outcome-dialog';
import { RescheduleDialog, type ReschedulePayload } from './reschedule-dialog';
import {
  computeStats,
  groupMeetingsByDate,
  type MeetingWithSync,
  type MeetingStartPayload,
} from '@/lib/meetings/mock-data';
import { useMeetings } from '@/lib/meetings/use-meetings';
import { useMyClients } from '@/lib/use-my-clients';
import {
  calcDateRange,
  DATE_PRESET_LABELS,
  DEFAULT_PRESET,
  type DatePreset,
} from '@/lib/meetings/date-presets';
import { getClientName } from '@/lib/mityng-types';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function MeetingsDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [search, setSearch] = useState('');
  // Sort — завжди asc (ранні зверху). Менеджеру не критично перемикати.
  const sortDir = 'asc' as const;

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

  // Sprint 2B.C: ClaimFormDialog з prefilled клієнтом + meetingId.
  const [claimForMeeting, setClaimForMeeting] = useState<MeetingWithSync | null>(null);

  // Outcome dialog (survey + summary) — для «Коментар» на done та після finish.
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeMeeting, setOutcomeMeeting] = useState<MeetingWithSync | null>(null);

  // Reschedule dialog state.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedulingMeeting, setReschedulingMeeting] = useState<MeetingWithSync | null>(null);

  // Toast state — мінімальний host без global provider (Sprint 1.6+ — refactor).
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mock today (stable for render). У Sprint 1.6 → можливість «снапшот на дату»
  // через PeriodFilter.
  const today = useMemo(() => new Date(), []);

  // Custom range (user-обраний у calendar popover). Активний коли preset='custom'.
  const [customRange, setCustomRange] = useState(() => calcDateRange(DEFAULT_PRESET));

  // Effective range — обчислюється з preset або custom.
  const activeRange = useMemo(
    () => (datePreset === 'custom' ? customRange : calcDateRange(datePreset)),
    [datePreset, customRange],
  );

  // READ зустрічей з 1С (getInitialData) + WRITE через наш буфер у Supabase
  // → cron-worker (`/api/cron/sync-meetings`) шле у 1С через хвилину.
  const {
    meetings,
    loading,
    error: loadError,
    createMeeting: apiCreateMeeting,
    updateMeeting: apiUpdateMeeting,
    startMeeting: apiStartMeeting,
    finishMeeting: apiFinishMeeting,
    cancelMeeting: apiCancelMeeting,
  } = useMeetings(activeRange);

  // Map клієнтів з 1С getManagerClients — для phone на картці і dossier.
  const { clients: myClients } = useMyClients();
  const clientsByID = useMemo(() => {
    const m = new Map<string, typeof myClients[number]>();
    for (const c of myClients) m.set(c.ClientID, c);
    return m;
  }, [myClients]);

  const handleClientClick = (clientId: string, fallbackName: string, fallbackPhone: string) => {
    setDossierClient({ id: clientId, name: fallbackName, phone: fallbackPhone });
  };

  // Client-side date-range filter: 1С іноді повертає більше ніж запитано,
  // тому ріжемо на нашій стороні до точного діапазону. Якщо є активний search
  // — ігноруємо date filter (як у meeting-app: пошук працює по ВСІХ
  // завантажених зустрічах незалежно від обраного дня). Robust порівняння
  // через timestamp щоб не пропустити edge-формати.
  const rangeTs = useMemo(() => {
    const start = Date.parse(`${activeRange.startDateString}T00:00:00`);
    const end = Date.parse(`${activeRange.endDateString}T23:59:59`);
    return { start, end };
  }, [activeRange]);
  const filtered = useMemo(() => {
    let result = meetings;
    const q = search.trim().toLowerCase();
    if (q.length === 0) {
      result = result.filter(m => {
        const t = Date.parse(`${m.date}T00:00:00`);
        return Number.isFinite(t) && t >= rangeTs.start && t <= rangeTs.end;
      });
    }
    if (statusFilter !== 'all') result = result.filter(m => m.status === statusFilter);
    if (q.length > 0) {
      result = result.filter(m => {
        const c = clientsByID.get(m.clientId1c);
        const name = c ? getClientName(c).toLowerCase() : '';
        const phone = (c?.Phone ?? '').toLowerCase();
        const purpose = (m.purpose ?? '').toLowerCase();
        const comment = (m.comment ?? '').toLowerCase();
        const address = (m.plannedAddress ?? m.startAddress ?? '').toLowerCase();
        return (
          name.includes(q) ||
          phone.includes(q) ||
          purpose.includes(q) ||
          comment.includes(q) ||
          address.includes(q)
        );
      });
    }
    // Sort by date+time. ASC: ранні зустрічі першими. DESC: пізні першими.
    result = [...result].sort((a, b) => {
      const ak = `${a.date}T${a.time}`;
      const bk = `${b.date}T${b.time}`;
      return sortDir === 'asc' ? ak.localeCompare(bk) : bk.localeCompare(ak);
    });
    return result;
  }, [meetings, statusFilter, search, clientsByID, rangeTs]);

  const stats = useMemo(() => computeStats(meetings, today, rangeTs), [meetings, today, rangeTs]);
  const groups = useMemo(() => groupMeetingsByDate(filtered, sortDir), [filtered, sortDir]);

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
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          date: data.date,
          time: data.time,
          durationMin: data.durationMin,
          purpose: data.purpose || null,
          comment: data.comment || null,
          plannedAddress: data.plannedAddress || null,
        });
        pushToast('success', 'Зустріч створено.');
      } else if (editingMeeting) {
        // Якщо змінився клієнт — додаємо snapshot fields щоб name/phone у БД
        // теж оновились (інакше залишиться старе ім'я).
        const clientChanged = data.clientId1c !== editingMeeting.clientId1c;
        await apiUpdateMeeting(editingMeeting.id, {
          clientId1c: data.clientId1c,
          ...(clientChanged && {
            clientName: data.clientName,
            clientPhone: data.clientPhone,
          }),
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
  const handleReschedule = (m: MeetingWithSync) => {
    setReschedulingMeeting(m);
    setRescheduleOpen(true);
  };
  const handleConfirmReschedule = async (id: string, payload: ReschedulePayload) => {
    setRescheduleOpen(false);
    setReschedulingMeeting(null);
    try {
      await apiUpdateMeeting(id, {
        date: payload.date,
        time: payload.time,
        comment: payload.comment,
        status: 'planned',
      });
      pushToast('success', 'Зустріч перенесено.');
    } catch (e) {
      pushToast('error', `Не вдалось перенести: ${(e as Error).message}`);
    }
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
            Зустрічі
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">
            {stats.total} у списку
            {stats.today > 0 ? ` · ${stats.today} сьогодні` : ''}
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

      <MeetingsWidgets stats={stats} periodLabel={DATE_PRESET_LABELS[datePreset]} />
      <MeetingsFilters
        value={statusFilter}
        onChange={setStatusFilter}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        search={search}
        onSearchChange={setSearch}
      />

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
              onRescheduleMeeting={handleReschedule}
              onOutcomeMeeting={handleOutcome}
              clientsByID={clientsByID}
              onClientClick={handleClientClick}
              onCreateClaim={m => setClaimForMeeting(m)}
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
        onCancelMeeting={async (id) => {
          await apiCancelMeeting(id);
        }}
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

      <RescheduleDialog
        open={rescheduleOpen}
        meeting={reschedulingMeeting}
        onClose={() => setRescheduleOpen(false)}
        onConfirm={handleConfirmReschedule}
      />

      {/* Sprint 2B.C: Подати претензію з картки зустрічі. Prefilled клієнт +
          ID зустрічі (зараз у details як `[Sales-Planning meeting: ${id}]`). */}
      <ClaimFormDialog
        open={claimForMeeting !== null}
        onClose={() => setClaimForMeeting(null)}
        prefilledClient={
          claimForMeeting
            ? (() => {
                const c = clientsByID.get(claimForMeeting.clientId1c);
                const name = c
                  ? getClientName(c)
                  : claimForMeeting.clientNameFromOneC
                    || claimForMeeting.clientId1c;
                const phone = c?.Phone ?? claimForMeeting.clientPhoneFromOneC ?? '';
                return {
                  clientId1c: claimForMeeting.clientId1c,
                  clientName: name,
                  phone,
                  address: claimForMeeting.plannedAddress ?? '',
                };
              })()
            : null
        }
        prefilledMeetingId={claimForMeeting?.id ?? null}
        onCreated={id => {
          pushToast('success', `Рекламацію №${id} створено`);
        }}
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
  // Один центральний spinner — раніше було 3 skeleton-картки з сірими барами,
  // які на мобільному виглядали як «квадратики» без сенсу. Просто spinner з
  // підказкою — чистіше і менш візуально нав'язливо.
  return (
    <div className="bg-white/55 backdrop-blur-xl border border-white/55 rounded-2xl p-10 flex flex-col items-center justify-center gap-3">
      <svg className="h-6 w-6 animate-spin text-emet-blue" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-[12px] text-muted-foreground">Завантажую зустрічі…</p>
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
