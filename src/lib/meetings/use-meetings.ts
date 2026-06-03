/**
 * useMeetings — клієнтський хук для отримання й мутації зустрічей через
 * `/api/meetings` (Sprint 1.5.2).
 *
 * Strategy: optimistic update + revalidate-on-success.
 *
 * Хук тримає локальний `meetings: MeetingWithSync[]` (camelCase). Кожна
 * мутація:
 *   1. immediately оновлює локальний state (UI не блимає)
 *   2. шле HTTP запит
 *   3. при успіху — підмінює рядок server-response версією
 *   4. при помилці — повертає попередній стан + кидає Error (caller показує toast)
 *
 * Mock-fallback: якщо `NEXT_PUBLIC_MEETINGS_USE_REAL_API` НЕ === 'true',
 * хук одразу повертає `getMockMeetings()` БЕЗ HTTP-викликів. Це rollback-знак
 * для дев-середовища і smoke-test'ів.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyStart,
  getMockMeetings,
  type MeetingStartPayload,
  type MeetingWithSync,
} from './mock-data';
import type { Meeting, MeetingStatus } from './types';

interface FetchState {
  loading: boolean;
  error: string | null;
}

interface UseMeetingsApi {
  meetings: MeetingWithSync[];
  loading: boolean;
  error: string | null;
  isUsingRealApi: boolean;
  reload: () => Promise<void>;
  createMeeting: (input: CreateMeetingInput) => Promise<MeetingWithSync | null>;
  updateMeeting: (id: string, patch: UpdateMeetingPatch) => Promise<MeetingWithSync | null>;
  startMeeting: (id: string, payload: MeetingStartPayload) => Promise<MeetingWithSync | null>;
  finishMeeting: (id: string, payload?: FinishPayload) => Promise<MeetingWithSync | null>;
}

export interface CreateMeetingInput {
  clientId1c: string;
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
  /** true якщо адресу при finish ввели вручну (GPS не вдалось). */
  geoManual?: boolean;
}

function isUsingRealApiFlag(): boolean {
  // Двічі перевіряємо: NEXT_PUBLIC_* доступне на client-side з process.env у Next.js.
  return process.env.NEXT_PUBLIC_MEETINGS_USE_REAL_API === 'true';
}

/** Server response Meeting → MeetingWithSync (додаємо `syncStatus: pending` за замовчуванням
 *  бо щойно створений рядок саме у такому стані поки worker не обробив). */
function toMeetingWithSync(m: Meeting, syncStatus: 'pending' | 'synced' | 'failed' = 'pending'): MeetingWithSync {
  return {
    ...m,
    syncStatus,
    syncFailureReason: null,
  };
}

export function useMeetings(): UseMeetingsApi {
  const isUsingRealApi = isUsingRealApiFlag();
  const [meetings, setMeetings] = useState<MeetingWithSync[]>(() =>
    isUsingRealApi ? [] : getMockMeetings(),
  );
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: isUsingRealApi,
    error: null,
  });
  // ref для optimistic-rollback (зберігаємо snapshot перед мутацією)
  const snapshotRef = useRef<MeetingWithSync[]>([]);

  const reload = useCallback(async () => {
    if (!isUsingRealApi) {
      setMeetings(getMockMeetings());
      return;
    }
    setFetchState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/meetings', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { meetings: Meeting[] };
      setMeetings(body.meetings.map(m => toMeetingWithSync(m, 'synced')));
      setFetchState({ loading: false, error: null });
    } catch (e) {
      const msg = (e as Error).message || 'fetch failed';
      setFetchState({ loading: false, error: msg });
    }
  }, [isUsingRealApi]);

  useEffect(() => {
    if (isUsingRealApi) void reload();
  }, [isUsingRealApi, reload]);

  // === MUTATIONS ===

  const createMeeting = useCallback<UseMeetingsApi['createMeeting']>(
    async input => {
      if (!isUsingRealApi) {
        // У mock-режимі — просто додаємо локально (sprint 1.5 буде real)
        const fake: MeetingWithSync = toMeetingWithSync(
          {
            id: crypto.randomUUID(),
            managerLogin: 'mock@emet.in.ua',
            clientId1c: input.clientId1c,
            date: input.date,
            time: input.time.length === 5 ? `${input.time}:00` : input.time,
            durationMin: input.durationMin,
            status: 'planned',
            purpose: input.purpose,
            comment: input.comment,
            plannedAddress: input.plannedAddress,
            startAddress: null,
            startLat: null,
            startLon: null,
            endAddress: null,
            endLat: null,
            endLon: null,
            geoManual: false,
            calendarEventId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          'synced',
        );
        setMeetings(prev => [...prev, fake]);
        return fake;
      }
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
      setMeetings(prev => [...prev, fresh]);
      return fresh;
    },
    [isUsingRealApi],
  );

  const patch = useCallback(
    async (
      id: string,
      optimistic: (m: MeetingWithSync) => MeetingWithSync,
      sendBody: unknown,
    ): Promise<MeetingWithSync | null> => {
      // Snapshot для rollback
      snapshotRef.current = meetings;
      let next: MeetingWithSync | null = null;
      setMeetings(prev =>
        prev.map(m => {
          if (m.id !== id) return m;
          next = optimistic(m);
          return next;
        }),
      );

      if (!isUsingRealApi) return next;

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
        setMeetings(prev => prev.map(m => (m.id === id ? fresh : m)));
        return fresh;
      } catch (e) {
        // Rollback
        setMeetings(snapshotRef.current);
        throw e;
      }
    },
    [meetings, isUsingRealApi],
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
          durationMin: patchData.durationMin !== undefined ? patchData.durationMin : m.durationMin,
          purpose: patchData.purpose !== undefined ? patchData.purpose : m.purpose,
          comment: patchData.comment !== undefined ? patchData.comment : m.comment,
          plannedAddress:
            patchData.plannedAddress !== undefined ? patchData.plannedAddress : m.plannedAddress,
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

  return {
    meetings,
    loading: fetchState.loading,
    error: fetchState.error,
    isUsingRealApi,
    reload,
    createMeeting,
    updateMeeting,
    startMeeting,
    finishMeeting,
  };
}
