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
import { createHash } from 'node:crypto';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { listMeetings, createMeeting } from '@/lib/meetings/repo';
import { callOneCServer } from '@/lib/onec-server';
import { supabase } from '@/lib/supabase';
import { adaptOneCMeeting, type OneCMeetingRow } from '@/lib/meetings/onec-adapter';
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

    const dbRows = rows.map(raw => {
      const adapted = adaptOneCMeeting(raw);
      const legacyId = raw.ID as string;
      // Якщо 1С повернула UUID — це наша зустріч (saveNewMeeting шле наш UUID
      // як ID, 1С зберігає під тим же). Використовуємо його як id у БД, щоб
      // оновити existing row, а не створити дубль через md5-hash.
      const ourId = isUUID(legacyId) ? legacyId.toLowerCase() : legacyToUUID(legacyId);
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
      });
      return {
        ...dbRow,
        id: ourId,
        legacy_1c_id: legacyId,
      } as Record<string, unknown>;
    });

    // INSERT нових rows ON CONFLICT (id) DO NOTHING — не перетирає локальні
    // зміни статусу/коментарів. Якщо id (= 1С-ID для existing-наших) уже у БД
    // — пропускаємо INSERT, оновимо snapshot окремим UPDATE нижче.
    const { error: insErr } = await supabase
      .from('meetings')
      .upsert(dbRows, { onConflict: 'id', ignoreDuplicates: true });
    if (insErr) {
      console.warn('[/api/meetings] bulk-import upsert failed:', insErr.message);
      return { imported: 0, failed: true };
    }

    // Окремо ОНОВЛЮЄМО snapshot-поля для existing rows (manager_login +
    // client_name/phone/category + legacy_1c_id). Це безпечно бо ці поля —
    // display-only, не торкають local status/comment. legacy_1c_id оновлюємо
    // окремо щоб старі наші зустрічі (legacy_1c_id=NULL до Phase 2) отримали
    // mapping і не дублювались при наступному bulk-import.
    let updateErrors = 0;
    for (const row of dbRows) {
      const { error: upErr } = await supabase
        .from('meetings')
        .eq('id', row.id as string)
        .update({
          manager_login: row.manager_login,
          legacy_1c_id: row.legacy_1c_id,
          client_name: row.client_name,
          client_phone: row.client_phone,
          client_category: row.client_category,
        });
      if (upErr) updateErrors++;
    }
    if (updateErrors > 0) {
      console.warn(`[/api/meetings] bulk-import: ${updateErrors}/${dbRows.length} snapshot-updates failed`);
    }

    return { imported: dbRows.length, failed: false };
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

  // Паралельно: bulk-import з 1С (background, silent fail) + list нашої БД.
  // Так зустрічі з 1С (legacy / sync через cron) одразу попадають у наш кеш,
  // а listMeetings бачить як старі, так і новоімпортовані.
  if (dateFrom && dateTo) {
    await syncFromOneC(session.login, dateFrom, dateTo);
  }

  const { data, error } = await listMeetings(session.login, {
    dateFrom,
    dateTo,
    limit: Number.isFinite(limit) ? limit : 500,
  });
  if (error) return Response.json({ error }, { status: 500 });
  return Response.json({ meetings: data });
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
