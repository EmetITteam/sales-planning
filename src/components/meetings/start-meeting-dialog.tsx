/**
 * StartMeetingDialog — flow «Розпочати зустріч» з геокаптюром (Sprint 1.4).
 *
 * Стан-машина:
 *  - `capturing` — браузер показує permission prompt, ми чекаємо. Spinner.
 *  - `captured`  — координати отримано. Show preview + Підтвердити.
 *  - `failed`    — geo не вдалось. Show error message + manual address input.
 *
 * ADR-7: після `captured` адреса/lat/lon read-only — не редагуються.
 *        У `failed`-режимі address вводиться вручну, geoManual=true.
 *
 * Sprint 1.5: payload піде у buffer-write через Supabase. Зараз dashboard
 * мутує local state через `applyStart`.
 */

'use client';

import { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, MapPinIcon, AlertTriangleIcon, CheckIcon, Loader2Icon } from 'lucide-react';
import type { MeetingWithSync, MeetingStartPayload } from '@/lib/meetings/mock-data';
import { MOCK_CLIENT_NAMES } from '@/lib/meetings/mock-data';
import { captureGeo, type GeoCaptureResult } from '@/lib/meetings/geo';

type Phase = 'capturing' | 'captured' | 'failed';

interface Props {
  open: boolean;
  meeting: MeetingWithSync | null;
  onClose: () => void;
  onConfirm: (meetingId: string, payload: MeetingStartPayload) => void;
}

export function StartMeetingDialog({ open, meeting, onClose, onConfirm }: Props) {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [geo, setGeo] = useState<GeoCaptureResult | null>(null);
  const [manualAddress, setManualAddress] = useState('');

  // Запускаємо capture одразу як dialog відкрився (нова зустріч → новий запит)
  useEffect(() => {
    if (!open || !meeting) return;
    setPhase('capturing');
    setGeo(null);
    setManualAddress(meeting.plannedAddress ?? '');
    let cancelled = false;
    captureGeo().then(result => {
      if (cancelled) return;
      setGeo(result);
      setPhase(result.ok ? 'captured' : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [open, meeting]);

  if (!meeting) return null;
  const clientName = MOCK_CLIENT_NAMES[meeting.clientId1c] ?? meeting.clientId1c;

  const canConfirm =
    (phase === 'captured' && geo?.ok) ||
    (phase === 'failed' && manualAddress.trim().length > 0);

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (phase === 'captured' && geo?.ok) {
      onConfirm(meeting.id, {
        address: geo.address,
        lat: geo.lat,
        lon: geo.lon,
        geoManual: false,
      });
    } else if (phase === 'failed') {
      onConfirm(meeting.id, {
        address: manualAddress.trim(),
        lat: null,
        lon: null,
        geoManual: true,
      });
    }
  };

  const handleRetry = () => {
    setPhase('capturing');
    setGeo(null);
    captureGeo().then(result => {
      setGeo(result);
      setPhase(result.ok ? 'captured' : 'failed');
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-50 bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:max-h-[88vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[520px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
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
              Початок зустрічі
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            {/* Recap зустрічі */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex flex-col gap-1">
              <div className="text-[15px] font-bold text-emet-ink leading-tight">
                {clientName}
              </div>
              <div className="text-[12px] text-slate-500 inline-flex items-center gap-2">
                <span className="font-mono font-semibold text-emet-ink">
                  {meeting.time.slice(0, 5)}
                </span>
                {meeting.purpose && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{meeting.purpose}</span>
                  </>
                )}
              </div>
            </div>

            {/* Phase block */}
            {phase === 'capturing' && <CapturingBlock />}
            {phase === 'captured' && geo?.ok && <CapturedBlock geo={geo} />}
            {phase === 'failed' && !geo?.ok && (
              <FailedBlock
                message={geo?.ok ? '' : geo?.message ?? 'Невідома помилка'}
                address={manualAddress}
                onAddressChange={setManualAddress}
                onRetry={handleRetry}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2.5 px-5 py-3.5 md:px-6 md:py-4 border-t border-slate-100 shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[14px] font-bold hover:bg-slate-200 active:translate-y-px transition-all"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center justify-center gap-2"
            >
              <CheckIcon className="w-4 h-4" />
              Розпочати
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ============================================================================
// Phase blocks
// ============================================================================

function CapturingBlock() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="w-14 h-14 rounded-full bg-emet-blue/10 inline-flex items-center justify-center">
        <Loader2Icon className="w-7 h-7 text-emet-blue animate-spin" />
      </div>
      <div className="text-center">
        <div className="text-[14px] font-bold text-emet-ink">
          Фіксую геолокацію…
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          Дозвольте доступ до GPS у браузері
        </div>
      </div>
    </div>
  );
}

function CapturedBlock({
  geo,
}: {
  geo: Extract<GeoCaptureResult, { ok: true }>;
}) {
  return (
    <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3.5 flex flex-col gap-2">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.6px] text-teal-700">
        <CheckIcon className="w-3.5 h-3.5" />
        Локацію зафіксовано
      </div>
      <div className="inline-flex items-start gap-2 text-[14px] font-semibold text-emet-ink leading-tight">
        <MapPinIcon className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
        <span>{geo.address}</span>
      </div>
      <div className="text-[11px] text-slate-500 font-mono tracking-tight">
        точність ±{Math.round(geo.accuracyMeters)} м
      </div>
      <div className="text-[11px] text-slate-500">
        Після підтвердження координати стануть read-only (не можна редагувати).
      </div>
    </div>
  );
}

function FailedBlock({
  message,
  address,
  onAddressChange,
  onRetry,
}: {
  message: string;
  address: string;
  onAddressChange: (v: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <AlertTriangleIcon className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[12px] font-bold text-rose-700">
            Не вдалось зафіксувати GPS
          </div>
          <div className="text-[12px] text-slate-600 leading-snug">{message}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
          Адреса вручну
          <span className="text-emet-blue ml-0.5">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={e => onAddressChange(e.target.value)}
          placeholder="вул. Хорива 42, Київ"
          className="w-full font-sans text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] focus:bg-white transition-all placeholder:text-slate-400"
          autoFocus
        />
        <span className="text-[11px] text-slate-500">
          Без координат — буде позначено як «введено вручну».
        </span>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="self-start text-[12px] font-semibold text-emet-blue hover:underline"
      >
        Спробувати GPS ще раз
      </button>
    </div>
  );
}
