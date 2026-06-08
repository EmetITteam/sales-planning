/**
 * POST /api/meetings/check-conflict — попередження про overlapping зустрічі.
 *
 * Перевіряє чи у менеджера на ту саму дату+час уже запланована (planned)
 * або у роботі (in_progress) зустріч. Повертає {hasConflict, conflicts[]}.
 *
 * Frontend використовує у MeetingForm перед save і у RescheduleDialog
 * перед confirm — показує warning банер «о 10:00 вже зустріч з [клієнт]».
 *
 * Не блокує save — це попередження. Менеджер може все одно зберегти
 * (іноді overlap навмисний — два маленькі дзвінки підряд).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { adaptMeetingRow, type MeetingRowDb } from '@/lib/meetings/types';

interface CheckBody {
  date: string;
  time: string;
  durationMin: number | null;
  /** Якщо це reschedule/edit — exclude цей ID з перевірки (інакше сам себе детектує). */
  excludeId?: string;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CheckBody;
  try {
    body = (await request.json()) as CheckBody;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.date || !body.time) {
    return Response.json({ hasConflict: false, conflicts: [] });
  }

  const newStart = timeToMinutes(body.time);
  if (newStart === null) {
    return Response.json({ hasConflict: false, conflicts: [] });
  }
  const newEnd = newStart + Math.max(0, body.durationMin ?? 45);

  // Тягнемо всі активні зустрічі менеджера на ту саму дату.
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('manager_login', session.login)
    .eq('date', body.date)
    .in('status', ['planned', 'in_progress']);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as MeetingRowDb[];
  const conflicts = rows
    .map(adaptMeetingRow)
    .filter(m => {
      if (body.excludeId && m.id === body.excludeId) return false;
      const start = timeToMinutes(m.time);
      if (start === null) return false;
      const end = start + Math.max(0, m.durationMin ?? 45);
      // Overlap: newStart < end AND start < newEnd
      return newStart < end && start < newEnd;
    });

  return Response.json({
    hasConflict: conflicts.length > 0,
    conflicts: conflicts.map(c => ({
      id: c.id,
      time: c.time.slice(0, 5),
      clientName: c.clientNameFromOneC || c.clientId1c,
      durationMin: c.durationMin,
    })),
  });
}

function timeToMinutes(time: string): number | null {
  const m = time.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
