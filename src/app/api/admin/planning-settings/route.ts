/**
 * GET  /api/admin/planning-settings — поточні налаштування вікна.
 * PUT  /api/admin/planning-settings — оновити window_days. ADMIN ONLY.
 *
 * Body PUT: { windowDays: number (1-31) }
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

async function readSettings(): Promise<{ window_days: number; updated_at?: string; updated_by?: string } | null> {
  const { data, error } = await supabase.from('planning_settings').select('*').eq('id', 1);
  if (error) return null;
  if (Array.isArray(data) && data.length > 0) return data[0] as { window_days: number };
  return { window_days: 5 }; // fallback (рядок завжди має бути після міграції)
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // Settings можна читати усім авторизованим — банер з вікном корисний всім.
  const s = await readSettings();
  return Response.json({
    windowDays: s?.window_days ?? 5,
    updatedAt: (s as { updated_at?: string })?.updated_at ?? null,
    updatedBy: (s as { updated_by?: string })?.updated_by ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return Response.json({ error: 'Тільки адмін може змінювати window_days' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const days = Number(body?.windowDays);
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    return Response.json({ error: 'windowDays має бути ціле число 1..31' }, { status: 400 });
  }

  // UPSERT singleton row. PostgREST upsert через wrapper.
  const { error } = await supabase.from('planning_settings').upsert(
    {
      id: 1,
      window_days: days,
      updated_at: new Date().toISOString(),
      updated_by: session.login,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[planning-settings PUT] error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true, windowDays: days });
}
