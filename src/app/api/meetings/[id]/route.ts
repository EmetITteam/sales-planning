/**
 * PATCH /api/meetings/[id] — update / start / finish / cancel зустрічі.
 *
 * `op` у body визначає тип мутації:
 *  - `update`  — поля (date/time/duration/purpose/address/comment/clientId1c)
 *  - `start`   — статус→in_progress + startAddress + startLat/Lon + geoManual
 *  - `finish`  — статус→done + endAddress (опц.) + endLat/Lon (опц.) + comment (опц.)
 *  - `cancel`  — статус→cancelled
 *
 * Auth: ownership перевіряється в repo через `eq('manager_login', session.login)`.
 * Buffer-pattern: кожна мутація → запис у meeting_syncs (status=pending).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import {
  updateMeeting,
  startMeeting,
  finishMeeting,
  type UpdateMeetingPatch,
  type StartMeetingDbInput,
  type FinishMeetingDbInput,
} from '@/lib/meetings/repo';

type Op = 'update' | 'start' | 'finish' | 'cancel';

interface PatchBody {
  op: Op;
  /** Для op=update */
  update?: UpdateMeetingPatch;
  /** Для op=start */
  start?: StartMeetingDbInput;
  /** Для op=finish */
  finish?: FinishMeetingDbInput;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }
  // Зустрічі з 1С (getInitialData) мають свій ID-формат — необов'язково
  // наш UUID. Не блокуємо тут regex-ом, нехай у репозитарії SELECT не
  // знайде такий ID і поверне friendly 404.
  if (!/^[\w-]{1,64}$/.test(id)) {
    return Response.json({ error: 'id has invalid format' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.op) return Response.json({ error: 'op is required' }, { status: 400 });

  switch (body.op) {
    case 'update': {
      if (!body.update) {
        return Response.json({ error: 'update payload required' }, { status: 400 });
      }
      // Нормалізуємо time якщо передано
      const u = { ...body.update };
      if (u.time && u.time.length === 5) u.time = `${u.time}:00`;
      // Якщо клієнт змінився — клієнтське ім'я/телефон з ClientPicker теж
      // передаємо щоб snapshot у БД оновився (інакше залишиться старе).
      const ub = body as PatchBody & { client?: { name?: string; phone?: string; category?: string } };
      if (ub.client) {
        u.clientName = ub.client.name ?? null;
        u.clientPhone = ub.client.phone ?? null;
        u.clientCategory = ub.client.category ?? null;
      }
      const { data, error } = await updateMeeting(session.login, id, u);
      if (error) return Response.json({ error }, { status: error.includes('not found') ? 404 : 500 });
      return Response.json({ meeting: data });
    }
    case 'start': {
      if (!body.start || !body.start.address) {
        return Response.json({ error: 'start.address required' }, { status: 400 });
      }
      const { data, error } = await startMeeting(session.login, id, body.start);
      if (error) return Response.json({ error }, { status: error.includes('not found') ? 404 : 500 });
      return Response.json({ meeting: data });
    }
    case 'finish': {
      const { data, error } = await finishMeeting(session.login, id, body.finish ?? {});
      if (error) return Response.json({ error }, { status: error.includes('not found') ? 404 : 500 });
      return Response.json({ meeting: data });
    }
    case 'cancel': {
      const { data, error } = await updateMeeting(session.login, id, { status: 'cancelled' });
      if (error) return Response.json({ error }, { status: error.includes('not found') ? 404 : 500 });
      return Response.json({ meeting: data });
    }
    default:
      return Response.json({ error: `unknown op: ${String(body.op)}` }, { status: 400 });
  }
}
