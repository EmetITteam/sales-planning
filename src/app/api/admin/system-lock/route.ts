/**
 * POST /api/admin/system-lock — admin вмикає/вимикає глобальний kill-switch.
 * GET  /api/admin/system-lock — поточний стан (для UI у /admin/system-lock).
 *
 * Тільки admin (itd@emet.in.ua). Інші ролі отримують 403.
 *
 * POST body: { locked: boolean, reason?: string }
 * GET  response: SystemLockState
 *
 * Створено 2026-06-26.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { isAdminLogin } from '@/lib/feature-flags';
import { getSystemLockState, setSystemLockState } from '@/lib/system-lock';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminLogin(session.login)) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }
  const state = await getSystemLockState();
  return Response.json(state);
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminLogin(session.login)) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { locked, reason } = body ?? {};
  if (typeof locked !== 'boolean') {
    return Response.json({ error: '`locked` must be boolean' }, { status: 400 });
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return Response.json({ error: '`reason` must be string or null' }, { status: 400 });
  }
  if (typeof reason === 'string' && reason.length > 500) {
    return Response.json({ error: '`reason` too long (max 500 chars)' }, { status: 400 });
  }

  const result = await setSystemLockState({
    locked,
    reason: reason ?? null,
    updatedBy: session.login,
  });

  if (!result.ok) {
    console.error(`[system-lock] DB write failed by ${session.login}: ${result.error}`);
    return Response.json({ error: 'Database error: ' + result.error }, { status: 500 });
  }

  console.log(`[system-lock] ${locked ? 'LOCKED' : 'UNLOCKED'} by ${session.login}${reason ? ` (reason: ${reason})` : ''}`);
  const newState = await getSystemLockState();
  return Response.json(newState);
}
