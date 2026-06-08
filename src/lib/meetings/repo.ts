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
import { callOneCServer } from '@/lib/onec-server';
import { mapBufferOpToOneC, type BufferSnapshot } from './sync-mapping';
import {
  adaptMeetingRow,
  toMeetingRowDb,
  type Meeting,
  type MeetingRowDb,
  type MeetingStatus,
  type MeetingSyncOperation,
} from './types';

/**
 * Викликати 1С action синхронно для конкретної операції над зустріччю.
 * Повертає { ok, legacyOneCId } — legacy_1c_id з 1С response для save,
 * або існуючий для update/start/finish.
 *
 * Якщо fail — повертає errorMessage; caller має передати юзеру і НЕ змінювати БД.
 *
 * ⚠️ Це СИНХРОННА передача в 1С: caller (POST/PATCH route) чекає 5-15с.
 * Раніше була buffer-черга через cron, але race window між create і start
 * створював дублі у 1С. Synchronous — як meeting-app робила, без race.
 */
async function sendToOneC(
  operation: MeetingSyncOperation,
  snapshot: BufferSnapshot,
): Promise<{ ok: true; legacyOneCId: string } | { ok: false; error: string }> {
  const spec = mapBufferOpToOneC(operation, snapshot);
  if (!spec) {
    // no-op operation (e.g. майбутні local-only) — вважаємо успішною
    return { ok: true, legacyOneCId: snapshot.legacyOneCId ?? snapshot.id };
  }
  const res = await callOneCServer(spec.action, spec.payload);
  if (!res.ok) {
    return { ok: false, error: res.errorMessage ?? 'unknown 1С error' };
  }
  // Для save 1С повертає legacy_1c_id у data.ID або data.meetingId — потім
  // зберігаємо у meetings.legacy_1c_id. Для update/start/finish ID не змінюється.
  const data = res.data as { ID?: string; meetingId?: string } | null | undefined;
  const returnedId =
    typeof data?.ID === 'string' && data.ID.trim()
      ? data.ID.trim()
      : typeof data?.meetingId === 'string' && data.meetingId.trim()
        ? data.meetingId.trim()
        : null;
  return {
    ok: true,
    legacyOneCId: returnedId ?? snapshot.legacyOneCId ?? snapshot.id,
  };
}

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
  // 1. Згенеруємо наш UUID для зустрічі — буде відправлений у 1С як ID.
  //    1С створить запис під цим ID і поверне legacy_1c_id (свій формат).
  const newId = crypto.randomUUID();

  // 2. Спершу — СИНХРОННИЙ виклик 1С saveNewMeeting. Якщо 1С відмовила —
  //    взагалі НЕ записуємо у БД (інакше дубль на retry).
  const snapshot: BufferSnapshot = {
    id: newId,
    legacyOneCId: null,
    managerLogin,
    clientId1c: input.clientId1c,
    clientName: input.clientName ?? null,
    clientPhone: input.clientPhone ?? null,
    date: input.date,
    time: input.time,
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
  };
  const onec = await sendToOneC('save', snapshot);
  if (!onec.ok) {
    return { data: null, error: `1С: ${onec.error}` };
  }

  // 3. INSERT у БД як кеш — legacy_1c_id вже відомий, race window закритий.
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
    clientNameFromOneC: input.clientName ?? null,
    clientPhoneFromOneC: input.clientPhone ?? null,
  });
  const rowWithId = { ...row, id: newId, legacy_1c_id: onec.legacyOneCId };

  const { data, error } = await supabase
    .from('meetings')
    .insert([rowWithId as Record<string, unknown>])
    .select('*');
  if (error) {
    // 1С створила запис але БД-INSERT впав — критична inconsistency.
    // Лог для розслідування; юзеру повертаємо помилку (1С запис залишиться,
    // bulk-import підтягне на наступний refresh).
    console.error('[meetings/repo] createMeeting: 1С ok but BD INSERT failed', {
      id: newId,
      legacy_1c_id: onec.legacyOneCId,
      error: error.message,
    });
    return { data: null, error: `БД: ${error.message}` };
  }

  const rows = (data ?? []) as unknown as MeetingRowDb[];
  if (rows.length === 0) return { data: null, error: 'no row returned after insert' };
  return { data: adaptMeetingRow(rows[0]), error: null };
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

/** Snapshot з Meeting для 1С — додає transient client name/phone з адаптера
 *  (БД має snapshot з 1С). 1С відмовляє якщо Phone/Client порожні. */
function meetingToSnapshot(m: Meeting): BufferSnapshot {
  return {
    id: m.id,
    legacyOneCId: m.legacyOneCId ?? null,
    managerLogin: m.managerLogin,
    clientId1c: m.clientId1c,
    clientName: m.clientNameFromOneC ?? null,
    clientPhone: m.clientPhoneFromOneC ?? null,
    date: m.date,
    time: m.time,
    durationMin: m.durationMin,
    status: m.status,
    purpose: m.purpose,
    comment: m.comment,
    plannedAddress: m.plannedAddress,
    startAddress: m.startAddress,
    startLat: m.startLat,
    startLon: m.startLon,
    endAddress: m.endAddress,
    endLat: m.endLat,
    endLon: m.endLon,
    geoManual: m.geoManual,
  };
}

export async function updateMeeting(
  managerLogin: string,
  id: string,
  patch: UpdateMeetingPatch,
): Promise<{ data: Meeting | null; error: string | null }> {
  // 1. SELECT existing щоб мати поточний стан (legacy_1c_id + всі snapshot fields).
  //    1С updateMeeting приймає newData + oldData — для diff на стороні 1С.
  const { data: existingData, error: selErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .eq('manager_login', managerLogin);
  if (selErr) return { data: null, error: selErr.message };
  const existing = ((existingData ?? []) as unknown as MeetingRowDb[])[0];
  if (!existing) return { data: null, error: 'meeting not found or not owned' };
  const existingMeeting = adaptMeetingRow(existing);

  // 2. Будуємо новий стан (merge patch over existing) для 1С payload.
  const mergedSnapshot = meetingToSnapshot({
    ...existingMeeting,
    clientId1c: patch.clientId1c ?? existingMeeting.clientId1c,
    clientNameFromOneC: patch.clientName ?? existingMeeting.clientNameFromOneC,
    clientPhoneFromOneC: patch.clientPhone ?? existingMeeting.clientPhoneFromOneC,
    clientCategoryFromOneC: patch.clientCategory ?? existingMeeting.clientCategoryFromOneC,
    date: patch.date ?? existingMeeting.date,
    time: patch.time ?? existingMeeting.time,
    durationMin: patch.durationMin ?? existingMeeting.durationMin,
    purpose: patch.purpose ?? existingMeeting.purpose,
    comment: patch.comment ?? existingMeeting.comment,
    plannedAddress: patch.plannedAddress ?? existingMeeting.plannedAddress,
    status: patch.status ?? existingMeeting.status,
  });

  // 3. Синхронний 1С виклик. Якщо fail — НЕ оновлюємо БД (зберігаємо consistency).
  const onec = await sendToOneC('update', mergedSnapshot);
  if (!onec.ok) return { data: null, error: `1С: ${onec.error}` };

  // 4. UPDATE БД після успішного 1С.
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
  return patchOwned(managerLogin, id, dbPatch);
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
  // SELECT existing щоб мати legacy_1c_id (1С startMeeting вимагає 1С-ID).
  const { data: existingData, error: selErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .eq('manager_login', managerLogin);
  if (selErr) return { data: null, error: selErr.message };
  const existing = ((existingData ?? []) as unknown as MeetingRowDb[])[0];
  if (!existing) return { data: null, error: 'meeting not found or not owned' };
  const existingMeeting = adaptMeetingRow(existing);

  // Як у meeting-app: при START фізичний час зустрічі замінюється на реальний.
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

  // Synchronous 1С call. legacyOneCId — як snapshot, бо start payload
  // повинен містити фактичний 1С-ID, не наш UUID.
  const snapshot = meetingToSnapshot({
    ...existingMeeting,
    status: 'in_progress',
    date: startDate,
    time: startTime,
    startAddress: payload.address,
    startLat: payload.lat,
    startLon: payload.lon,
    geoManual: payload.geoManual,
    startedAt: now.toISOString(),
  });
  const onec = await sendToOneC('start', snapshot);
  if (!onec.ok) return { data: null, error: `1С: ${onec.error}` };

  // UPDATE БД після успішного 1С виклику.
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
  return patchOwned(managerLogin, id, patch);
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
  const { data: existingData, error: selErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .eq('manager_login', managerLogin);
  if (selErr) return { data: null, error: selErr.message };
  const existing = ((existingData ?? []) as unknown as MeetingRowDb[])[0];
  if (!existing) return { data: null, error: 'meeting not found or not owned' };
  const existingMeeting = adaptMeetingRow(existing);

  const now = new Date();
  const snapshot = meetingToSnapshot({
    ...existingMeeting,
    status: 'done',
    endAddress: payload.address ?? existingMeeting.endAddress,
    endLat: payload.lat ?? existingMeeting.endLat,
    endLon: payload.lon ?? existingMeeting.endLon,
    comment: payload.comment ?? existingMeeting.comment,
    geoManual: payload.geoManual === true ? true : existingMeeting.geoManual,
    finishedAt: now.toISOString(),
  });
  const onec = await sendToOneC('finish', snapshot);
  if (!onec.ok) return { data: null, error: `1С: ${onec.error}` };

  const patch = toMeetingRowDb({
    status: 'done',
    endAddress: payload.address ?? null,
    endLat: payload.lat ?? null,
    endLon: payload.lon ?? null,
    comment: payload.comment ?? undefined,
    geoManual: payload.geoManual === true ? true : undefined,
    finishedAt: now.toISOString(),
  });
  return patchOwned(managerLogin, id, patch);
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
