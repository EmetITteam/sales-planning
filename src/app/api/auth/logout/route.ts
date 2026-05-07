import { NextRequest } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { validateApiRequest } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  await clearSessionCookie();
  return Response.json({ ok: true });
}
