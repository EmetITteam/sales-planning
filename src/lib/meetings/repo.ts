/**
 * Meetings repository — централізована точка доступу до `meetings` + `meeting_syncs`
 * (Sprint 1.5.1).
 *
 * Чому через repo, а не напряму у API routes:
 *  - Один-і-тільки-один шар де гарантована перевірка ownership (`manager_login`).
 *    Якщо забути `.eq('manager_login', login)` у route — leak. Тут це у єдиному
 *    місці і покрите тестами.
 *  - Buffer-pattern (ADR-2 + ADR-6): кожна мутація = `INSERT INTO meeting_syncs`
 *    зі статусом `pending`. Cron-worker (Sprint 1.5.3) їх вичитує і шле у 1С
 *    (відповідні actions `saveNewMeeting`/`updateMeeting`/`startMeeting`).
 *  - snake_case ↔ camelCase адаптація — через `adaptMeetingRow` з types.ts.
 *
 * ⚠️ Service role: usage current `supabase` client → BYPASS RLS. Тому ownership
 * check у коді — обов'язковий. RLS лишається у shadow-mode.
 */

import { supabase } from '@/lib/supabase';
import {
  adaptMeetingRow,
  toMeetingRowDb,
  type Meeting,
  type MeetingRowDb,
  type MeetingStatus,
  type MeetingSyncOperation,
} from './types';

// ============================================================================
// LIST
// ============================================================================

export interface ListMeetingsOptions {
  /** ISO YYYY-MM-DD. Inclusive. */
  dateFrom?: string;
  /** ISO YYYY-MM-DD. Inclusive. */
  dateTo?: string;
  /** Hard cap на повернений масив. Default 500. */
  limit?: number;
  /** Якщо передано — SELECT WHERE manager_login IN (...). Для admin/RM
   *  expand на managedUsers. Інакше — лише managerLogin з першого аргументу. */
  managerLogins?: string[];
}

/**
 * Список зустрічей менеджера. Фільтр по manager_login обов'язковий — без нього
 * запит не запускається (захист від випадкового leak).
 */
export async function listMeetings(
  managerLogin: string,
  opts: ListMeetingsOptions = {},
): Promise<{ data: Meeting[]; error: string | null }> {
  if (!managerLogin || !managerLogin.includes('@')) {
    return { data: [], error: 'managerLogin required' };
  }

  // PostgREST-wrapper не має .gte()/.lte() helpers — тягнемо все для менеджера(ів),
  // фільтруємо range у пам'яті. Для production-розмірів (1 менеджер ~50-200
  // meetings) це швидко.
  const logins = opts.managerLogins && opts.managerLogins.length > 0
    ? opts.managerLogins
    : [managerLogin];
  const q = supabase.from('meetings').select('*').in('manager_login', logins);
  const { data, error } = await q.order('date', { ascending: true }).order('time', { ascending: true });
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as unknown as MeetingRowDb[];
  let meetings = rows.map(adaptMeetingRow);

  if (opts.dateFrom) meetings = meetings.filter(m => m.date >= opts.dateFrom!);
  if (opts.dateTo) meetings = meetings.filter(m => m.date <= opts.dateTo!);
  if (opts.limit) meetings = meetings.slice(0, opts.limit);

  return { data: meetings, error: null };
}

// ============================================================================
// CREATE
// ============================================================================

export interface CreateMeetingInput {
  clientId1c: string;
  /** Display name + phone клієнта — транзитні (НЕ зберігаються у БД).
   *  Використовуються тільки у snapshot для saveNewMeeting payload —
   *  1С CRM Модулі вимагають Client + Phone у payload. */
  clientName?: string | null;
  clientPhone?: string | null;
  date: string;
  time: string;
  durationMin: number | null;
  purpose: string | null;
  comment: string | null;
  plannedAddress: string | null;
}

export async function createMeeting(
  managerLogin: string,
  input: CreateMeetingInput,
): Promise<{ data: Meeting | null; error: string | null }> {
  const row = toMeetingRowDb({
    managerLogin,
    clientId1c: input.clientId1c,
    date: input.date,
    time: input.time,
    durationMin: input.durationMin,
    status: 'planned',
    purpose: input.purpose,
    comment: input.comment,
    plannedAddress: input.plannedAddress,
    geoManual: false,
  });

  const { data, error } = await supabase
    .from('meetings')
    .insert([row as Record<string, unknown>])
    .select('*');
  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as unknown as MeetingRowDb[];
  if (rows.length === 0) return { data: null, error: 'no row returned after insert' };
  const meeting = adaptMeetingRow(rows[0]);

  // Snapshot include транзитні поля з input (БД-зберігаються тільки persisted).
  await enqueueSync(meeting.id, 'save', {
    ...meeting,
    clientName: input.clientName ?? null,
    clientPhone: input.clientPhone ?? null,
  });
  return { data: meeting, error: null };
}

// ============================================================================
// UPDATE / START / FINISH
// ============================================================================

export interface UpdateMeetingPatch {
  clientId1c?: string;
  /** Snapshot fields що мають оновитись при зміні клієнта (інакше у БД
   *  залишиться name старого). Якщо undefined — не міняємо. */
  clientName?: string | null;
  clientPhone?: string | null;
  clientCategory?: string | null;
  date?: string;
  time?: string;
  durationMin?: number | null;
  purpose?: string | null;
  comment?: string | null;
  plannedAddress?: string | null;
  status?: MeetingStatus;
}

/**
 * Atomic UPDATE: PATCH /meetings?id=eq.X&manager_login=eq.Y з Prefer:
 * return=representation. Якщо ownership не пройшов — PostgREST повертає
 * порожній array, ми → 404. Запобігає race condition коли два паралельні
 * PATCH-и (Start+Finish) переписували один одного (last-write-wins).
 */
async function patchOwned(
  managerLogin: string,
  id: string,
  patch: Partial<MeetingRowDb>,
): Promise<{ data: Meeting | null; error: string | null }> {
  const { data, error } = await supabase
    .from('meetings')
    .eq('id', id)
    .eq('manager_login', managerLogin)
    .update({ ...patch, updated_at: new Date().toISOString() } as Record<string, unknown>);
  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as unknown as MeetingRowDb[];
  if (rows.length === 0) {
    return { data: null, error: 'meeting not found or not owned' };
  }
  return { data: adaptMeetingRow(rows[0]), error: null };
}

/** Snapshot з Meeting для enqueueSync — додає transient client name/phone
 *  з адаптера (БД має snapshot з 1С). 1С відмовляє якщо Phone/Client порожні. */
function meetingToSnapshot(m: Meeting): Record<string, unknown> {
  return {
    ...m,
    clientName: m.clientNameFromOneC ?? null,
    clientPhone: m.clientPhoneFromOneC ?? null,
  };
}

export async function updateMeeting(
  managerLogin: string,
  id: string,
  patch: UpdateMeetingPatch,
): Promise<{ data: Meeting | null; error: string | null }> {
  const dbPatch = toMeetingRowDb({
    clientId1c: patch.clientId1c,
    clientNameFromOneC: patch.clientName,
    clientPhoneFromOneC: patch.clientPhone,
    clientCategoryFromOneC: patch.clientCategory,
    date: patch.date,
    time: patch.time,
    durationMin: patch.durationMin,
    purpose: patch.purpose,
    comment: patch.comment,
    plannedAddress: patch.plannedAddress,
    status: patch.status,
  });
  const res = await patchOwned(managerLogin, id, dbPatch);
  if (res.data) await enqueueSync(id, 'update', meetingToSnapshot(res.data));
  return res;
}

export interface StartMeetingDbInput {
  address: string;
  lat: number | null;
  lon: number | null;
  geoManual: boolean;
}

export async function startMeeting(
  managerLogin: string,
  id: string,
  payload: StartMeetingDbInput,
): Promise<{ data: Meeting | null; error: string | null }> {
  // Як у meeting-app: при START фізичний час зустрічі замінюється на реальний.
  // Vercel server у UTC, а нам треба Київ (UTC+2/+3 з літнім часом).
  // Використовуємо toLocaleString з timeZone='Europe/Kyiv' — js автоматично
  // враховує DST (літо/зима).
  const now = new Date();
  const kyivParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => kyivParts.find(p => p.type === type)?.value ?? '00';
  const startDate = `${get('year')}-${get('month')}-${get('day')}`;
  const startTime = `${get('hour')}:${get('minute')}:${get('second')}`;
  const patch = toMeetingRowDb({
    status: 'in_progress',
    date: startDate,
    time: startTime,
    startAddress: payload.address,
    startLat: payload.lat,
    startLon: payload.lon,
    geoManual: payload.geoManual,
    startedAt: now.toISOString(),
  });
  const res = await patchOwned(managerLogin, id, patch);
  if (res.data) await enqueueSync(id, 'start', meetingToSnapshot(res.data));
  return res;
}

export interface FinishMeetingDbInput {
  address?: string;
  lat?: number | null;
  lon?: number | null;
  comment?: string | null;
  /**
   * true якщо адресу finish ввели вручну. ADR-7: один `geo_manual` прапор на
   * рядок — апгрейдиться у true якщо хоч раз був manual (start АБО finish).
   */
  geoManual?: boolean;
}

export async function finishMeeting(
  managerLogin: string,
  id: string,
  payload: FinishMeetingDbInput = {},
): Promise<{ data: Meeting | null; error: string | null }> {
  const now = new Date();
  const patch = toMeetingRowDb({
    status: 'done',
    endAddress: payload.address ?? null,
    endLat: payload.lat ?? null,
    endLon: payload.lon ?? null,
    comment: payload.comment ?? undefined,
    // Тільки upgrade у true. Якщо start був GPS а finish manual — geoManual=true.
    // Якщо обидва GPS — patch не міняє існуюче значення (не передаємо).
    geoManual: payload.geoManual === true ? true : undefined,
    finishedAt: now.toISOString(),
  });
  const res = await patchOwned(managerLogin, id, patch);
  if (res.data) await enqueueSync(id, 'finish', meetingToSnapshot(res.data));
  return res;
}

// ============================================================================
// BUFFER-WRITE (enqueue sync)
// ============================================================================

/**
 * Записати рядок у `meeting_syncs` зі статусом `pending`. Cron-worker
 * (Sprint 1.5.3) їх вичитує і шле у 1С.
 *
 * Якщо INSERT failed — лише логуємо. Користувацька операція вже успішна
 * (meeting у БД), і worker зможе виявити inconsistency через окремий
 * reconciliation-pass (Sprint 1.5.x). Кидати помилку юзеру за збій
 * audit-trail — нечесно: він не може це виправити.
 */
export async function enqueueSync(
  meetingId: string,
  operation: MeetingSyncOperation,
  payload: Meeting | Record<string, unknown>,
): Promise<void> {
  const row = {
    meeting_id: meetingId,
    operation,
    status: 'pending' as const,
    payload_snapshot: payload as unknown as Record<string, unknown>,
    retry_count: 0,
  };
  const { error } = await supabase.from('meeting_syncs').insert([row]);
  if (error) {
    console.error('[meetings/repo] enqueueSync failed', {
      meetingId,
      operation,
      reason: error.message,
    });
  }
}
