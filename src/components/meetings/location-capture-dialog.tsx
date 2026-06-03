/**
 * LocationCaptureDialog — універсальний flow геокаптюру (Sprint 1.4 + 1.5).
 *
 * Використовується і для «Розпочати», і для «Завершити» зустріч. Перевідсилаємо
 * `mode` щоб переключити title, success-message, ledger phrases. Логіка
 * захоплення координат однакова: capturing → captured ∨ failed.
 *
 * Чому єдиний компонент, а не два: state-машина, error-handling permissions,
 * manual-fallback — однакові. Дві копії = подвійна підтримка.
 *
 * ADR-7: і startLat/Lon, і endLat/Lon після підтвердження read-only. У 1С
 * передаються через відповідні actions (startMeeting / updateMeeting).
 */

'use client';

import { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  XIcon,
  MapPinIcon,
  AlertTriangleIcon,
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  LockIcon,
} from 'lucide-react';
import type { MeetingWithSync, MeetingStartPayload } from '@/lib/meetings/mock-data';
import { MOCK_CLIENT_NAMES } from '@/lib/meetings/mock-data';
import { captureGeo, getGeoPermissionState, type GeoCaptureResult } from '@/lib/meetings/geo';
import { useMyClients } from '@/lib/use-my-clients';
import { getClientName } from '@/lib/mityng-types';

export type LocationCaptureMode = 'start' | 'finish';

type Phase = 'capturing' | 'captured' | 'failed';

interface Props {
  open: boolean;
  mode: LocationCaptureMode;
  meeting: MeetingWithSync | null;
  onClose: () => void;
  onConfirm: (meetingId: string, payload: MeetingStartPayload) => void;
}

const COPY: Record<
  LocationCaptureMode,
  { title: string; primary: string; successManual: string; successGps: string; introNote: string }
> = {
  start: {
    title: 'Початок зустрічі',
    primary: 'Розпочати',
    successManual: 'Зустріч розпочато (адресу введено вручну).',
    successGps: 'Зустріч розпочато. Координати зафіксовано.',
    introNote: 'Після підтвердження адреса й координати стануть read-only.',
  },
  finish: {
    title: 'Завершення зустрічі',
    primary: 'Завершити',
    successManual: 'Зустріч завершено (адресу введено вручну).',
    successGps: 'Зустріч завершено. Координати кінця зафіксовано.',
    introNote: 'Локацію завершення фіксуємо для звіту в 1С.',
  },
};

export function LocationCaptureDialog({ open, mode, meeting, onClose, onConfirm }: Props) {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [geo, setGeo] = useState<GeoCaptureResult | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [permission, setPermission] = useState<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');

  useEffect(() => {
    if (!open || !meeting) return;
    setPhase('capturing');
    setGeo(null);
    // Префіл: для start — planned address; для finish — startAddress (більш точний бо вже зафіксовано GPS)
    setManualAddress(
      mode === 'finish' ? meeting.startAddress ?? meeting.plannedAddress ?? '' : meeting.plannedAddress ?? '',
    );
    let cancelled = false;
    Promise.all([captureGeo(), getGeoPermissionState()]).then(([result, perm]) => {
      if (cancelled) return;
      setGeo(result);
      setPermission(perm);
      setPhase(result.ok ? 'captured' : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [open, mode, meeting]);

  // useMyClients SWR-кешований — single fetch для всієї сторінки, тут безкоштовно.
  const { clients: myClients } = useMyClients();

  if (!meeting) return null;
  // Resolve order: real client name з 1С → mock-name → код-сирець як останній fallback.
  const matched = myClients.find(c => c.ClientID === meeting.clientId1c);
  const clientName = matched
    ? getClientName(matched)
    : MOCK_CLIENT_NAMES[meeting.clientId1c] ?? meeting.clientId1c;
  const copy = COPY[mode];

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
    Promise.all([captureGeo(), getGeoPermissionState()]).then(([result, perm]) => {
      setGeo(result);
      setPermission(perm);
      setPhase(result.ok ? 'captured' : 'failed');
    });
  };

  const handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
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
          <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
            <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight">
              {copy.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex flex-col gap-1">
              <div className="text-[15px] font-bold text-emet-ink leading-tight">{clientName}</div>
              <div className="text-[12px] text-slate-500 inline-flex items-center gap-2">
                <span className="font-mono font-semibold text-emet-ink">{meeting.time.slice(0, 5)}</span>
                {meeting.purpose && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{meeting.purpose}</span>
                  </>
                )}
              </div>
            </div>

            {phase === 'capturing' && <CapturingBlock mode={mode} />}
            {phase === 'captured' && geo?.ok && (
              <CapturedBlock geo={geo} introNote={copy.introNote} mode={mode} />
            )}
            {phase === 'failed' && !geo?.ok && (
              <FailedBlock
                reason={geo?.ok ? 'position_unavailable' : geo?.reason ?? 'position_unavailable'}
                message={geo?.ok ? '' : geo?.message ?? 'Невідома помилка'}
                permission={permission}
                address={manualAddress}
                onAddressChange={setManualAddress}
                onRetry={handleRetry}
                onReload={handleReload}
              />
            )}
          </div>

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
              {copy.primary}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Експорт для зворотної сумісності: dashboard імпортував StartMeetingDialog. */
export function StartMeetingDialog(props: Omit<Props, 'mode'>) {
  return <LocationCaptureDialog {...props} mode="start" />;
}

export function FinishMeetingDialog(props: Omit<Props, 'mode'>) {
  return <LocationCaptureDialog {...props} mode="finish" />;
}

// === Phase blocks ===

function CapturingBlock({ mode }: { mode: LocationCaptureMode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="w-14 h-14 rounded-full bg-emet-blue/10 inline-flex items-center justify-center">
        <Loader2Icon className="w-7 h-7 text-emet-blue animate-spin" />
      </div>
      <div className="text-center">
        <div className="text-[14px] font-bold text-emet-ink">
          {mode === 'finish' ? 'Фіксую локацію завершення…' : 'Фіксую геолокацію…'}
        </div>
        <div className="text-[12px] text-slate-500 mt-1">Дозвольте доступ до GPS у браузері</div>
      </div>
    </div>
  );
}

function CapturedBlock({
  geo,
  introNote,
  mode,
}: {
  geo: Extract<GeoCaptureResult, { ok: true }>;
  introNote: string;
  mode: LocationCaptureMode;
}) {
  const label = mode === 'finish' ? 'Локацію завершення зафіксовано' : 'Локацію зафіксовано';
  return (
    <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3.5 flex flex-col gap-2">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.6px] text-teal-700">
        <CheckIcon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="inline-flex items-start gap-2 text-[14px] font-semibold text-emet-ink leading-tight">
        <MapPinIcon className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
        <span>{geo.address}</span>
      </div>
      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>точність ±{Math.round(geo.accuracyMeters)} м</span>
        {!geo.addressFromCoords && (
          <span className="font-mono tracking-tight text-slate-400">
            · {geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500">{introNote}</div>
    </div>
  );
}

function FailedBlock({
  reason,
  message,
  permission,
  address,
  onAddressChange,
  onRetry,
  onReload,
}: {
  reason: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported';
  message: string;
  permission: 'granted' | 'prompt' | 'denied' | 'unknown';
  address: string;
  onAddressChange: (v: string) => void;
  onRetry: () => void;
  onReload: () => void;
}) {
  const isHardDenied = reason === 'permission_denied' || permission === 'denied';
  const isUnsupported = reason === 'unsupported';

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <AlertTriangleIcon className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[12px] font-bold text-rose-700">
            {isHardDenied ? 'Геолокацію заблоковано у браузері' : 'Не вдалось зафіксувати GPS'}
          </div>
          <div className="text-[12px] text-slate-600 leading-snug">{message}</div>
        </div>
      </div>

      {isHardDenied && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-[12px] font-bold text-emet-ink">
            <LockIcon className="w-3.5 h-3.5 text-slate-500" />
            Як ввімкнути геолокацію
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-[12px] text-slate-700 leading-snug marker:text-slate-400 marker:font-bold">
            <li>
              Натисніть іконку <span className="font-semibold">замочка</span> або{' '}
              <span className="font-semibold">«i»</span> ліворуч від адреси сторінки
            </li>
            <li>
              У списку дозволів знайдіть <span className="font-semibold">«Місцезнаходження» / «Location»</span>
            </li>
            <li>
              Змініть на <span className="font-semibold">«Дозволити» / «Allow»</span>
            </li>
            <li>Натисніть «Перезавантажити сторінку» нижче</li>
          </ol>
          <button
            type="button"
            onClick={onReload}
            className="self-start mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emet-blue hover:underline"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
            Перезавантажити сторінку
          </button>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Або введіть адресу вручну нижче — координати не запишуться.
          </div>
        </div>
      )}

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

      {!isHardDenied && !isUnsupported && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-emet-blue hover:underline"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          Спробувати GPS ще раз
        </button>
      )}
    </div>
  );
}
