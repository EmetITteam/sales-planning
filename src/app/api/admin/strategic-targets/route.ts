/**
 * GET  /api/admin/strategic-targets?year=2026 — список таргетів на рік
 * POST /api/admin/strategic-targets — upsert 1 запис (year × brand × channel)
 *
 * Admin only. Тільки `itd@emet.in.ua`.
 *
 * Створено 2026-07-02 (Stage 1.5 Strategic KPI).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase';
import {
  STRATEGIC_BRANDS,
  STRATEGIC_CHANNELS,
  type StrategicBrand,
  type StrategicChannel,
} from '@/lib/strategic-kpi/brands';

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

interface StrategicTargetRow {
  id: number;
  year: number;
  brand: string;
  channel: string;
  unique_clients_annual: number | null;
  avg_check_annual: number | null;
  buyers_monthly: number | null;
  avg_qty_per_client: number | null;
  new_trained_annual: number | null;
  trainings_annual: number | null;
  trainings_repeat: number | null;
  conversion_repeat_pct: number | null;
  retention_monthly: number | null;
  updated_at: string;
  updated_by: string;
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2025 || year > 2100) {
    return Response.json({ error: 'year must be 2025-2100' }, { status: 400 });
  }

  const result = await supabase
    .from('strategic_targets')
    .select('*')
    .eq('year', year);

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }

  const rows = (result.data as unknown as StrategicTargetRow[]) ?? [];
  return Response.json({ year, targets: rows });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { year, brand, channel } = body ?? {};

  // Валідація
  if (!Number.isFinite(year) || year < 2025 || year > 2100) {
    return Response.json({ error: 'year must be 2025-2100' }, { status: 400 });
  }
  if (!STRATEGIC_BRANDS.includes(brand as StrategicBrand)) {
    return Response.json({ error: `brand must be one of: ${STRATEGIC_BRANDS.join(', ')}` }, { status: 400 });
  }
  if (!STRATEGIC_CHANNELS.includes(channel as StrategicChannel)) {
    return Response.json({ error: `channel must be one of: ${STRATEGIC_CHANNELS.join(', ')}` }, { status: 400 });
  }

  // Числові поля — nullable, конвертуємо undefined → null
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    year,
    brand,
    channel,
    unique_clients_annual: num(body.unique_clients_annual),
    avg_check_annual: num(body.avg_check_annual),
    buyers_monthly: num(body.buyers_monthly),
    avg_qty_per_client: num(body.avg_qty_per_client),
    new_trained_annual: num(body.new_trained_annual),
    trainings_annual: num(body.trainings_annual),
    trainings_repeat: num(body.trainings_repeat),
    conversion_repeat_pct: num(body.conversion_repeat_pct),
    retention_monthly: num(body.retention_monthly),
    updated_by: check.session.login,
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from('strategic_targets')
    .upsert([payload], { onConflict: 'year,brand,channel' })
    .select('*');

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }

  const rows = (result.data as unknown as StrategicTargetRow[]) ?? [];
  console.log(`[strategic-targets] UPSERT year=${year} brand=${brand} channel=${channel} by ${check.session.login}`);
  return Response.json({ target: rows[0] ?? null });
}
