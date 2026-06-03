/**
 * Mock meetings для Sprint 1.2 (Dashboard skeleton без даних з 1С).
 *
 * Замінюємо у Sprint 1.5 на реальний `useMeetings` через `/api/meetings`
 * + Supabase + 1С sync. Поки що структура повторює `Meeting` тип щоб
 * UI не довелось переписувати при переключенні джерела.
 */
import type { Meeting, MeetingStatus, MeetingSyncStatus } from './types';

/** Зустріч + найновіший sync-статус для відображення бейджа. */
export interface MeetingWithSync extends Meeting {
  /** Найновіший sync-статус. `null` якщо запис нічого не пробував синхронізувати. */
  syncStatus: MeetingSyncStatus | null;
  /** Текст помилки sync (для failed). */
  syncFailureReason: string | null;
}

/** Дата у форматі YYYY-MM-DD з ISO-часом. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Створює mock-зустріч з частковими параметрами + дефолти. */
function meeting(
  overrides: Partial<MeetingWithSync> & Pick<MeetingWithSync, 'date' | 'time' | 'clientId1c' | 'status'>,
): MeetingWithSync {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    managerLogin: overrides.managerLogin ?? 'mock@emet.in.ua',
    clientId1c: overrides.clientId1c,
    date: overrides.date,
    time: overrides.time,
    durationMin: overrides.durationMin ?? null,
    status: overrides.status,
    purpose: overrides.purpose ?? null,
    comment: overrides.comment ?? null,
    plannedAddress: overrides.plannedAddress ?? null,
    startAddress: overrides.startAddress ?? null,
    startLat: overrides.startLat ?? null,
    startLon: overrides.startLon ?? null,
    endAddress: overrides.endAddress ?? null,
    endLat: overrides.endLat ?? null,
    endLon: overrides.endLon ?? null,
    geoManual: overrides.geoManual ?? false,
    calendarEventId: overrides.calendarEventId ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    syncStatus: overrides.syncStatus ?? 'synced',
    syncFailureReason: overrides.syncFailureReason ?? null,
  };
}

/**
 * Повертає 9 mock-зустрічей для дашборду: розкидані по «сьогодні» (6),
 * «завтра» (2) і «післязавтра» (1) відносно поточної дати.
 *
 * Один запис у `in_progress` (з геолокацією), один `completed`, один
 * `postponed`, один `failed` sync — щоб UI показував всі стани.
 */
export function getMockMeetings(): MeetingWithSync[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  const todayStr = toISODate(today);
  const tomorrowStr = toISODate(tomorrow);
  const dayAfterStr = toISODate(dayAfter);

  return [
    // === СЬОГОДНІ ===
    // У роботі — з геолокацією зафіксовано
    meeting({
      clientId1c: 'CL-ESTET-PODOL',
      date: todayStr,
      time: '10:30:00',
      durationMin: 45,
      status: 'in_progress',
      purpose: 'Презентація ELLANSE',
      plannedAddress: 'вул. Хорива 42, Київ',
      startAddress: 'вул. Хорива 42, Київ',
      startLat: 50.464822,
      startLon: 30.518693,
    }),
    // Заплановано
    meeting({
      clientId1c: 'CL-MAXIM-PECHERSK',
      date: todayStr,
      time: '13:00:00',
      durationMin: 60,
      status: 'planned',
      purpose: 'Контракт VITARAN',
      plannedAddress: 'вул. Тимирязівська 8',
    }),
    // Заплановано
    meeting({
      clientId1c: 'CL-LAZERHAUS-LIVO',
      date: todayStr,
      time: '15:30:00',
      durationMin: 30,
      status: 'planned',
      purpose: 'Демонстрація EXOXE',
      plannedAddress: 'пр. Бажана 14',
    }),
    // Заплановано + не синхронізовано (ADR-9)
    meeting({
      clientId1c: 'CL-ADASSA-PODIL',
      date: todayStr,
      time: '16:45:00',
      durationMin: 45,
      status: 'planned',
      purpose: 'Знайомство, навчання',
      plannedAddress: 'вул. Сагайдачного 27',
      syncStatus: 'failed',
      syncFailureReason: '1С: client_id_1c not found in registry',
    }),
    // Завершено
    meeting({
      clientId1c: 'CL-KRASA-PLUS',
      date: todayStr,
      time: '09:00:00',
      durationMin: 37,
      status: 'done',
      purpose: 'Узгодження плану закупки',
      plannedAddress: 'вул. Лесі Українки 5',
      startAddress: 'вул. Лесі Українки 5',
      startLat: 50.443344,
      startLon: 30.526543,
      endAddress: 'вул. Лесі Українки 5',
      endLat: 50.443344,
      endLon: 30.526543,
    }),
    // Ще одна заплановано
    meeting({
      clientId1c: 'CL-PREMIUM-PECHERSK',
      date: todayStr,
      time: '17:30:00',
      durationMin: 30,
      status: 'planned',
      purpose: 'Обговорення угоди ESSE',
      plannedAddress: 'вул. Кловський узвіз 7',
    }),

    // === ЗАВТРА ===
    meeting({
      clientId1c: 'CL-BEAUTY-PODIL',
      date: tomorrowStr,
      time: '10:00:00',
      durationMin: 45,
      status: 'planned',
      purpose: 'Презентація NEURAMIS',
      plannedAddress: 'вул. Іллінська 12',
    }),
    meeting({
      clientId1c: 'CL-ESTET-PRO-OBOLON',
      date: tomorrowStr,
      time: '14:30:00',
      durationMin: 60,
      status: 'planned',
      purpose: 'Підписання договору',
      plannedAddress: 'пр. Героїв Сталінграду 24',
    }),

    // === ПІСЛЯЗАВТРА ===
    meeting({
      clientId1c: 'CL-STELLA-BEAUTY',
      date: dayAfterStr,
      time: '11:00:00',
      durationMin: 45,
      status: 'postponed',
      purpose: 'Перенесена з минулого тижня',
      plannedAddress: 'вул. Васильківська 30',
    }),
  ];
}

/** Mapping clientId_1c → display name (для UI поки нема `/api/clients/[id]`). */
export const MOCK_CLIENT_NAMES: Record<string, string> = {
  'CL-ESTET-PODOL': 'Клініка «Естет» · Подол',
  'CL-MAXIM-PECHERSK': 'Косметологія Maxim · Печерськ',
  'CL-LAZERHAUS-LIVO': 'Lazerhaus Studio · Лівобережка',
  'CL-ADASSA-PODIL': 'Adassa Clinic · Поділ',
  'CL-KRASA-PLUS': 'ТОВ Краса Plus · Печерськ',
  'CL-PREMIUM-PECHERSK': 'Premium Clinic · Печерськ',
  'CL-BEAUTY-PODIL': 'Beauty Lab · Поділ',
  'CL-ESTET-PRO-OBOLON': 'Estet Pro · Оболонь',
  'CL-STELLA-BEAUTY': 'Stella Beauty · Голосіївський',
};

/** Лічильник статусів для widgets-row. */
export interface MeetingsStatsTotals {
  total: number;
  today: number;
  todayInProgress: number;
  todayCompleted: number;
  todayPlanned: number;
  weekCompleted: number;
  needsFix: number;
}

export function computeStats(meetings: MeetingWithSync[], today: Date): MeetingsStatsTotals {
  const todayStr = toISODate(today);
  let total = 0;
  let todayCount = 0;
  let inProgress = 0;
  let completed = 0;
  let planned = 0;
  let needsFix = 0;
  for (const m of meetings) {
    total++;
    if (m.date === todayStr) {
      todayCount++;
      if (m.status === 'in_progress') inProgress++;
      else if (m.status === 'done') completed++;
      else if (m.status === 'planned') planned++;
    }
    if (m.syncStatus === 'failed') needsFix++;
  }
  return {
    total,
    today: todayCount,
    todayInProgress: inProgress,
    todayCompleted: completed,
    todayPlanned: planned,
    weekCompleted: meetings.filter(m => m.status === 'done').length,
    needsFix,
  };
}

/** Групує зустрічі по даті, сортує групи по даті ASC, у кожній групі по часу ASC. */
export function groupMeetingsByDate(meetings: MeetingWithSync[]): {
  date: string;
  items: MeetingWithSync[];
}[] {
  const map = new Map<string, MeetingWithSync[]>();
  for (const m of meetings) {
    const arr = map.get(m.date) ?? [];
    arr.push(m);
    map.set(m.date, arr);
  }
  const sorted = Array.from(map.entries())
    .map(([date, items]) => ({
      date,
      items: items.slice().sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return sorted;
}

/**
 * Параметри початку зустрічі (Sprint 1.4).
 *
 * `geoManual=true` — користувач ввів адресу вручну (geo capture не вдалось
 * або відмовився), `lat/lon` залишаються `null`. У синхронізації з 1С
 * 1С-розробник може використовувати `geoManual` як ознаку «не довіряти
 * адресі як географічному факту».
 */
export interface MeetingStartPayload {
  address: string;
  lat: number | null;
  lon: number | null;
  geoManual: boolean;
}

/**
 * Іммутабельно змінює статус зустрічі на `in_progress` і фіксує
 * `startLat/Lon/Address`. ADR-7: координати read-only після capture.
 *
 * Повертає новий масив. Якщо id не знайдено — повертає вхідний масив без змін.
 */
export function applyStart(
  meetings: MeetingWithSync[],
  id: string,
  payload: MeetingStartPayload,
): MeetingWithSync[] {
  const now = new Date().toISOString();
  return meetings.map(m =>
    m.id === id
      ? {
          ...m,
          status: 'in_progress' as MeetingStatus,
          startAddress: payload.address,
          startLat: payload.lat,
          startLon: payload.lon,
          geoManual: payload.geoManual,
          updatedAt: now,
          // Sprint 1.5: при реальному buffer-write змінити на 'pending'.
          // Поки моки — лишаємо synced.
        }
      : m,
  );
}

/** Формат labels для day-header. */
export function formatDayLabel(dateStr: string, today: Date): { label: string; isToday: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = toISODate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = toISODate(tomorrow);

  const weekdays = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
  const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const wd = weekdays[date.getDay()];
  const mn = months[date.getMonth()];
  const dn = date.getDate();

  if (dateStr === todayStr) return { label: `Сьогодні · ${wd}, ${String(dn).padStart(2, '0')} ${mn}`, isToday: true };
  if (dateStr === tomorrowStr) return { label: `Завтра · ${wd}, ${String(dn).padStart(2, '0')} ${mn}`, isToday: false };
  return { label: `${String(dn).padStart(2, '0')} ${mn} · ${wd}`, isToday: false };
}
