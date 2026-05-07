/**
 * GET /api/auth/me — повертає поточну сесію (з cookie) або 401.
 *
 * Клієнт викликає це на mount щоб дізнатись чи є валідна сесія.
 * Якщо null → редірект на login. Якщо є → populate Zustand store.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) return Response.json({ user: null });
  return Response.json({
    user: {
      login: session.login,
      fullName: session.fullName,
      role: session.role,
      region: session.region,
      regionCode: session.regionCode,
      managedUsers: session.managedUsers,
    },
  });
}
