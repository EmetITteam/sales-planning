/**
 * Adapter: 1С Meeting (PascalCase, response від `getInitialData`) →
 * наш `MeetingWithSync` (camelCase).
 *
 * 1С shape підглянуто з meeting-app/js/meetings.js production code:
 *  - Date 'DD.MM.YYYY' (legacy формат)
 *  - Time 'HH:MM'
 *  - Status: 'Запланировано' / 'В работе' / 'Завершено' / 'Завершена' /
 *           'Отмена' / 'Отменено' / 'Просрочено'
 *  - StartLatitude / StartLongitude (НЕ StartLat)
 *  - calendarEventId
 *
 * Якщо 1С повертає поле незнайомого формату — graceful fallback.
 */

import type { Meeting, MeetingStatus } from './types';
import type { MeetingWithSync } from './mock-data';

/** Поля які приходять у `data.meetings[i]` з 1С. */
export interface OneCMeetingRow {
  ID?: string;
  ClientID?: string;
  Client?: string;
  ClientCategory?: string;
  Date?: string;     // 'DD.MM.YYYY'
  Time?: string;     // 'HH:MM'
  DurationMin?: number | string | null;
  Status?: string;
  Purpose?: string;
  Comment?: string;
  Phone?: string;
  ManagerLogin?: string;
  PlannedAddress?: string;
  StartAddress?: string;
  StartLatitude?: number | string | null;
  StartLongitude?: number | string | null;
  EndAddress?: string;
  EndLatitude?: number | string | null;
  EndLongitude?: number | string | null;
  GeoManual?: boolean;
  calendarEventId?: string;
  /**
   * 🆕 Час коли менеджер натиснув «Розпочати». ISO 8601
   * ('2026-06-10T12:39:00+03:00') або 'DD.MM.YYYY HH:MM:SS'.
   * Заповнено для зустрічей зі статусом В работе / Завершено. Для
   * planned/cancelled — null/відсутнє.
   */
  StartedAt?: string;
  /** JSON-stringify survey-форми (assess клієнта). Зберігається у самому
   *  meeting обєкті — 1С продовжує meeting-app legacy. */
  AnketaDataJSON?: string;
}

/** Перетворити 1С-Status у наш MeetingStatus. */
function mapStatus(raw: string | undefined): MeetingStatus {
  const s = (raw ?? '').trim();
  switch (s) {
    case 'В работе':
    case 'in_progress':
      return 'in_progress';
    case 'Завершено':
    case 'Завершена':
    case 'done':
      return 'done';
    case 'Отмена':
    case 'Отменено':
    case 'cancelled':
      return 'cancelled';
    case 'Просрочено':
    case 'postponed':
      return 'postponed';
    case 'Запланировано':
    case 'planned':
    default:
      return 'planned';
  }
}

/** 'DD.MM.YYYY' → 'YYYY-MM-DD'. Якщо вже ISO — повертаємо як є. */
export function normalizeDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // 'DD.MM.YYYY'
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return raw;
}

/** 'HH:MM' → 'HH:MM:00'. */
function normalizeTime(raw: string | undefined): string {
  if (!raw) return '00:00:00';
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

function toNumberOrNull(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Конвертер OneCMeetingRow → Meeting. */
export function adaptOneCMeeting(row: OneCMeetingRow): Meeting {
  const now = new Date().toISOString();
  return {
    id: row.ID ?? '',
    managerLogin: row.ManagerLogin ?? '',
    clientId1c: row.ClientID ?? '',
    date: normalizeDate(row.Date),
    time: normalizeTime(row.Time),
    durationMin: toNumberOrNull(row.DurationMin),
    status: mapStatus(row.Status),
    purpose: row.Purpose ?? null,
    comment: row.Comment ?? null,
    plannedAddress: row.PlannedAddress ?? null,
    startAddress: row.StartAddress ?? null,
    startLat: toNumberOrNull(row.StartLatitude),
    startLon: toNumberOrNull(row.StartLongitude),
    endAddress: row.EndAddress ?? null,
    endLat: toNumberOrNull(row.EndLatitude),
    endLon: toNumberOrNull(row.EndLongitude),
    geoManual: row.GeoManual ?? false,
    calendarEventId: row.calendarEventId ?? null,
    anketaDataJson: row.AnketaDataJSON ?? null,
    clientNameFromOneC: row.Client?.trim() || null,
    clientPhoneFromOneC: row.Phone?.trim() || null,
    clientCategoryFromOneC: row.ClientCategory?.trim() || null,
    // 🆕 StartedAt з 1С (момент натискання «Розпочати»). Нормалізуємо
    // у ISO 8601. LiveTimer показуватиме реальний elapsed з цього моменту.
    startedAt: normalizeStartedAt(row.StartedAt),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Нормалізує StartedAt з 1С в ISO 8601 string.
 * 1С може повернути:
 *  - 'YYYY-MM-DD HH:MM:SS' / 'YYYY-MM-DDTHH:MM:SS' — ISO without TZ
 *  - 'DD.MM.YYYY HH:MM:SS' — ukrainian format
 *  - '' / null / undefined → null
 */
function normalizeStartedAt(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(s)) {
    return s.replace(' ', 'T');
  }
  // 'DD.MM.YYYY HH:MM:SS'
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[\sT](\d{2}:\d{2}(?::\d{2})?)$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`;
  return null;
}

/** Конвертер OneCMeetingRow → MeetingWithSync. Sync-status defaults `synced`
 *  (дані вже у 1С, наш cron не має нічого надсилати для цих). */
export function adaptOneCMeetingWithSync(row: OneCMeetingRow): MeetingWithSync {
  return {
    ...adaptOneCMeeting(row),
    syncStatus: 'synced',
    syncFailureReason: null,
  };
}

/** Batch адаптер для масиву з `getInitialData.meetings`. */
export function adaptOneCMeetings(rows: OneCMeetingRow[] | undefined): MeetingWithSync[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(adaptOneCMeetingWithSync)
    .filter(m => m.id);
}
