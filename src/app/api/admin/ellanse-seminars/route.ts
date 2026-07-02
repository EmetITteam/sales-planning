/**
 * GET  /api/admin/ellanse-seminars?year=2026 — список фактичних семінарів на рік
 * POST /api/admin/ellanse-seminars — upsert 1 запис (year × month × location)
 *
 * Admin only. Ставиться вручну — по дистриб'юторам 1С даних немає.
 *
 * Створено 2026-07-02.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import { ELLANSE_DISTRIBUTOR_LOCATIONS, type EllanseDistributorLocation } from '@/lib/strategic-kpi/brands';

interface SeminarActualRow {
  id: number;
  year: number;
  month: number;
  location: EllanseDistributorLocation;
  seminars_held: number;
  new_trained: number | null;
  notes: string | null;
  updated_at: string;
  updated_by: string;
}

async function requireAdmin(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return { error: Response.json({ error: auth.error }, { status: 401 }) };
  const session = await getSession();
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminLogin(session.login)) {
    return { error: Response.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const result = await supabase
    .from('ellanse_seminars_actual')
    .select('*')
    .eq('year', year);

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }
  const rows = (result.data as unknown as SeminarActualRow[]) ?? [];
  return Response.json({ year, seminars: rows });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { year, month, location } = body ?? {};

  if (!Number.isFinite(year) || year < 2025 || year > 2100) {
    return Response.json({ error: 'year must be 2025-2100' }, { status: 400 });
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return Response.json({ error: 'month must be 1-12' }, { status: 400 });
  }
  if (!ELLANSE_DISTRIBUTOR_LOCATIONS.includes(location as EllanseDistributorLocation)) {
    return Response.json({ error: `location must be one of: ${ELLANSE_DISTRIBUTOR_LOCATIONS.join(', ')}` }, { status: 400 });
  }

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    year,
    month,
    location,
    seminars_held: num(body.seminars_held) ?? 0,
    new_trained: num(body.new_trained),
    notes: typeof body.notes === 'string' ? body.notes : null,
    updated_by: check.session.login,
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from('ellanse_seminars_actual')
    .upsert([payload], { onConflict: 'year,month,location' })
    .select('*');

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }
  const rows = (result.data as unknown as SeminarActualRow[]) ?? [];
  console.log(`[ellanse-seminars] UPSERT year=${year} month=${month} loc=${location} by ${check.session.login}`);
  return Response.json({ seminar: rows[0] ?? null });
}
