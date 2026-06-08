/**
 * GET /api/meetings?from=YYYY-MM-DD&to=YYYY-MM-DD — список зустрічей менеджера.
 * POST /api/meetings — створити зустріч.
 *
 * Auth: ownership по `manager_login = session.login` (service role обходить
 * RLS — фільтр обов'язковий, робимо у `repo.ts`).
 *
 * Buffer-pattern: кожне створення → запис у `meeting_syncs` (status=pending).
 * Cron-worker (Sprint 1.5.3) їх вичитує і шле у 1С через `saveNewMeeting`.
 */

import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { createHash } from 'node:crypto';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { listMeetings, createMeeting } from '@/lib/meetings/repo';
import { callOneCServer } from '@/lib/onec-server';
import { supabase } from '@/lib/supabase';
import { adaptOneCMeeting, normalizeDate, type OneCMeetingRow } from '@/lib/meetings/onec-adapter';
import { toMeetingRowDb } from '@/lib/meetings/types';

/** Детермінований UUID з legacy 1С-ID (md5-based). Той самий ID завжди
 *  дає той самий UUID між запусками — щоб ID меetings у фронт-кеші був стабільний. */
function legacyToUUID(legacyId: string): string {
  const h = createHash('md5').update('emet:meeting:' + legacyId).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** UUID-формат? Якщо так — це наша зустріч що повернулася з 1С після cron-sync
 *  (saveNewMeeting шле наш UUID як ID, 1С зберігає під ним). Тоді в БД row
 *  з тим же id уже існує — треба тільки оновити legacy_1c_id + snapshot, а не
 *  створювати дубль через md5-hash. */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Background bulk-import зустрічей з 1С у нашу БД. Зустрічі з 1С —
 * legacy (через Митинг) або щойно sync-нуті через наш cron — попадають у БД
 * з детермінованими UUID + legacy_1c_id. ON CONFLICT DO NOTHING — idempotent.
 *
 * Якщо 1С впала — silent error (наша БД ще має локальні зустрічі).
 */
async function syncFromOneC(
  managerLogin: string,
  startDateString: string,
  endDateString: string,
): Promise<{ imported: number; failed: boolean }> {
  try {
    const r = await callOneCServer<{ meetings?: OneCMeetingRow[] }>('getInitialData', {
      login: managerLogin,
      startDateString,
      endDateString,
    });
    if (!r.ok || !r.data?.meetings) return { imported: 0, failed: true };
    const rows = r.data.meetings.filter(m => m.ID && m.ClientID && m.Date && m.Time);
    if (rows.length === 0) return { imported: 0, failed: false };

    // === Stage 1: знайти existing rows менеджера за цей день ===
    // Це покриває обидва race кейси:
    //  1. Наша зустріч щойно sync-нулась у 1С → legacy_1c_id ще NULL у нас.
    //     1С повертає її з нашим UUID. Matching by id саме спрацює.
    //  2. 1С згенерувала свій ID (legacy formats типу "0000001271320260604")
    //     для нашої зустрічі. Matching by id не спрацює, але fuzzy
     //    (manager_login, client_id_1c, date, time) знайде → оновимо legacy_1c_id.
    const datesSet = new Set(rows.map(r => normalizeDate(r.Date)).filter(Boolean));
    const dates = Array.from(datesSet);
    const { data: existingRaw } = await supabase
      .from('meetings')
      .select('id,legacy_1c_id,manager_login,client_id_1c,date,time')
      .eq('manager_login', managerLogin)
      .in('date', dates);
    const existing = (existingRaw ?? []) as Array<{
      id: string;
      legacy_1c_id: string | null;
      manager_login: string;
      client_id_1c: string;
      date: string;
      time: string;
    }>;
    const existingById = new Map(existing.map(e => [e.id, e]));
    const existingByLegacy = new Map(
      existing.filter(e => e.legacy_1c_id).map(e => [e.legacy_1c_id as string, e]),
    );
    const matchFuzzy = (clientId: string, date: string, time: string) =>
      existing.find(
        e =>
          !e.legacy_1c_id &&
          e.client_id_1c === clientId &&
          e.date === date &&
          e.time.slice(0, 5) === time.slice(0, 5),
      );

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Array<{ id: string; legacy_1c_id: string; patch: Record<string, unknown> }> = [];

    for (const raw of rows) {
      const adapted = adaptOneCMeeting(raw);
      const legacyId = raw.ID as string;
      const ourId = isUUID(legacyId) ? legacyId.toLowerCase() : legacyToUUID(legacyId);

      // Stage 2: matching priority — legacy_1c_id, потім id (UUID), потім fuzzy
      const existingRow =
        existingByLegacy.get(legacyId) ??
        existingById.get(ourId) ??
        matchFuzzy(adapted.clientId1c, adapted.date, adapted.time);

      const dbRow = toMeetingRowDb({
        managerLogin: adapted.managerLogin || managerLogin,
        clientId1c: adapted.clientId1c,
        date: adapted.date,
        time: adapted.time,
        durationMin: adapted.durationMin,
        status: adapted.status,
        purpose: adapted.purpose,
        comment: adapted.comment,
        plannedAddress: adapted.plannedAddress,
        startAddress: adapted.startAddress,
        startLat: adapted.startLat,
        startLon: adapted.startLon,
        endAddress: adapted.endAddress,
        endLat: adapted.endLat,
        endLon: adapted.endLon,
        geoManual: adapted.geoManual,
        clientNameFromOneC: adapted.clientNameFromOneC,
        clientPhoneFromOneC: adapted.clientPhoneFromOneC,
        clientCategoryFromOneC: adapted.clientCategoryFromOneC,
        anketaDataJson: adapted.anketaDataJson,
      });

      if (existingRow) {
        // UPDATE: оновлюємо тільки safe snapshot fields (manager_login + name/
        // phone/category + anketa_data_json + legacy_1c_id). Local статус/
        // коментар/start_*/end_* не торкаємо — це local user state.
        toUpdate.push({
          id: existingRow.id,
          legacy_1c_id: legacyId,
          patch: {
            manager_login: dbRow.manager_login,
            client_name: dbRow.client_name,
            client_phone: dbRow.client_phone,
            client_category: dbRow.client_category,
            anketa_data_json: dbRow.anketa_data_json,
            legacy_1c_id: legacyId,
          },
        });
      } else {
        // INSERT новий запис
        toInsert.push({ ...dbRow, id: ourId, legacy_1c_id: legacyId });
      }
    }

    // Stage 3: bulk INSERT для нових. ON CONFLICT (id) DO NOTHING на випадок
    // повторного запиту (idempotency).
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('meetings')
        .upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true });
      if (insErr) {
        console.warn('[/api/meetings] bulk-import insert failed:', insErr.message);
        return { imported: 0, failed: true };
      }
    }

    // Stage 4: оновлюємо existing rows. Per-row UPDATE (PostgREST не має
    // batch update). N HTTP-ів — для 50-200 meetings/день це ~200ms total.
    // P2 у backlog: переписати на single UPDATE FROM VALUES через RPC.
    for (const u of toUpdate) {
      await supabase
        .from('meetings')
        .eq('id', u.id)
        .eq('manager_login', managerLogin) // ownership-guard
        .update(u.patch);
    }

    return { imported: toInsert.length + toUpdate.length, failed: false };
  } catch (e) {
    console.warn('[/api/meetings] bulk-import error:', (e as Error).message);
    return { imported: 0, failed: true };
  }
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const dateFrom = searchParams.get('from') ?? undefined;
  const dateTo = searchParams.get('to') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? '500');

  // bulk-import з 1С — NON-BLOCKING через `next/server.after`. Користувач
  // не чекає 30с на холодне 1С — отримує snapshot з БД одразу. Нові зустрічі
  // з'являться на наступному poll/F5 (60с refreshInterval у useMeetings).
  //
  // ⚠️ Раніше було fire-and-forget `.catch()`. На Vercel serverless це
  // означало що runtime kill-ить async-роботу одразу після response — і
  // bulk-import з 1С НЕ дописувався у БД. `after()` гарантує що runtime
  // дочекається завершення background-роботи перед kill.
  if (dateFrom && dateTo) {
    const login = session.login;
    const from = dateFrom;
    const to = dateTo;
    after(async () => {
      try {
        await syncFromOneC(login, from, to);
      } catch (e) {
        console.warn('[/api/meetings] background sync failed:', (e as Error).message);
      }
    });
  }

  // P1 #12: admin/director бачать СВОЇ + managedUsers. РМ — те саме.
  // Менеджер — тільки свої.
  const targetLogins = session.role === 'admin' || session.role === 'director'
    ? [session.login, ...session.managedUsers]
    : session.role === 'rm'
      ? [session.login, ...session.managedUsers]
      : [session.login];

  const { data, error } = await listMeetings(session.login, {
    dateFrom,
    dateTo,
    limit: Number.isFinite(limit) ? limit : 500,
    managerLogins: targetLogins,
  });
  if (error) return Response.json({ error }, { status: 500 });

  // P1 #11: тягнемо meeting_syncs зі статусом failed/pending для цих зустрічей —
  // щоб UI міг показати failed badge ("Не синхр."). Інакше syncStatus у всіх
  // server-fetched завжди 'synced'.
  const meetingIds = (data ?? []).map(m => m.id);
  const syncMap = new Map<string, 'pending' | 'syncing' | 'synced' | 'failed'>();
  if (meetingIds.length > 0) {
    const { data: syncRows } = await supabase
      .from('meeting_syncs')
      .select('meeting_id,status')
      .in('meeting_id', meetingIds);
    const rows = (syncRows ?? []) as Array<{ meeting_id: string; status: string }>;
    for (const r of rows) {
      // Priority: failed > pending > syncing > synced. Бо одна meeting може мати
      // кілька sync rows (save → update → ...).
      const cur = syncMap.get(r.meeting_id);
      const newStatus = r.status as 'pending' | 'syncing' | 'synced' | 'failed';
      const rank = (s?: string) => (s === 'failed' ? 4 : s === 'pending' ? 3 : s === 'syncing' ? 2 : 1);
      if (!cur || rank(newStatus) > rank(cur)) {
        syncMap.set(r.meeting_id, newStatus);
      }
    }
  }
  const meetingsWithSync = (data ?? []).map(m => ({
    ...m,
    syncStatus: syncMap.get(m.id) ?? 'synced',
  }));

  return Response.json({ meetings: meetingsWithSync });
}

interface CreateBody {
  clientId1c: string;
  /** Display name + phone — НЕ зберігаємо у БД, але прокидаємо у snapshot
   *  для saveNewMeeting payload (1С вимагає). */
  clientName?: string;
  clientPhone?: string;
  date: string;
  time: string;
  durationMin: number | null;
  purpose: string | null;
  comment: string | null;
  plannedAddress: string | null;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const required: Array<keyof CreateBody> = ['clientId1c', 'date', 'time'];
  for (const k of required) {
    if (!body[k]) return Response.json({ error: `${k} is required` }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(body.time)) {
    return Response.json({ error: 'time must be HH:MM[:SS]' }, { status: 400 });
  }
  // Нормалізуємо time у HH:MM:SS — Postgres time-column приймає обидва, але
  // для consistency у моделі — секунди завжди є.
  const time = body.time.length === 5 ? `${body.time}:00` : body.time;

  const { data, error } = await createMeeting(session.login, {
    clientId1c: body.clientId1c,
    clientName: body.clientName ?? null,
    clientPhone: body.clientPhone ?? null,
    date: body.date,
    time,
    durationMin: body.durationMin ?? null,
    purpose: body.purpose ?? null,
    comment: body.comment ?? null,
    plannedAddress: body.plannedAddress ?? null,
  });
  if (error) return Response.json({ error }, { status: 500 });
  return Response.json({ meeting: data }, { status: 201 });
}
