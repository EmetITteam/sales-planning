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
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { listMeetings, createMeeting } from '@/lib/meetings/repo';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const dateFrom = searchParams.get('from') ?? undefined;
  const dateTo = searchParams.get('to') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? '500');

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
