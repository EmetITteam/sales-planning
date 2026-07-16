/**
 * API заміток Тижневого звіту (weekly_report_notes).
 *   GET  ?region=&week=  → усі замітки регіону за тиждень (latest — на клієнті).
 *   POST { region_code, segment_code, week_key, field, text, done? } → нова версія.
 *
 * Доступ по регіону: admin/director/страт — будь-який; РМ/грант — свій(і).
 * Read і write — однакові права (РМ пише свій регіон).
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import { resolveRegionOverrides } from '@/lib/region-access';
import { readNotes, insertNote, type NoteField } from '@/lib/weekly-notes-store';

const FIELDS: NoteField[] = ['action', 'reason', 'conclusion', 'promise_check'];

async function allowedForRegion(
  session: { role: string; login: string; regionCode?: string } | null,
  regionCode: string,
): Promise<boolean> {
  if (!session || !regionCode) return false;
  if (session.role === 'admin' || session.role === 'director') return true;
  if (isStrategicKpiLogin(session.login)) return true;
  // resolveRegionOverrides = MULTI_REGION_RM_OVERRIDES ∪ активні гранти.
  const grantCodes = new Set<string>((await resolveRegionOverrides(session.login)) ?? []);
  // РМ — свій «домашній» регіон + overrides/гранти. Звичайний менеджер (та інші
  // ролі) — ЛИШЕ за активним грантом на цей регіон (домашній регіон не дає прав).
  if (session.role === 'rm') return regionCode === session.regionCode || grantCodes.has(regionCode);
  return grantCodes.has(regionCode);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const region = request.nextUrl.searchParams.get('region') || '';
  const week = request.nextUrl.searchParams.get('week') || '';
  if (!region || !week) return Response.json({ error: 'region + week required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const notes = await readNotes(region, week);
    return Response.json({ notes });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    region_code?: string; segment_code?: string | null; week_key?: string;
    field?: string; text?: string; done?: boolean | null;
  } | null;
  if (!body) return Response.json({ error: 'Bad body' }, { status: 400 });
  const { region_code, segment_code, week_key, field, text, done } = body;
  if (!region_code || !week_key || !field || !FIELDS.includes(field as NoteField)) {
    return Response.json({ error: 'region_code, week_key, valid field required' }, { status: 400 });
  }
  if (!(await allowedForRegion(session, region_code))) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const note = await insertNote({
      region_code,
      segment_code: segment_code ?? null,
      week_key,
      field: field as NoteField,
      text: (text ?? '').slice(0, 4000),
      done: done ?? null,
      author_login: session.login,
    });
    return Response.json({ note });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
