/**
 * GET /api/system-status — публічний endpoint (без auth).
 *
 * Повертає тільки те що потрібно показати на login page:
 *   - locked: чи система заблокована
 *   - reason: причина (для banner)
 *
 * НЕ повертаємо locked_at / locked_by — це не для публічного перегляду.
 *
 * Використовується LoginForm щоб показати «Система на обслуговуванні»
 * замість форми вводу credentials.
 *
 * Створено 2026-06-26.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSystemLockState } from '@/lib/system-lock';

export async function GET(request: NextRequest) {
  // Origin check лишається — захист від CSRF на іншому домені.
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const state = await getSystemLockState();
  return Response.json({
    locked: state.locked,
    reason: state.reason,
  });
}
