/**
 * useMeetings — клієнтський хук для зустрічей.
 *
 * **Архітектура** (Phase 2, 2026-06-05): 1С — джерело істини, наша БД — кеш.
 *
 * **READ** через GET /api/meetings:
 *  - backend паралельно робить bulk-import з 1С (getInitialData) → upsert у нашу БД
 *    через legacy_1c_id як unique key (idempotent, ON CONFLICT DO NOTHING)
 *  - повертає список з нашої БД (з нашими UUID)
 *  - frontend ніколи не звертається напряму до 1С — все через наш endpoint
 *
 * **WRITE** (create / update / start / finish / cancel): пише через `/api/meetings`
 * у нашу Supabase + buffer (`meeting_syncs`). Cron-worker читає чергу і шле у 1С
 * через `saveNewMeeting` / `updateMeeting` / `startMeeting`. Це гарантує що
 * менеджер не втратить запис якщо 1С тимчасово недоступний.
 *
 * Strategy: optimistic update + revalidate-on-success.
 */

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  applyStart,
  type MeetingStartPayload,
  type MeetingWithSync,
} from './mock-data';
import type { Meeting, MeetingStatus } from './types';
import { useAppStore } from '../store';
import { calcDateRange, DEFAULT_PRESET, type DateRange } from './date-presets';

interface UseMeetingsApi {
  meetings: MeetingWithSync[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createMeeting: (input: CreateMeetingInput) => Promise<MeetingWithSync | null>;
  updateMeeting: (id: string, patch: UpdateMeetingPatch) => Promise<MeetingWithSync | null>;
  startMeeting: (id: string, payload: MeetingStartPayload) => Promise<MeetingWithSync | null>;
  finishMeeting: (id: string, payload?: FinishPayload) => Promise<MeetingWithSync | null>;
  cancelMeeting: (id: string) => Promise<MeetingWithSync | null>;
}

export interface CreateMeetingInput {
  clientId1c: string;
  /** Display name + phone — транзитні (не у БД). 1С CRM Модулі вимагають
   *  у payload saveNewMeeting (інакше «Поле объекта не обнаружено»). */
  clientName?: string;
  clientPhone?: string;
  date: string;
  time: string;
  durationMin: number | null;
  purpose: string | null;
  comment: string | null;
  plannedAddress: string | null;
}

export interface UpdateMeetingPatch {
  clientId1c?: string;
  date?: string;
  time?: string;
  durationMin?: number | null;
  purpose?: string | null;
  comment?: string | null;
  plannedAddress?: string | null;
  status?: MeetingStatus;
}

export interface FinishPayload {
  address?: string;
  lat?: number | null;
  lon?: number | null;
  comment?: string | null;
  geoManual?: boolean;
}

/** Server response Meeting → MeetingWithSync (sync=pending для щойно
 *  створених рядків — cron worker ще не обробив). */
function toMeetingWithSync(
  m: Meeting,
  syncStatus: 'pending' | 'synced' | 'failed' = 'pending',
): MeetingWithSync {
  return { ...m, syncStatus, syncFailureReason: null };
}

export function useMeetings(range?: DateRange): UseMeetingsApi {
  const sessionUser = useAppStore(s => s.user);
  // Default — Сьогодні (як у meeting-app), якщо caller не передав range.
  const effectiveRange = useMemo<DateRange>(
    () => range ?? calcDateRange(DEFAULT_PRESET),
    [range],
  );

  // === READ через наш endpoint (БД як кеш + bulk-import з 1С background) ===
  const swrKey = sessionUser
    ? `our-meetings|${sessionUser.login}|${effectiveRange.startDateString}|${effectiveRange.endDateString}`
    : null;
  const { data: meetingsResp, error: fetchError, isLoading: fetchLoading, mutate: swrMutate } = useSWR(
    swrKey,
    async () => {
      const url = `/api/meetings?from=${effectiveRange.startDateString}&to=${effectiveRange.endDateString}`;
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{ meetings: Meeting[] }>;
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  );

  const refetch = useCallback(async () => {
    await swrMutate();
  }, [swrMutate]);

  const remoteMeetings = useMemo<MeetingWithSync[]>(
    () => (meetingsResp?.meetings ?? []).map(m => toMeetingWithSync(m, 'synced')),
    [meetingsResp],
  );

  // === Local merge: optimistic-додані / щойно створені поверх 1С даних ===
  // Cron worker запропсує їх у 1С через 1-2 хвилини; до того тримаємо локально.
  const [localOverlay, setLocalOverlay] = useState<MeetingWithSync[]>([]);

  const meetings = useMemo(() => {
    if (localOverlay.length === 0) return remoteMeetings;
    // Merge: local overrides remote by id. Local-only приклеюється до результату.
    const byId = new Map<string, MeetingWithSync>();
    for (const m of remoteMeetings) byId.set(m.id, m);
    for (const m of localOverlay) byId.set(m.id, m);
    return Array.from(byId.values());
  }, [remoteMeetings, localOverlay]);

  const snapshotRef = useRef<MeetingWithSync[]>([]);

  const reload = useCallback(async () => {
    setLocalOverlay([]);
    refetch();
  }, [refetch]);

  // === MUTATIONS ===

  const createMeeting = useCallback<UseMeetingsApi['createMeeting']>(
    async input => {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { meeting: Meeting };
      const fresh = toMeetingWithSync(body.meeting, 'pending');
      setLocalOverlay(prev => [...prev.filter(m => m.id !== fresh.id), fresh]);
      // Refetch через 90 сек — cron мав встигнути синхнути у 1С
      setTimeout(() => refetch(), 90_000);
      return fresh;
    },
    [refetch],
  );

  const patch = useCallback(
    async (
      id: string,
      optimistic: (m: MeetingWithSync) => MeetingWithSync,
      sendBody: unknown,
    ): Promise<MeetingWithSync | null> => {
      snapshotRef.current = [...localOverlay];

      // Optimistic
      const current = meetings.find(m => m.id === id);
      if (!current) return null;
      const optimisticVersion = optimistic(current);
      setLocalOverlay(prev => [
        ...prev.filter(m => m.id !== id),
        optimisticVersion,
      ]);

      try {
        const res = await fetch(`/api/meetings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(sendBody),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { meeting: Meeting };
        const fresh = toMeetingWithSync(body.meeting, 'pending');
        setLocalOverlay(prev => [...prev.filter(m => m.id !== id), fresh]);
        setTimeout(() => refetch(), 90_000);
        return fresh;
      } catch (e) {
        setLocalOverlay(snapshotRef.current);
        throw e;
      }
    },
    [meetings, localOverlay, refetch],
  );

  const updateMeeting = useCallback<UseMeetingsApi['updateMeeting']>(
    (id, patchData) =>
      patch(
        id,
        m => ({
          ...m,
          clientId1c: patchData.clientId1c ?? m.clientId1c,
          date: patchData.date ?? m.date,
          time: patchData.time
            ? patchData.time.length === 5
              ? `${patchData.time}:00`
              : patchData.time
            : m.time,
          durationMin:
            patchData.durationMin !== undefined ? patchData.durationMin : m.durationMin,
          purpose: patchData.purpose !== undefined ? patchData.purpose : m.purpose,
          comment: patchData.comment !== undefined ? patchData.comment : m.comment,
          plannedAddress:
            patchData.plannedAddress !== undefined
              ? patchData.plannedAddress
              : m.plannedAddress,
          status: patchData.status ?? m.status,
          updatedAt: new Date().toISOString(),
        }),
        { op: 'update', update: patchData },
      ),
    [patch],
  );

  const startMeeting = useCallback<UseMeetingsApi['startMeeting']>(
    (id, payload) =>
      patch(
        id,
        m => applyStart([m], id, payload)[0],
        { op: 'start', start: payload },
      ),
    [patch],
  );

  const finishMeeting = useCallback<UseMeetingsApi['finishMeeting']>(
    (id, payload = {}) =>
      patch(
        id,
        m => ({
          ...m,
          status: 'done',
          endAddress: payload.address ?? m.endAddress,
          endLat: payload.lat ?? m.endLat,
          endLon: payload.lon ?? m.endLon,
          comment: payload.comment ?? m.comment,
          updatedAt: new Date().toISOString(),
        }),
        { op: 'finish', finish: payload },
      ),
    [patch],
  );

  const cancelMeeting = useCallback<UseMeetingsApi['cancelMeeting']>(
    id =>
      patch(
        id,
        m => ({ ...m, status: 'cancelled', updatedAt: new Date().toISOString() }),
        { op: 'cancel' },
      ),
    [patch],
  );

  // Skip useEffect — useOneCData фетчить автоматично коли `payload` truthy.
  // Просто експонуємо стан.
  return {
    meetings,
    loading: fetchLoading,
    error: fetchError,
    reload,
    createMeeting,
    updateMeeting,
    startMeeting,
    finishMeeting,
    cancelMeeting,
  };
}
