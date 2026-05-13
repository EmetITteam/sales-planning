/**
 * Сервер-side helper для перевірки чи дозволено writing у планування
 * за поточним window-lock станом. Викликається з POST endpoints.
 *
 * Якщо НЕ дозволено — повертає { blocked: true, response: <Response> } з
 * 403 + error JSON. POST route одразу робить `return result.response`.
 *
 * Admin завжди пропускається (повертає `{ blocked: false }`).
 */

import { canPlanForMonth } from './planning-window';
import { loadSettingsAndLocks } from '@/app/api/planning/window-check/route';
import type { UserSession } from './types';

export type WindowGuardResult =
  | { blocked: false }
  | { blocked: true; response: Response };

export async function assertWindowAllowed(
  session: UserSession,
  effectiveLogin: string,
  monthRaw: string | null | undefined,
): Promise<WindowGuardResult> {
  if (session.role === 'admin') return { blocked: false };
  if (!monthRaw || !/^\d{4}-\d{2}/.test(monthRaw)) {
    // Якщо month не передано — не можемо перевірити. Не блокуємо, щоб не
    // зламати endpoints у які month опціональний. (Тільки admin-routes
    // мають явну month, інші можуть звертатись без).
    return { blocked: false };
  }
  const { settings, locks } = await loadSettingsAndLocks(monthRaw);
  const result = canPlanForMonth(effectiveLogin, monthRaw, new Date(), settings, locks);
  if (result.allowed) return { blocked: false };
  return {
    blocked: true,
    response: Response.json(
      {
        error: result.message,
        code: 'WINDOW_LOCKED',
        reason: result.reason,
      },
      { status: 403 },
    ),
  };
}
