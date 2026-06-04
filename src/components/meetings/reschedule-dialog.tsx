/**
 * RescheduleDialog — перенесення зустрічі на іншу дату/час.
 *
 * Логіка з meeting-app/js/meetings.js handleSaveReschedule:
 *  - 2 поля: нова дата + новий час
 *  - До коментаря додається «Перенесено зі старої дати DD.MM.YYYY»
 *  - Викликаємо updateMeeting з новими полями
 *
 * Структура — bottom-sheet (mobile) / centered modal (desktop), як решта
 * dialog-компонентів у проекті.
 */

'use client';

import { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, CheckIcon, CalendarIcon } from 'lucide-react';
import type { MeetingWithSync } from '@/lib/meetings/mock-data';
import { MOCK_CLIENT_NAMES } from '@/lib/meetings/mock-data';
import { useMyClients } from '@/lib/use-my-clients';
import { getClientName } from '@/lib/mityng-types';

export interface ReschedulePayload {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  comment: string;
}

interface Props {
  open: boolean;
  meeting: MeetingWithSync | null;
  onClose: () => void;
  onConfirm: (id: string, payload: ReschedulePayload) => void;
}

/** YYYY-MM-DD → DD.MM.YYYY (для auto-comment). */
function isoToDmy(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function getDefaultDate(): string {
  // Завтра
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().slice(0, 10);
}

export function RescheduleDialog({ open, meeting, onClose, onConfirm }: Props) {
  const { clients: myClients } = useMyClients();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && meeting) {
      setDate(getDefaultDate());
      setTime(meeting.time.slice(0, 5));
      setError(null);
    }
  }, [open, meeting]);

  if (!meeting) return null;

  const matched = myClients.find(c => c.ClientID === meeting.clientId1c);
  const clientName = matched
    ? getClientName(matched)
    : MOCK_CLIENT_NAMES[meeting.clientId1c] ?? meeting.clientId1c;

  const handleSave = () => {
    if (!date || !time) {
      setError('Будь ласка, вкажіть дату і час.');
      return;
    }
    const oldDateLabel = isoToDmy(meeting.date);
    const reschedNote = `Перенесено зі старої дати ${oldDateLabel}`;
    const newComment = meeting.comment
      ? `${meeting.comment}\n${reschedNote}`
      : reschedNote;
    onConfirm(meeting.id, {
      date,
      time: time.length === 5 ? `${time}:00` : time,
      comment: newComment,
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
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
            data-ending-style:opacity-0 max-md:data-ending-style:translate-y-full md:data-ending-style:scale-95
            data-starting-style:opacity-0 max-md:data-starting-style:translate-y-full md:data-starting-style:scale-95
            transition-all duration-200
          "
        >
          <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
            <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight inline-flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-emet-blue" />
              Перенести зустріч
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <div className="text-[15px] font-bold text-emet-ink leading-tight">{clientName}</div>
              <div className="text-[12px] text-slate-500 mt-0.5">
                Поточна: <span className="font-mono">{isoToDmy(meeting.date)} · {meeting.time.slice(0, 5)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                  Нова дата <span className="text-emet-blue">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                  Новий час <span className="text-emet-blue">*</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] font-mono font-semibold tracking-tight transition-all"
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-500 leading-snug">
              До коментаря автоматично додасться:
              <span className="block mt-1 text-slate-700 italic">«Перенесено зі старої дати {isoToDmy(meeting.date)}»</span>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-[12px] text-rose-700">
                {error}
              </div>
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
              onClick={handleSave}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all inline-flex items-center justify-center gap-2"
            >
              <CheckIcon className="w-4 h-4" />
              Перенести
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
