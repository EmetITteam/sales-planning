/**
 * /api/admin/unfinalize-permissions
 *
 * GET — список усіх юзерів з прапором can_unfinalize_plans.
 *       Тільки admin.
 *
 * POST — toggle прапор для одного логіну.
 *        Body: { login: string, value: boolean }
 *        Тільки admin.
 *
 * 🆕 2026-06-08 (M10): per-user дозвіл розфіналізовувати плани без admin-доступу.
 * Зараз кнопка «Розфіналізувати» у формі планування доступна тільки admin.
 * Цей прапор дає ту саму можливість конкретним користувачам (асистент
 * директора, керівник відділу) без видачі повного admin.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

interface UserRow {
  login: string;
  full_name: string | null;
  role: string;
  region: string | null;
  region_code: string | null;
  can_unfinalize_plans: boolean | null;
}

async function authorize(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return { error: Response.json({ error: auth.error }, { status: 401 }) };
  const session = await getSession();
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') {
    return { error: Response.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await supabase
    .from('users')
    .select('login, full_name, role, region, region_code, can_unfinalize_plans')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[admin/unfinalize-permissions GET] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const users = ((data ?? []) as unknown as UserRow[]).map(u => ({
    login: u.login,
    fullName: u.full_name || u.login,
    role: u.role,
    region: u.region,
    regionCode: u.region_code,
    canUnfinalizePlans: !!u.can_unfinalize_plans,
  }));

  return Response.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;

  let body: { login?: string; value?: boolean };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { login, value } = body;
  if (!login || typeof value !== 'boolean') {
    return Response.json({ error: 'login (string) + value (boolean) required' }, { status: 400 });
  }

  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) return Response.json({ error: 'Supabase env missing' }, { status: 500 });

  const url = `${URL_BASE}/rest/v1/users?login=eq.${encodeURIComponent(login)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ can_unfinalize_plans: value }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[admin/unfinalize-permissions POST] error', { login, value, status: r.status, body: text.slice(0, 200) });
    return Response.json({ error: `HTTP ${r.status}: ${text.slice(0, 200)}` }, { status: 500 });
  }

  return Response.json({ success: true, login, value });
}
