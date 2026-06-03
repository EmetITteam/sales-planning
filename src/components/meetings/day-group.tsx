/**
 * DayGroup — секція зустрічей під заголовком дня (Sprint 1.2).
 *
 * Дизайн з v3: «Сьогодні · понеділок, 03 червня» + лічильник + прогрес-зведення
 * праворуч («1 завершено · 2 у роботі · 3 попереду»).
 */

'use client';

import type { MeetingWithSync } from '@/lib/meetings/mock-data';
import { formatDayLabel } from '@/lib/meetings/mock-data';
import type { ClientFromOneC } from '@/lib/mityng-types';
import { MeetingCard } from './meeting-card';

interface Props {
  date: string;
  meetings: MeetingWithSync[];
  today: Date;
  onEditMeeting?: (m: MeetingWithSync) => void;
  onStartMeeting?: (m: MeetingWithSync) => void;
  onFinishMeeting?: (m: MeetingWithSync) => void;
  onRescheduleMeeting?: (m: MeetingWithSync) => void;
  /** Map clientId1c → client із 1С (для phone + dossier). */
  clientsByID?: Map<string, ClientFromOneC>;
  /** Клік на ім'я клієнта у картці → відкрити досьє у dashboard. */
  onClientClick?: (clientId: string, fallbackName: string, fallbackPhone: string) => void;
}

export function DayGroup({
  date,
  meetings,
  today,
  onEditMeeting,
  onStartMeeting,
  onFinishMeeting,
  onRescheduleMeeting,
  clientsByID,
  onClientClick,
}: Props) {
  const { label, isToday } = formatDayLabel(date, today);

  const done = meetings.filter(m => m.status === 'done').length;
  const inProgress = meetings.filter(m => m.status === 'in_progress').length;
  const planned = meetings.filter(m => m.status === 'planned').length;
  const postponed = meetings.filter(m => m.status === 'postponed').length;
  const upcoming = planned + postponed;

  return (
    <div className="mb-7 last:mb-0">
      <div className="flex items-baseline gap-3 mx-1 mb-3 pb-1.5 border-b border-emet-ink/[0.06]">
        <span className="text-[14px] font-bold text-emet-ink tracking-tight">
          {isToday ? (
            <>
              <span className="text-emet-blue">{label.split(' · ')[0]}</span>
              {label.includes(' · ') && (
                <span className="text-emet-ink"> · {label.split(' · ').slice(1).join(' · ')}</span>
              )}
            </>
          ) : (
            label
          )}
        </span>
        <span className="text-[11px] font-semibold text-slate-500">
          {meetings.length} {pluralize(meetings.length, ['зустріч', 'зустрічі', 'зустрічей'])}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
          {isToday ? (
            <>
              <strong className="text-teal-700 font-bold">{done} завершено</strong>
              {inProgress > 0 && <> · {inProgress} у роботі</>}
              {upcoming > 0 && <> · {upcoming} попереду</>}
            </>
          ) : (
            <>
              {planned > 0 && <>{planned} заплановано</>}
              {postponed > 0 && (
                <>
                  {planned > 0 ? ' · ' : ''}
                  {postponed} відкладено
                </>
              )}
              {done > 0 && (
                <>
                  {planned + postponed > 0 ? ' · ' : ''}
                  <strong className="text-teal-700 font-bold">{done} завершено</strong>
                </>
              )}
            </>
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-md:gap-2.5">
        {meetings.map(m => (
          <MeetingCard
            key={m.id}
            meeting={m}
            onEdit={onEditMeeting}
            onStart={onStartMeeting}
            onFinish={onFinishMeeting}
            onReschedule={onRescheduleMeeting}
            client={clientsByID?.get(m.clientId1c)}
            onClientClick={onClientClick}
          />
        ))}
      </div>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  // UK: 1 → forms[0], 2-4 → forms[1], 5+ → forms[2]
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms[2];
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}
