/**
 * GET    /api/admin/planning-locks?month=YYYY-MM — список локів для місяця.
 * POST   /api/admin/planning-locks — додати lock. ADMIN ONLY.
 *   body: { scope: 'global'|'user', userLogin?: string, month: 'YYYY-MM-01', type: 'block'|'allow', reason?: string }
 * DELETE /api/admin/planning-locks?id=N — видалити lock. ADMIN ONLY.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

interface LockBody {
  scope?: 'global' | 'user';
  userLogin?: string;
  month?: string;
  type?: 'block' | 'allow';
  reason?: string;
}

function normalizeMonth(raw: string): string | null {
  if (!raw) return null;
  // 'YYYY-MM' → 'YYYY-MM-01'; 'YYYY-MM-DD' → 'YYYY-MM-01' (truncate)
  const m = raw.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const monthRaw = searchParams.get('month');
  let query = supabase.from('planning_locks').select('*').order('created_at', { ascending: false });
  if (monthRaw) {
    const m = normalizeMonth(monthRaw);
    if (!m) return Response.json({ error: 'Invalid month format (expected YYYY-MM)' }, { status: 400 });
    query = query.eq('month', m);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[planning-locks GET] error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ locks: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return Response.json({ error: 'Тільки адмін може створювати локи' }, { status: 403 });
  }

  let body: LockBody;
  try { body = await request.json() as LockBody; }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const scope = body.scope;
  const type = body.type;
  const month = body.month ? normalizeMonth(body.month) : null;
  const userLogin = body.userLogin ? body.userLogin.toLowerCase().trim() : null;

  if (scope !== 'global' && scope !== 'user') {
    return Response.json({ error: 'scope must be global or user' }, { status: 400 });
  }
  if (type !== 'block' && type !== 'allow') {
    return Response.json({ error: 'type must be block or allow' }, { status: 400 });
  }
  if (!month) {
    return Response.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  if (scope === 'user' && !userLogin) {
    return Response.json({ error: 'userLogin required for scope=user' }, { status: 400 });
  }
  if (scope === 'global' && userLogin) {
    return Response.json({ error: 'userLogin must be empty for scope=global' }, { status: 400 });
  }

  const { error } = await supabase.from('planning_locks').insert([{
    scope,
    user_login: scope === 'user' ? userLogin : null,
    month,
    type,
    reason: body.reason || null,
    created_by: session.login,
    created_at: new Date().toISOString(),
  }]);
  if (error) {
    console.error('[planning-locks POST] error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return Response.json({ error: 'Тільки адмін може видаляти локи' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const idStr = searchParams.get('id');
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'id required (positive integer)' }, { status: 400 });
  }

  const { error } = await supabase.from('planning_locks').delete().eq('id', id);
  if (error) {
    console.error('[planning-locks DELETE] error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}
