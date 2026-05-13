/**
 * GET /api/planning/window-check?month=YYYY-MM&login=optional
 *
 * Повертає WindowCheckResult — чи дозволено планувати на цей місяць.
 * Admin завжди отримує `allowed: true` з `reason: 'admin-bypass'`.
 *
 * Викликається фронтендом у planning-form щоб показати banner коли
 * планування закрите, і backend POST-routes (через ту саму pure-функцію).
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canPlanForMonth, type PlanningLock, type PlanningSettings } from '@/lib/planning-window';

export async function loadSettingsAndLocks(month: string): Promise<{
  settings: PlanningSettings;
  locks: PlanningLock[];
}> {
  const monthNorm = month.slice(0, 7) + '-01';
  const [settingsRes, locksRes] = await Promise.all([
    supabase.from('planning_settings').select('window_days').eq('id', 1),
    supabase.from('planning_locks').select('scope,user_login,month,type,reason').eq('month', monthNorm),
  ]);
  const sRow = Array.isArray(settingsRes.data) && settingsRes.data.length > 0
    ? settingsRes.data[0]
    : { window_days: 5 };
  return {
    settings: { window_days: Number(sRow.window_days) || 5 },
    locks: (locksRes.data ?? []) as unknown as PlanningLock[],
  };
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const monthRaw = searchParams.get('month');
  if (!monthRaw || !/^\d{4}-\d{2}/.test(monthRaw)) {
    return Response.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  const login = (searchParams.get('login') || session.login).toLowerCase().trim();

  // Admin завжди має доступ.
  if (session.role === 'admin') {
    return Response.json({
      allowed: true,
      reason: 'admin-bypass',
      message: 'Адмін — обмеження не діють.',
    });
  }

  const { settings, locks } = await loadSettingsAndLocks(monthRaw);
  const result = canPlanForMonth(login, monthRaw, new Date(), settings, locks);
  return Response.json(result);
}
