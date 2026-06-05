/**
 * POST /api/meetings/sync-from-1c — bulk-import зустрічей з 1С у нашу БД.
 *
 * 1С — джерело істини, наша БД — кеш для швидкого доступу. Цей endpoint
 * приймає масив 1С-зустрічей (як вони приходять з getInitialData) і upsert-ить
 * їх у нашу БД через legacy_1c_id як secondary unique key.
 *
 * Ідемпотентний: повторні виклики з тими ж 1С-ID — no-op (ON CONFLICT
 * DO NOTHING). Наш UUID детермінований через md5(legacy_1c_id) — той самий
 * legacy ID завжди дає той самий UUID, тож фронт у localOverlay не лишається
 * з застарілими UUIDs при re-fetch.
 *
 * Permissions: будь-який залогінений юзер. Імпорт обмежений managerLogin'ом
 * з payload (security: менеджер не може імпортувати чужі зустрічі —
 * `managerLogin` override з сесії).
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { adaptOneCMeeting, type OneCMeetingRow } from '@/lib/meetings/onec-adapter';
import { toMeetingRowDb } from '@/lib/meetings/types';

/** Детермінований UUID для legacy 1С-ID. Той самий legacy → той самий UUID. */
function legacyToUUID(legacyId: string): string {
  const h = createHash('md5').update('emet:meeting:' + legacyId).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

interface BulkImportBody {
  meetings: OneCMeetingRow[];
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: BulkImportBody;
  try {
    body = (await request.json()) as BulkImportBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.meetings)) {
    return Response.json({ error: 'meetings array required' }, { status: 400 });
  }

  const rows = body.meetings.filter(m => m.ID && m.ClientID && m.Date && m.Time);
  if (rows.length === 0) {
    return Response.json({ imported: 0, skipped: 0 });
  }

  // SECURITY: менеджер може імпортувати тільки СВОЇ зустрічі.
  // Admin/Director — будь-чиї (адміни бачать чужих менеджерів).
  // Для не-admin фільтруємо meetings по managerLogin (ManagerLogin у payload).
  const isAdminOrDirector = session.role === 'admin' || session.role === 'director';
  const filtered = isAdminOrDirector
    ? rows
    : rows.filter(m => {
        const mgr = (m.ManagerLogin ?? '').toLowerCase().trim();
        if (!mgr) return false;
        return mgr === session.login.toLowerCase().trim()
          || session.managedUsers.includes(mgr);
      });

  if (filtered.length === 0) {
    return Response.json({ imported: 0, skipped: rows.length });
  }

  // Будуємо row[] для upsert. ID = детермінований UUID з legacy_1c_id.
  const dbRows = filtered.map(raw => {
    const adapted = adaptOneCMeeting(raw);
    const legacyId = raw.ID as string;
    const dbRow = toMeetingRowDb({
      managerLogin: adapted.managerLogin,
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
    });
    return {
      ...dbRow,
      id: legacyToUUID(legacyId),
      legacy_1c_id: legacyId,
    } as Record<string, unknown>;
  });

  // ON CONFLICT (legacy_1c_id) DO NOTHING — idempotent. Якщо вже у БД,
  // не перетираємо (admin міг локально cancel-нути → не повертати planned).
  // Sync-cron потім перепише зустріч у 1С з нашим статусом.
  const { error } = await supabase
    .from('meetings')
    .upsert(dbRows, { onConflict: 'legacy_1c_id', ignoreDuplicates: true });

  if (error) {
    console.error('[sync-from-1c] upsert failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    imported: dbRows.length,
    skipped: rows.length - filtered.length,
  });
}
