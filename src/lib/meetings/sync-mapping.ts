/**
 * Mapping `meeting_syncs.operation` → 1С action + payload (Sprint 1.5.3).
 *
 * Cron-worker читає pending рядки з `meeting_syncs` і для кожного будує
 * виклик до 1С на основі цієї функції. Pure (без I/O) щоб тестувалось
 * unit-тестами; HTTP-частина — у `/api/cron/sync-meetings/route.ts`.
 *
 * Контракти 1С actions узгоджені з meeting-app/js/meetings.js (legacy
 * production endpoint). Якщо контракт зміниться — править тут плюс тести.
 */

import type { MeetingSyncOperation } from './types';

/**
 * Snapshot який зберігається у `meeting_syncs.payload_snapshot`. Repo
 * передає сюди camelCase Meeting повністю — ми перетворюємо у формат
 * що очікує 1С.
 */
export interface BufferSnapshot {
  id: string;
  managerLogin: string;
  clientId1c: string;
  date: string;
  time: string;
  durationMin: number | null;
  status: string;
  purpose: string | null;
  comment: string | null;
  plannedAddress: string | null;
  startAddress: string | null;
  startLat: number | null;
  startLon: number | null;
  endAddress: string | null;
  endLat: number | null;
  endLon: number | null;
  geoManual: boolean;
}

export interface OneCCallSpec {
  action: 'saveNewMeeting' | 'updateMeeting' | 'startMeeting';
  payload: Record<string, unknown>;
}

/**
 * Перетворює snapshot у форму PascalCase яку очікує 1С HTTP-service
 * (підглянуто з `meeting-app/js/meetings.js` save flow: `newData.Comment`,
 * `newData.Date`, тощо).
 */
function snapshotToOneCMeeting(s: BufferSnapshot): Record<string, unknown> {
  return {
    ID: s.id,
    ManagerLogin: s.managerLogin,
    ClientID: s.clientId1c,
    Date: s.date,
    Time: s.time.slice(0, 5),
    DurationMin: s.durationMin,
    Status: s.status,
    Purpose: s.purpose ?? '',
    Comment: s.comment ?? '',
    PlannedAddress: s.plannedAddress ?? '',
    StartAddress: s.startAddress ?? '',
    StartLat: s.startLat,
    StartLon: s.startLon,
    EndAddress: s.endAddress ?? '',
    EndLat: s.endLat,
    EndLon: s.endLon,
    GeoManual: s.geoManual,
  };
}

/**
 * Головна mapping функція. Повертає `OneCCallSpec` — `{action, payload}` —
 * або `null` якщо op не вимагає виклику 1С (на даний момент таких немає,
 * але залишаємо опцію для майбутніх no-op ops як `cancel-local`).
 */
export function mapBufferOpToOneC(
  operation: MeetingSyncOperation,
  snapshot: BufferSnapshot,
): OneCCallSpec | null {
  const meeting = snapshotToOneCMeeting(snapshot);

  switch (operation) {
    case 'save':
      // saveNewMeeting({newData})
      return { action: 'saveNewMeeting', payload: { newData: meeting } };

    case 'update':
    case 'reschedule':
      // updateMeeting({newData, oldData}) — у нас немає oldData у buffer,
      // тому 1С отримує лише newData. Якщо потім знадобиться diff —
      // зберігати old у meeting_syncs.payload_snapshot.previous.
      return { action: 'updateMeeting', payload: { newData: meeting } };

    case 'start':
      // startMeeting({meetingID, startLat, startLon, startAddress, geoManual})
      return {
        action: 'startMeeting',
        payload: {
          meetingID: snapshot.id,
          managerLogin: snapshot.managerLogin,
          startLat: snapshot.startLat,
          startLon: snapshot.startLon,
          startAddress: snapshot.startAddress ?? '',
          geoManual: snapshot.geoManual,
        },
      };

    case 'finish':
      // finish — теж updateMeeting (з status=done + end geo)
      return { action: 'updateMeeting', payload: { newData: meeting } };

    default:
      return null;
  }
}
