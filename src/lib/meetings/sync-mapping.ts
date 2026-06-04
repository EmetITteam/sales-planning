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

/** Конвертує ISO date 'YYYY-MM-DD' → '1С-формат DD.MM.YYYY'. */
function isoDateToOneC(iso: string): string {
  // '2026-06-04' → '04.06.2026'
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Конвертує наш enum MeetingStatus → 1С-нативний русський string.
 * 1С зустрічі досі живуть у meeting-app legacy форматі — англомовні значення
 * викидають помилку «Поле объекта не обнаружено (planned)».
 * Маппінг ідентичний з onec-adapter.ts mapStatus() але реверсний.
 */
function statusToOneC(status: string): string {
  switch (status) {
    case 'planned':     return 'Запланировано';
    case 'in_progress': return 'В работе';
    case 'done':        return 'Завершено';
    case 'postponed':   return 'Просрочено';
    case 'cancelled':   return 'Отменено';
    default:            return status; // вже у 1С-форматі — пропускаємо
  }
}

/**
 * Перетворює snapshot у форму PascalCase яку очікує 1С HTTP-service.
 * Shape узгоджено з `meeting-app/js/meetings.js` save flow:
 *  - Date: 'DD.MM.YYYY' (legacy 1С формат, не ISO)
 *  - Geo через nested `locationData` / `endLocationData` об'єкти
 *  - Координати в полях `StartLatitude`/`StartLongitude` (не `StartLat`)
 */
function snapshotToOneCMeeting(s: BufferSnapshot): Record<string, unknown> {
  return {
    ID: s.id,
    ManagerLogin: s.managerLogin,
    ClientID: s.clientId1c,
    Date: isoDateToOneC(s.date),
    Time: s.time.slice(0, 5),
    DurationMin: s.durationMin,
    Status: statusToOneC(s.status),
    Purpose: s.purpose ?? '',
    Comment: s.comment ?? '',
    PlannedAddress: s.plannedAddress ?? '',
    GeoManual: s.geoManual,
    // Geo упаковано nested як meeting-app:
    locationData: {
      address: s.startAddress ?? '',
      lat: s.startLat ?? '',
      lon: s.startLon ?? '',
    },
    endLocationData: {
      address: s.endAddress ?? '',
      lat: s.endLat ?? '',
      lon: s.endLon ?? '',
    },
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
      // saveNewMeeting приймає meeting object НАПРЯМУ (не wrapped у newData).
      // Підтверджено meeting-app/js/meetings.js:341.
      return { action: 'saveNewMeeting', payload: meeting };

    case 'update':
    case 'reschedule':
    case 'finish':
      // updateMeeting очікує { newData, oldData }. У нас snapshot містить
      // лише поточний стан — шлемо його як newData, oldData = той самий
      // snapshot (best-effort; реальний diff потребує preserved-previous,
      // що додамо у Sprint 1.5.x якщо 1С не приймає такий equal payload).
      return {
        action: 'updateMeeting',
        payload: { newData: meeting, oldData: meeting },
      };

    case 'start':
      // startMeeting приймає {meetingId, locationData} — meeting-app:421.
      return {
        action: 'startMeeting',
        payload: {
          meetingId: snapshot.id,
          locationData: {
            address: snapshot.startAddress ?? '',
            lat: snapshot.startLat ?? '',
            lon: snapshot.startLon ?? '',
          },
        },
      };

    default:
      return null;
  }
}
