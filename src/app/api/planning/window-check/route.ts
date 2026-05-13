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
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canPlanForMonth } from '@/lib/planning-window';
import { loadSettingsAndLocks } from '@/lib/load-window-state';

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
