/**
 * MeetingCard — одна картка зустрічі у дашборді (Sprint 1.2).
 *
 * Дизайн з `public/design-meetings-dashboard-v3.html` (locked 2026-06-02):
 *  - Compact layout: 14px padding, 10px gap між блоками
 *  - Час у JetBrains Mono як clock-readout
 *  - Назва клієнта — bold ink, мета візиту — emet-blue з target-іконкою
 *  - Адреса з map-pin іконкою, опційно «зафіксовано» inline
 *  - Failed sync — ліва акцентна смуга 3px rose-500 + sync-warning біля часу
 *  - Дії: primary (Завершити/Розпочати) + secondary (Редагувати/Правка)
 *  - Mobile (≤480px): primary full-width окремим рядком
 */

'use client';

import { useEffect, useState } from 'react';
import { Phone as PhoneLucide } from 'lucide-react';
import type { MeetingWithSync } from '@/lib/meetings/mock-data';
import { MOCK_CLIENT_NAMES } from '@/lib/meetings/mock-data';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ClientFromOneC } from '@/lib/mityng-types';
import { getClientName } from '@/lib/mityng-types';

interface Props {
  meeting: MeetingWithSync;
  /** Викликається коли користувач натискає «Редагувати» / «Правка». */
  onEdit?: (meeting: MeetingWithSync) => void;
  /** Викликається коли користувач натискає «Розпочати» (Sprint 1.4). */
  onStart?: (meeting: MeetingWithSync) => void;
  /** Викликається коли «Завершити» (Sprint 1.4). */
  onFinish?: (meeting: MeetingWithSync) => void;
  /** Викликається коли «Перенести» (Sprint 1.x). */
  onReschedule?: (meeting: MeetingWithSync) => void;
  /** «Коментар + анкета» на done-картці (Sprint 1.5.x). */
  onOutcome?: (meeting: MeetingWithSync) => void;
  /**
   * Дані клієнта з 1С (lookup за meeting.clientId1c у dashboard).
   * undefined якщо не знайдено / mock-режим — fallback на MOCK_CLIENT_NAMES.
   */
  client?: ClientFromOneC;
  /** Клік на ім'я клієнта → відкрити досьє. */
  onClientClick?: (clientId: string, fallbackName: string, fallbackPhone: string) => void;
  /**
   * Режим read-only (вкладка «Зустрічі команди» для РМ/директора). Ховає
   * всі дії — Старт/Фініш/Скасувати/Перенести/Правка/Підсумки. Картка
   * тільки для перегляду. Phone-кнопка лишається бо це інформаційна
   * швидко-дія, не модифікує зустріч.
   */
  readOnly?: boolean;
  /**
   * Display-name менеджера зустрічі (тільки для readOnly-режиму, щоб у
   * вкладці команди було видно чия це зустріч). Якщо передано — рендериться
   * пілюлька у шапці картки.
   */
  managerLabel?: string;
}

export function MeetingCard({
  meeting,
  onEdit,
  onStart,
  onFinish,
  onReschedule,
  onOutcome,
  client,
  onClientClick,
  readOnly,
  managerLabel,
}: Props) {
  // Fallback ланцюг для імені/телефону (P1 з аудиту 2026-06-04):
  //  1. client з getManagerClients (real-time) — найсвіжіше
  //  2. meeting.clientNameFromOneC — з getInitialData snapshot (адаптер)
  //  3. MOCK_CLIENT_NAMES — dev fallback
  //  4. clientId — ultimate fallback (краще ніж порожнє)
  // Раніше пропускало кроки 2-3 → коли getManagerClients ще тягнеться,
  // картка показувала ID або mock. Тепер snapshot-name врятовує.
  const clientName = client
    ? getClientName(client)
    : meeting.clientNameFromOneC
      || MOCK_CLIENT_NAMES[meeting.clientId1c]
      || meeting.clientId1c;
  const clientPhone = client?.Phone ?? meeting.clientPhoneFromOneC ?? '';
  const phoneClean = clientPhone.replace(/[^+\d]/g, '');
  const isFailedSync = meeting.syncStatus === 'failed';
  const isInProgress = meeting.status === 'in_progress';
  const isDone = meeting.status === 'done';
  const isCancelled = meeting.status === 'cancelled';

  // Tint background по статусу — як у регіонах/брендах де виконання яскраво
  // підсвічується кольором.
  let cardBg = 'bg-white/60';
  if (isInProgress) {
    cardBg = 'bg-gradient-to-br from-amber-100/40 to-white/60 border-amber-200';
  } else if (isDone) {
    cardBg = 'bg-gradient-to-br from-teal-100/30 to-white/60 border-teal-100';
  } else if (isCancelled) {
    cardBg = 'bg-gradient-to-br from-rose-100/40 to-white/60 border-rose-200';
  }

  const failedBorder = isFailedSync ? 'border-l-[3px] border-l-rose-500 pl-[13px]' : '';

  return (
    <div
      className={`relative ${cardBg} backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-3.5 shadow-[0_4px_14px_rgba(6,42,61,0.04)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(6,42,61,0.08)] hover:border-emet-blue/20 flex flex-col gap-2.5 ${failedBorder}`}
    >
      {/* HEAD: time + sync warning + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-bold text-[18px] text-emet-ink tracking-tight leading-none tabular-nums">
            {meeting.time.slice(0, 5)}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">
            {formatDuration(meeting.durationMin, meeting.status)}
          </span>
          {isInProgress && (
            <LiveTimer
              meetingId={meeting.id}
              startedAt={meeting.startedAt}
              plannedISO={`${meeting.date}T${meeting.time.slice(0, 8)}`}
              fallbackISO={meeting.updatedAt}
            />
          )}
          {isFailedSync && (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
              <svg
                viewBox="0 0 24 24"
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              Не синхр.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {readOnly && managerLabel && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.6px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200"
              title={`Менеджер: ${managerLabel}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-2.5 h-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {managerLabel}
            </span>
          )}
          <StatusBadge kind="meeting" status={meeting.status} />
        </div>
      </div>

      {/* BODY: client + purpose + address */}
      <div className="flex flex-col gap-0.5">
        {onClientClick ? (
          <button
            type="button"
            onClick={() => onClientClick(meeting.clientId1c, clientName, clientPhone)}
            className="text-[17px] font-bold text-emet-ink tracking-tight leading-tight text-left hover:text-emet-blue transition-colors cursor-pointer self-start"
          >
            {clientName}
          </button>
        ) : (
          <div className="text-[17px] font-bold text-emet-ink tracking-tight leading-tight">
            {clientName}
          </div>
        )}
        {/* Desktop: phone-link у адресному рядку. Mobile використовує
            icon-кнопку у HEAD-row. */}
        {clientPhone && (
          <a
            href={`tel:${phoneClean}`}
            onClick={e => e.stopPropagation()}
            className="hidden md:inline-flex items-center gap-1 mt-0.5 text-[12px] font-semibold text-emet-blue hover:text-emet-blue-light self-start"
          >
            <PhoneLucide className="w-3 h-3" />
            <span className="font-mono tabular-nums">{clientPhone}</span>
          </a>
        )}
        {meeting.purpose && (
          <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-emet-blue/85 leading-snug">
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3 opacity-85"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            {meeting.purpose}
          </div>
        )}
        {(meeting.startAddress || meeting.plannedAddress) && (
          <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{meeting.startAddress ?? meeting.plannedAddress}</span>
            {meeting.startLat != null && (
              <span className="inline-flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 text-teal-700 font-semibold text-[11px]">
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3 text-teal-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                зафіксовано
              </span>
            )}
          </div>
        )}
      </div>

      {!readOnly && (() => {
        const { primary, secondary } = splitActions(meeting, {
          onEdit, onStart, onFinish, onReschedule, onOutcome,
        });
        const phoneBtn = clientPhone ? (
          <a
            href={`tel:${phoneClean}`}
            onClick={e => e.stopPropagation()}
            aria-label={`Подзвонити ${clientName}`}
            title={clientPhone}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-[10px] bg-white/70 backdrop-blur-md border border-emet-blue/25 text-emet-blue hover:bg-emet-blue hover:text-white hover:border-emet-blue shadow-sm active:scale-95 transition-all shrink-0"
          >
            <PhoneLucide className="w-4 h-4" />
          </a>
        ) : null;
        return (
          <>
            {/* MOBILE: всі картки = ОДИН рядок: primary + secondary + phone.
                Консистентно по статусам — не плутає різними layout-ами.
                `mt-auto` притискає actions до низу — інакше короткі картки
                (без адреси) піднімають кнопки вище ніж у сусідів у grid-row. */}
            <div className="md:hidden mt-auto flex items-stretch gap-2 pt-2.5 border-t border-emet-ink/[0.06]">
              {primary && <div className="flex-1 min-w-0 flex">{primary}</div>}
              {secondary && <div className="flex-1 min-w-0 flex">{secondary}</div>}
              {phoneBtn}
            </div>

            {/* DESKTOP: actions row внизу картки. mt-auto + grid stretch
                (default для day-group `grid lg:grid-cols-2`) → у парних
                картках кнопки вирівняні. */}
            <div className="hidden md:flex flex-wrap gap-2 pt-2.5 mt-auto border-t border-emet-ink/[0.06]">
              {primary}
              {secondary}
            </div>
          </>
        );
      })()}
    </div>
  );
}

interface ActionHandlers {
  onEdit?: (m: MeetingWithSync) => void;
  onStart?: (m: MeetingWithSync) => void;
  onFinish?: (m: MeetingWithSync) => void;
  onReschedule?: (m: MeetingWithSync) => void;
  onOutcome?: (m: MeetingWithSync) => void;
}

function formatDuration(durationMin: number | null, status: string): string {
  if (durationMin == null) return '';
  if (status === 'done') return `${durationMin} хв ✓`;
  if (status === 'planned' || status === 'postponed') return `~${durationMin} хв`;
  return `${durationMin} хв`;
}

interface ActionsSplit {
  /** Основна CTA дія. На mobile якщо `primaryFull=true` — займає окремий
   *  рядок на повну ширину; інакше — у тому ж рядку що secondary. */
  primary: React.ReactNode | null;
  /** Допоміжна дія — завжди inline з phone-кнопкою на mobile. */
  secondary: React.ReactNode | null;
  /** Чи розтягувати primary на повний рядок на mobile (true для CTA). */
  primaryFull: boolean;
}

function splitActions(m: MeetingWithSync, h: ActionHandlers): ActionsSplit {
  const isFailedSync = m.syncStatus === 'failed';

  if (m.status === 'in_progress') {
    return {
      primaryFull: true,
      primary: (
        <ActionButton primary onClick={() => h.onFinish?.(m)}>
          <SquareIcon />
          Завершити
        </ActionButton>
      ),
      secondary: (
        <ActionButton onClick={() => h.onEdit?.(m)}>
          <PencilIcon />
          Правка
        </ActionButton>
      ),
    };
  }
  if (m.status === 'done') {
    // Дві secondary дії — без primary full-width рядка.
    return {
      primaryFull: false,
      primary: (
        <ActionButton onClick={() => h.onEdit?.(m)}>
          <ChartIcon />
          Деталі
        </ActionButton>
      ),
      secondary: (
        <ActionButton onClick={() => h.onOutcome?.(m)}>
          <MessageIcon />
          Підсумки
        </ActionButton>
      ),
    };
  }
  if (m.status === 'postponed' || m.status === 'cancelled') {
    return {
      primaryFull: false,
      primary: (
        <ActionButton onClick={() => h.onReschedule?.(m)}>
          <CalendarIcon />
          Перенести
        </ActionButton>
      ),
      secondary: (
        <ActionButton onClick={() => h.onEdit?.(m)}>
          <PencilIcon />
          Правка
        </ActionButton>
      ),
    };
  }
  // planned
  if (isFailedSync) {
    return {
      primaryFull: true,
      primary: (
        <ActionButton primary onClick={() => h.onStart?.(m)}>
          <PlayIcon />
          Розпочати
        </ActionButton>
      ),
      secondary: (
        <ActionButton warning onClick={() => h.onEdit?.(m)}>
          <PencilIcon />
          Правка
        </ActionButton>
      ),
    };
  }
  return {
    primaryFull: true,
    primary: (
      <ActionButton primary onClick={() => h.onStart?.(m)}>
        <PlayIcon />
        Розпочати
      </ActionButton>
    ),
    secondary: (
      <ActionButton onClick={() => h.onEdit?.(m)}>
        <PencilIcon />
        Правка
      </ActionButton>
    ),
  };
}

function ActionButton({
  children,
  primary,
  warning,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  warning?: boolean;
  onClick?: () => void;
}) {
  let cls =
    'flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-[10px] border text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ';
  if (primary) {
    cls +=
      'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white border-transparent shadow-[0_3px_10px_rgba(6,106,171,0.22)] hover:shadow-[0_5px_16px_rgba(6,106,171,0.32)] active:translate-y-px';
  } else if (warning) {
    cls +=
      'bg-rose-50 text-rose-700 border-rose-200 hover:bg-white hover:border-rose-700 active:translate-y-px';
  } else {
    cls +=
      'bg-white/70 text-slate-700 border-slate-200 hover:bg-white hover:border-emet-blue hover:text-emet-blue active:translate-y-px';
  }
  // Mobile reflow: primary occupies own row on ≤480px
  if (primary) cls += ' max-[480px]:basis-full';
  else cls += ' max-[480px]:basis-[calc(50%-4px)]';
  return <button type="button" className={cls} onClick={onClick}>{children}</button>;
}

// === Inline lucide-style icons (anti-emoji policy) ===

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
function SquareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}
function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}
/**
 * LiveTimer — лічильник тривалості зустрічі що тікає у real-time.
 *
 * Persist: started_at у БД (заповнюється у repo.startMeeting при натисканні
 * «Розпочати»). Працює навіть при switch device бо береться з server.
 * Якщо started_at NULL (стара зустріч до Phase 4) — fallback на updatedAt.
 *
 * Tick — 1 раз на секунду через setInterval. Очищаємо при unmount.
 */
function LiveTimer({
  meetingId: _meetingId,
  startedAt: startedAtFromDb,
  plannedISO,
  fallbackISO,
}: {
  meetingId: string;
  /** started_at з БД — заповнюється коли менеджер натискає «Розпочати» у НАШОМУ
   *  додатку. Для зустрічей з 1С (Митинг / 1С UI) це поле залишається null. */
  startedAt?: string | null;
  /** Плановий час зустрічі (`date + time`). Використовується як база коли
   *  `startedAt` нема — найближче до реального старту. */
  plannedISO?: string;
  /** Останній fallback — `updated_at`. Це час останнього sync, не реальний
   *  старт; використовуємо тільки якщо нічого кращого нема. */
  fallbackISO: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Chain: реальний started_at з БД > плановий час > updated_at.
  const startedISO = startedAtFromDb || plannedISO || fallbackISO;
  const startedAt = new Date(startedISO).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;

  return (
    <span
      className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/80 text-amber-800 font-mono font-bold text-[11px] tabular-nums"
      aria-label={`Триває ${mm}:${String(ss).padStart(2, '0')}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
