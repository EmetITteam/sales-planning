/**
 * GET    /api/admin/dynamic-plans        — список усіх правил
 * POST   /api/admin/dynamic-plans        — створити правило
 * DELETE /api/admin/dynamic-plans?id=... — видалити правило (жорстко)
 * PATCH  /api/admin/dynamic-plans        — deactivate (soft, enabled_to = сьогодні)
 *
 * Тільки admin (itd@emet.in.ua).
 *
 * Створено 2026-07-01.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import {
  getAllDynamicSegments,
  createDynamicSegment,
  deactivateDynamicSegment,
  deleteDynamicSegment,
} from '@/lib/dynamic-plan-segments';
import { SEGMENTS } from '@/lib/mock-data';

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
  const rules = await getAllDynamicSegments();
  return Response.json({ rules });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { segment_code, enabled_from, enabled_to, reason } = body ?? {};

  if (!segment_code || typeof segment_code !== 'string') {
    return Response.json({ error: 'segment_code is required' }, { status: 400 });
  }
  const validCodes = new Set(SEGMENTS.map(s => s.code));
  if (!validCodes.has(segment_code)) {
    return Response.json({ error: `Unknown segment: ${segment_code}` }, { status: 400 });
  }
  if (!enabled_from || typeof enabled_from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(enabled_from)) {
    return Response.json({ error: 'enabled_from must be YYYY-MM-DD' }, { status: 400 });
  }
  if (enabled_to !== undefined && enabled_to !== null) {
    if (typeof enabled_to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(enabled_to)) {
      return Response.json({ error: 'enabled_to must be YYYY-MM-DD or null' }, { status: 400 });
    }
    if (enabled_to < enabled_from) {
      return Response.json({ error: 'enabled_to must be >= enabled_from' }, { status: 400 });
    }
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return Response.json({ error: 'reason must be string or null' }, { status: 400 });
  }

  const result = await createDynamicSegment({
    segment_code,
    enabled_from,
    enabled_to: enabled_to ?? null,
    reason: reason ?? null,
    created_by: check.session.login,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  console.log(`[dynamic-plans] CREATE ${segment_code} from=${enabled_from} to=${enabled_to ?? 'null'} by=${check.session.login}`);
  return Response.json({ rule: result.rule });
}

export async function PATCH(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { id, action } = body ?? {};
  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }
  if (action !== 'deactivate') {
    return Response.json({ error: 'action must be "deactivate"' }, { status: 400 });
  }

  const result = await deactivateDynamicSegment(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  console.log(`[dynamic-plans] DEACTIVATE ${id} by ${check.session.login}`);
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const check = await requireAdmin(request);
  if ('error' in check) return check.error;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'id query param required' }, { status: 400 });
  }
  const result = await deleteDynamicSegment(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  console.log(`[dynamic-plans] DELETE ${id} by ${check.session.login}`);
  return Response.json({ ok: true });
}
