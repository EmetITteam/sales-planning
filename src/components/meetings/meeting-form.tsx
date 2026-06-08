/**
 * MeetingForm — створення / редагування зустрічі (Sprint 1.3).
 *
 * Locked Variant A design (`public/design-meetings-form.html`):
 *  - Mobile (max-md): bottom-sheet з grabber-handle, slide-up
 *  - Desktop (md+):   centered modal-card max-width 560px
 *
 * Поля (за meeting-4.0 + наша оптимізація):
 *  - Клієнт (поки stub — ClientPicker primitive у Sprint 1.x)
 *  - Дата + Час
 *  - Мета візиту (select)
 *  - Адреса (text)
 *  - Коментар (textarea)
 *
 * Geo readout (ADR-7): показуємо тільки в edit-режимі якщо є зафіксовано GPS.
 *
 * Save handler поки логує — реальний buffer-write через Supabase + 1С queue
 * у Sprint 1.5.
 */

'use client';

import { useState, useEffect } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, AlertTriangleIcon } from 'lucide-react';
import type { MeetingWithSync } from '@/lib/meetings/mock-data';
import { MOCK_CLIENT_NAMES } from '@/lib/meetings/mock-data';
import { MEETING_PURPOSES } from '@/lib/meetings/purposes';
import { useMeetingPurposes } from '@/lib/meetings/use-meeting-purposes';
import { ClientPickerDialog } from './client-picker-dialog';
import { useMyClients } from '@/lib/use-my-clients';
import { getClientName } from '@/lib/mityng-types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export type MeetingFormMode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: MeetingFormMode;
  /** Якщо edit — передаємо існуючу зустріч щоб префілнути. */
  initialMeeting?: MeetingWithSync;
  /** Якщо create і викликано з /clients — clientId1c одразу префіл'ений. */
  prefilledClientId?: string;
  /** Якщо create і викликано з /planning — дата плану (YYYY-MM-DD). */
  prefilledDate?: string;
  onClose: () => void;
  onSave: (data: MeetingFormData) => void;
  /** Edit-mode-only: скасувати зустріч (status='cancelled'). API готовий
   *  (PATCH /api/meetings/[id] op='cancel'). Якщо не передано — кнопка не
   *  показується. Показуємо лише для planned/postponed. */
  onCancelMeeting?: (id: string) => void;
}

export interface MeetingFormData {
  clientId1c: string;
  /** Display name + телефон передаємо щоб 1С не падало на «Поле объекта не
   *  обнаружено (Phone/Client)» у saveNewMeeting. У БД не зберігаємо. */
  clientName: string;
  clientPhone: string;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  durationMin: number | null;
  purpose: string;
  plannedAddress: string;
  comment: string;
}

// PURPOSES тягнуться з 1С через useMeetingPurposes() (action getInitialData).
// Fallback на src/lib/meetings/purposes.ts якщо 1С не відповів — щоб форма
// ніколи не була без переліку цілей. MEETING_PURPOSES import лишаємо щоб
// бекап-список був явним у залежностях.
const _FALLBACK_PURPOSES = MEETING_PURPOSES;

const DURATIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 хвилин' },
  { value: 45, label: '45 хвилин' },
  { value: 60, label: '60 хвилин' },
  { value: 90, label: '90 хвилин' },
];

/** Default-стан для нової зустрічі: сьогодні, найближча кругла година. */
function getCreateDefaults(): MeetingFormData {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  // Округлюємо до наступних 30 хвилин від поточного часу
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const time = now.toTimeString().slice(0, 5);
  return {
    clientId1c: '',
    clientName: '',
    clientPhone: '',
    date,
    time,
    durationMin: 45,
    purpose: '',
    plannedAddress: '',
    comment: '',
  };
}

function meetingToFormData(m: MeetingWithSync): MeetingFormData {
  return {
    clientId1c: m.clientId1c,
    // У edit-mode беремо з 1С-snapshot fields (адаптер заповнює) — інакше
    // якщо клієнт не у getManagerClients-кеші, при save phone/client стерлись би.
    clientName: m.clientNameFromOneC ?? '',
    clientPhone: m.clientPhoneFromOneC ?? '',
    date: m.date,
    time: m.time.slice(0, 5),
    durationMin: m.durationMin,
    purpose: m.purpose ?? '',
    plannedAddress: m.plannedAddress ?? '',
    comment: m.comment ?? '',
  };
}

export function MeetingForm({ open, mode, initialMeeting, prefilledClientId, prefilledDate, onClose, onSave, onCancelMeeting }: Props) {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const canCancel =
    mode === 'edit' &&
    initialMeeting &&
    onCancelMeeting &&
    (initialMeeting.status === 'planned' || initialMeeting.status === 'postponed');
  const [form, setForm] = useState<MeetingFormData>(() => {
    if (mode === 'edit' && initialMeeting) return meetingToFormData(initialMeeting);
    const defaults = getCreateDefaults();
    if (prefilledClientId) defaults.clientId1c = prefilledClientId;
    if (prefilledDate) defaults.date = prefilledDate;
    return defaults;
  });

  // Реініціалізуємо стан при відкритті / зміні режиму
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialMeeting) {
        setForm(meetingToFormData(initialMeeting));
      } else {
        const defaults = getCreateDefaults();
        if (prefilledClientId) defaults.clientId1c = prefilledClientId;
        if (prefilledDate) defaults.date = prefilledDate;
        setForm(defaults);
      }
    }
  }, [open, mode, initialMeeting, prefilledClientId, prefilledDate]);

  // Conflict check: debounced запит до /api/meetings/check-conflict коли
  // дата/час/тривалість змінюються. Показує warning якщо overlap з іншою
  // зустріччю цього менеджера (planned/in_progress).
  const [conflicts, setConflicts] = useState<Array<{ id: string; time: string; clientName: string }>>([]);
  useEffect(() => {
    if (!open) {
      setConflicts([]);
      return;
    }
    if (!form.date || !form.time) return;
    const handle = setTimeout(async () => {
      try {
        const r = await fetch('/api/meetings/check-conflict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            date: form.date,
            time: form.time,
            durationMin: form.durationMin,
            excludeId: mode === 'edit' && initialMeeting ? initialMeeting.id : undefined,
          }),
        });
        if (!r.ok) return;
        const body = await r.json();
        setConflicts(body.conflicts ?? []);
      } catch {
        // silent — це попередження, не критичне
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [open, form.date, form.time, form.durationMin, mode, initialMeeting]);

  // Цілі візиту з 1С (з fallback на hardcoded список).
  const { purposes: PURPOSES } = useMeetingPurposes();

  const [saving, setSaving] = useState(false);
  const canSave =
    !saving &&
    form.clientId1c.trim().length > 0 &&
    form.date.length === 10 &&
    form.time.length === 5 &&
    form.purpose.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave(form));
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'create' ? 'Нова зустріч' : 'Редагувати зустріч';
  const saveLabel = mode === 'create' ? 'Зберегти' : 'Зберегти зміни';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-50 bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:max-h-[88vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[560px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
            data-ending-style:opacity-0 max-md:data-ending-style:translate-y-full md:data-ending-style:scale-95
            data-starting-style:opacity-0 max-md:data-starting-style:translate-y-full md:data-starting-style:scale-95
            transition-all duration-200
          "
        >
          {/* Mobile grabber */}
          <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
            <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            {/* Client */}
            <ClientField
              clientId1c={form.clientId1c}
              fallbackName={form.clientName}
              fallbackPhone={form.clientPhone}
              onChange={picked => setForm(f => ({
                ...f,
                clientId1c: picked.id,
                clientName: picked.name,
                clientPhone: picked.phone,
              }))}
            />

            {/* Date + Time row */}
            <div className="grid grid-cols-1 max-[480px]:grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="Дата" required>
                <input
                  type="date"
                  className={INPUT_CLS}
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </FormGroup>
              <FormGroup label="Час" required>
                <input
                  type="time"
                  className={`${INPUT_CLS} font-mono font-semibold tracking-tight`}
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                />
              </FormGroup>
            </div>

            {/* Conflict warning — не блокує save, soft popereджage */}
            {conflicts.length > 0 && (
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
                <p className="font-bold mb-0.5 inline-flex items-center gap-1.5">
                  <AlertTriangleIcon className="w-3.5 h-3.5" />
                  На цей час уже {conflicts.length === 1 ? 'є зустріч' : `є ${conflicts.length} зустрічі`}:
                </p>
                <ul className="space-y-0.5">
                  {conflicts.map(c => (
                    <li key={c.id}>
                      <span className="font-mono font-semibold">{c.time}</span>
                      {' · '}
                      {c.clientName}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-amber-700">Зберегти можна — це попередження.</p>
              </div>
            )}

            {/* Duration + Purpose row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="Тривалість" hint="оцінка">
                <div className="relative">
                  <select
                    className={`${INPUT_CLS} appearance-none pr-9 cursor-pointer`}
                    value={form.durationMin ?? 45}
                    onChange={e => setForm(f => ({ ...f, durationMin: Number(e.target.value) }))}
                  >
                    {DURATIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </div>
              </FormGroup>
              <FormGroup label="Мета візиту" required>
                <div className="relative">
                  <select
                    className={`${INPUT_CLS} appearance-none pr-9 cursor-pointer`}
                    value={form.purpose}
                    onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  >
                    <option value="">— Обрати —</option>
                    {PURPOSES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </div>
              </FormGroup>
            </div>

            {/* Address */}
            <FormGroup
              label="Запланована адреса"
              hint="буде уточнено геолокацією при старті зустрічі"
            >
              <input
                type="text"
                className={INPUT_CLS}
                value={form.plannedAddress}
                placeholder="вул. Хорива 42, Київ"
                onChange={e => setForm(f => ({ ...f, plannedAddress: e.target.value }))}
              />
            </FormGroup>

            {/* Geo readout — тільки edit + якщо зафіксовано */}
            {mode === 'edit' && initialMeeting?.startLat != null && (
              <GeoReadout meeting={initialMeeting} />
            )}

            {/* Comment */}
            <FormGroup label="Коментар" hint="опційно">
              <textarea
                className={`${INPUT_CLS} min-h-[84px] resize-y leading-relaxed`}
                value={form.comment}
                placeholder="Контекст, нюанси, що нагадати про зустріч…"
                onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              />
            </FormGroup>
          </div>

          {/* «Скасувати зустріч» — small text-link над footer-ом для edit
              planned/postponed. Окремий блок щоб не плутати з footer-кнопкою
              «Закрити» (та просто закриває діалог без змін). */}
          {canCancel && (
            <div className="px-5 md:px-6 pt-2 pb-1 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(true)}
                className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 hover:underline underline-offset-2"
              >
                Скасувати цю зустріч
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2.5 px-5 py-3.5 md:px-6 md:py-4 border-t border-slate-100 shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[14px] font-bold hover:bg-slate-200 active:translate-y-px transition-all"
            >
              Закрити
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center justify-center gap-2"
            >
              <CheckIcon />
              {saveLabel}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>

      {/* Confirm для «Скасувати зустріч» (status='cancelled'). */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Скасувати зустріч?"
        description={
          initialMeeting
            ? `Зустріч буде позначена як «Скасована». Дію можна відмінити, повернувши статус через «Перенести».`
            : ''
        }
        confirmLabel="Так, скасувати"
        cancelLabel="Ні"
        variant="danger"
        onConfirm={() => {
          if (initialMeeting && onCancelMeeting) {
            onCancelMeeting(initialMeeting.id);
          }
          setCancelConfirmOpen(false);
          onClose();
        }}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </DialogPrimitive.Root>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

const INPUT_CLS =
  'w-full font-sans text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] focus:bg-white transition-all placeholder:text-slate-400';

function FormGroup({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
        {label}
        {required && <span className="text-emet-blue ml-0.5">*</span>}
        {hint && (
          <span className="ml-1.5 text-[11px] font-medium normal-case tracking-normal text-slate-400">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

interface ClientFieldProps {
  clientId1c: string;
  /** Fallback display коли клієнта нема у getManagerClients-кеші — приходить
   *  з MeetingFormData (заповнено при відкритті edit з 1С-snapshot полів). */
  fallbackName?: string;
  fallbackPhone?: string;
  onChange: (picked: { id: string; name: string; phone: string }) => void;
}

function ClientField({ clientId1c, fallbackName, fallbackPhone, onChange }: ClientFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { clients } = useMyClients();

  // Fallback ланцюг:
  //  1. real client з useMyClients
  //  2. fallback з props (1С-snapshot через meetingToFormData)
  //  3. MOCK_CLIENT_NAMES (dev)
  //  4. null
  const matched = clients.find(c => c.ClientID === clientId1c);
  const selectedName = matched
    ? getClientName(matched)
    : fallbackName
      || (clientId1c ? MOCK_CLIENT_NAMES[clientId1c] : null)
      || null;
  const selectedPhone = matched?.Phone ?? fallbackPhone ?? '';

  return (
    <>
      <FormGroup label="Клієнт" required>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-white/85 border border-slate-200 rounded-[10px] p-2.5 flex items-center gap-2.5 min-h-[56px] hover:border-emet-blue transition-colors text-left w-full"
        >
          <div className="w-9 h-9 rounded-lg bg-emet-blue/10 text-emet-blue inline-flex items-center justify-center text-[11px] font-bold shrink-0">
            {selectedName ? selectedName.slice(0, 2).toUpperCase() : '—'}
          </div>
          <div className="flex-1 min-w-0">
            {selectedName ? (
              <>
                <div className="text-[14px] font-semibold text-emet-ink leading-tight truncate">
                  {selectedName}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {selectedPhone || `Код 1С: ${clientId1c}`}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-slate-400">Обрати клієнта…</div>
            )}
          </div>
          <span className="text-[12px] font-semibold text-emet-blue shrink-0">
            {clientId1c ? 'Змінити' : 'Обрати'}
          </span>
        </button>
      </FormGroup>

      <ClientPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedClientId={clientId1c}
        onSelect={picked => {
          onChange({
            id: picked.clientId1c,
            name: picked.clientName,
            phone: picked.phone,
          });
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function GeoReadout({ meeting }: { meeting: MeetingWithSync }) {
  return (
    <FormGroup label="Фактичне місце початку" hint="read-only, зафіксовано GPS">
      <div className="bg-teal-50 border border-teal-100 rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-teal-700 inline-flex items-center gap-2">
          <CheckIcon className="w-3 h-3" />
          Локація зафіксована
        </div>
        <div className="text-[13px] font-semibold text-emet-ink">
          {meeting.startAddress}
        </div>
        <div className="text-[11px] text-slate-500 font-mono tracking-tight">
          {meeting.startLat?.toFixed(6)}, {meeting.startLon?.toFixed(6)}
        </div>
        <div className="text-[11px] text-slate-500">
          Зафіксовано {meeting.updatedAt.slice(0, 10)}
        </div>
      </div>
    </FormGroup>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'w-4 h-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
