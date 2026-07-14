/**
 * GET    /api/admin/region-access        — список грантів (тимч. доступ до регіону)
 * POST   /api/admin/region-access        — створити грант
 * DELETE /api/admin/region-access?id=...  — відкликати (soft, revoked_at)
 *
 * Директор продажів (sdu) + асистент директора + admin. Гейт по логіну.
 *
 * Створено 2026-07-14.
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canManageRegionAccess } from '@/lib/feature-flags';
import { listRegionGrants, createRegionGrant, revokeRegionGrant } from '@/lib/region-access';

async function requireManager(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return { error: Response.json({ error: auth.error }, { status: 401 }) };
  const session = await getSession();
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!canManageRegionAccess(session.login)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest) {
  const check = await requireManager(request);
  if ('error' in check) return check.error;
  const grants = await listRegionGrants();
  return Response.json({ grants });
}

export async function POST(request: NextRequest) {
  const check = await requireManager(request);
  if ('error' in check) return check.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const manager_login = body.manager_login;
  const region_code = body.region_code;
  const valid_from = body.valid_from;
  const valid_to = body.valid_to;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  if (typeof manager_login !== 'string' || !manager_login.trim()) {
    return Response.json({ error: 'manager_login is required' }, { status: 400 });
  }
  if (typeof region_code !== 'string' || !region_code.trim()) {
    return Response.json({ error: 'region_code is required' }, { status: 400 });
  }
  if (typeof valid_from !== 'string' || !dateRe.test(valid_from)) {
    return Response.json({ error: 'valid_from must be YYYY-MM-DD' }, { status: 400 });
  }
  if (typeof valid_to !== 'string' || !dateRe.test(valid_to)) {
    return Response.json({ error: 'valid_to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (valid_to < valid_from) {
    return Response.json({ error: 'valid_to must be >= valid_from' }, { status: 400 });
  }

  const result = await createRegionGrant({
    manager_login,
    region_code,
    region_name: typeof body.region_name === 'string' ? body.region_name : null,
    manager_name: typeof body.manager_name === 'string' ? body.manager_name : null,
    valid_from,
    valid_to,
    granted_by: check.session.login,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ grant: result.grant });
}

export async function DELETE(request: NextRequest) {
  const check = await requireManager(request);
  if ('error' in check) return check.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const result = await revokeRegionGrant(id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}
