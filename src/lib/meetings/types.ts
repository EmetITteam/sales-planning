/**
 * Meetings domain types.
 *
 * Відповідають схемі з `supabase/migrations/20260603_013_meetings_schema.sql`.
 * Зміни схеми → одночасно правимо тут і у міграції.
 */

/**
 * Поточний статус зустрічі у workflow менеджера.
 *
 * - `planned` — створено, ще не розпочато
 * - `in_progress` — менеджер натиснув Start (зафіксовано start_lat/lon або geo_manual)
 * - `done` — менеджер натиснув Finish (зафіксовано end_lat/lon)
 * - `postponed` — перенесено на іншу дату/час
 * - `cancelled` — клієнт скасував; не пройшла
 */
export type MeetingStatus = 'planned' | 'in_progress' | 'done' | 'postponed' | 'cancelled';

/**
 * Операція buffer-sync. Cron-worker обробляє рядки meeting_syncs
 * у відповідній черзі і відправляє у 1С відповідні actions.
 */
export type MeetingSyncOperation = 'save' | 'update' | 'start' | 'finish' | 'reschedule';

/**
 * State machine для синку (ADR-6 + ADR-9).
 *
 * - `pending` — записано у нас, чекає cron-batch
 * - `syncing` — cron взяв у роботу
 * - `synced` — 1С підтвердив
 * - `failed` — 1С відмовив (treba pravka, ADR-9). next_retry_at = NULL → менеджер сам викликає retry через UI
 */
export type MeetingSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** Один рядок з таблиці `meetings`. */
export interface Meeting {
  id: string;                          // uuid
  managerLogin: string;                // FK → users.login
  clientId1c: string;                  // код контрагента з 1С (не FK)
  date: string;                        // ISO YYYY-MM-DD
  time: string;                        // HH:MM:SS
  durationMin: number | null;          // очікувана тривалість у хвилинах
  status: MeetingStatus;
  purpose: string | null;
  comment: string | null;
  plannedAddress: string | null;       // ввів менеджер при плануванні
  startAddress: string | null;         // зафіксовано GPS / введено вручну при Start
  startLat: number | null;
  startLon: number | null;
  endAddress: string | null;           // зафіксовано GPS / введено вручну при Finish
  endLat: number | null;
  endLon: number | null;
  geoManual: boolean;                  // true якщо адресу ввели вручну (ADR-7)
  calendarEventId: string | null;      // ID події у Google Calendar (ADR-10)
  /**
   * JSON-stringify survey-форми (анкета клієнта). 1С зберігає його у
   * `AnketaDataJSON` полі meeting object — meeting-app legacy. Опційне,
   * присутнє якщо менеджер уже заповнив анкету у попередній зустрічі
   * цього клієнта. Використовується для префілу outcome dialog.
   */
  anketaDataJson?: string | null;
  /**
   * Transient enrichment з 1С getInitialData (НЕ зберігається у Postgres,
   * приходить тільки з READ-side). UI використовує як fallback коли клієнт
   * НЕ у getManagerClients-кеші (race / чужий клієнт історично).
   * Адаптер `adaptOneCMeeting` заповнює; меш-операції (cancel/start/finish)
   * не міняють — лишається з останнього server snapshot.
   */
  clientNameFromOneC?: string | null;
  clientPhoneFromOneC?: string | null;
  clientCategoryFromOneC?: string | null;
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}

/** Один рядок з таблиці `meeting_syncs`. */
export interface MeetingSync {
  id: string;
  meetingId: string;                   // FK → meetings.id
  status: MeetingSyncStatus;
  operation: MeetingSyncOperation;
  payloadSnapshot: Record<string, unknown> | null;  // jsonb
  onecResponse: Record<string, unknown> | null;     // jsonb
  failureReason: string | null;
  retryCount: number;
  nextRetryAt: string | null;          // ISO timestamp
  syncedAt: string | null;             // ISO timestamp
  createdAt: string;                   // ISO timestamp
}

/**
 * Snake_case shape що приходить з Supabase REST (PostgREST не camelCase-ить
 * за замовчуванням). Адаптуємо через `adaptMeetingRow` нижче.
 */
export interface MeetingRowDb {
  id: string;
  manager_login: string;
  client_id_1c: string;
  date: string;
  time: string;
  duration_min: number | null;
  status: MeetingStatus;
  purpose: string | null;
  comment: string | null;
  planned_address: string | null;
  start_address: string | null;
  start_lat: number | null;
  start_lon: number | null;
  end_address: string | null;
  end_lat: number | null;
  end_lon: number | null;
  geo_manual: boolean;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingSyncRowDb {
  id: string;
  meeting_id: string;
  status: MeetingSyncStatus;
  operation: MeetingSyncOperation;
  payload_snapshot: Record<string, unknown> | null;
  onec_response: Record<string, unknown> | null;
  failure_reason: string | null;
  retry_count: number;
  next_retry_at: string | null;
  synced_at: string | null;
  created_at: string;
}

/** snake_case → camelCase. */
export function adaptMeetingRow(row: MeetingRowDb): Meeting {
  return {
    id: row.id,
    managerLogin: row.manager_login,
    clientId1c: row.client_id_1c,
    date: row.date,
    time: row.time,
    durationMin: row.duration_min,
    status: row.status,
    purpose: row.purpose,
    comment: row.comment,
    plannedAddress: row.planned_address,
    startAddress: row.start_address,
    startLat: row.start_lat,
    startLon: row.start_lon,
    endAddress: row.end_address,
    endLat: row.end_lat,
    endLon: row.end_lon,
    geoManual: row.geo_manual,
    calendarEventId: row.calendar_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function adaptMeetingSyncRow(row: MeetingSyncRowDb): MeetingSync {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    status: row.status,
    operation: row.operation,
    payloadSnapshot: row.payload_snapshot,
    onecResponse: row.onec_response,
    failureReason: row.failure_reason,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
  };
}

/** camelCase → snake_case (для INSERT/UPDATE). */
export function toMeetingRowDb(meeting: Partial<Meeting>): Partial<MeetingRowDb> {
  const row: Partial<MeetingRowDb> = {};
  if (meeting.id !== undefined) row.id = meeting.id;
  if (meeting.managerLogin !== undefined) row.manager_login = meeting.managerLogin;
  if (meeting.clientId1c !== undefined) row.client_id_1c = meeting.clientId1c;
  if (meeting.date !== undefined) row.date = meeting.date;
  if (meeting.time !== undefined) row.time = meeting.time;
  if (meeting.durationMin !== undefined) row.duration_min = meeting.durationMin;
  if (meeting.status !== undefined) row.status = meeting.status;
  if (meeting.purpose !== undefined) row.purpose = meeting.purpose;
  if (meeting.comment !== undefined) row.comment = meeting.comment;
  if (meeting.plannedAddress !== undefined) row.planned_address = meeting.plannedAddress;
  if (meeting.startAddress !== undefined) row.start_address = meeting.startAddress;
  if (meeting.startLat !== undefined) row.start_lat = meeting.startLat;
  if (meeting.startLon !== undefined) row.start_lon = meeting.startLon;
  if (meeting.endAddress !== undefined) row.end_address = meeting.endAddress;
  if (meeting.endLat !== undefined) row.end_lat = meeting.endLat;
  if (meeting.endLon !== undefined) row.end_lon = meeting.endLon;
  if (meeting.geoManual !== undefined) row.geo_manual = meeting.geoManual;
  if (meeting.calendarEventId !== undefined) row.calendar_event_id = meeting.calendarEventId;
  return row;
}
