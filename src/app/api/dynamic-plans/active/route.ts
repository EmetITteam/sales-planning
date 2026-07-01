/**
 * GET /api/dynamic-plans/active?period=YYYY-MM-DD
 *
 * Повертає масив segment_code для яких у цьому місяці plan=fact дзеркально.
 * Використовується у dashboards (Manager/RM/Director) і у формі планування
 * щоб знати чи ховати forecast/gap блоки.
 *
 * Публічний (потребує auth cookie), не sensitive — повертає тільки список кодів.
 *
 * Створено 2026-07-01.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { getActiveDynamicSegments } from '@/lib/dynamic-plan-segments';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const period = url.searchParams.get('period');
  if (!period || !/^\d{4}-\d{2}(-\d{2})?$/.test(period)) {
    return Response.json({ error: 'period query param YYYY-MM or YYYY-MM-DD required' }, { status: 400 });
  }

  const { segmentCodes } = await getActiveDynamicSegments(period);
  return Response.json({
    segmentCodes: Array.from(segmentCodes),
    period,
  });
}
