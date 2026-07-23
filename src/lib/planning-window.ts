/**
 * Pure-логіка window-lock для планування.
 *
 * Правила (Пакет А Етап 3, 2026-05-13):
 *   1. Минулий місяць → завжди заблоковано (admin обходить)
 *   2. Майбутній місяць → завжди заблоковано (поки що, до окремого рішення)
 *   3. Поточний місяць → дозволено перші N РОБОЧИХ днів (settings.window_days),
 *      тобто до кінця N-го робочого дня місяця; далі заблоковано
 *      (вихідні/свята у вікно не «з'їдають» дні — рахуються лише робочі)
 *   4. Per-user / global locks перевизначають window_days:
 *      - user-allow → дозволено навіть поза window
 *      - user-block → заборонено навіть у window
 *      - global-block → заборонено всім (крім тих хто має user-allow)
 *
 * Priority (від найвищого до найнижчого):
 *   user-allow → user-block → global-block → window_days check
 */

import { getNthWorkingDay } from './working-days';

export type LockScope = 'global' | 'user';
export type LockType = 'block' | 'allow';

export interface PlanningLock {
  scope: LockScope;
  user_login: string | null;  // null для scope=global
  month: string;              // 'YYYY-MM-DD' (1-е число місяця)
  type: LockType;
  reason?: string | null;
}

export interface PlanningSettings {
  window_days: number;
}

export type LockReason =
  | 'past-month'
  | 'future-month'
  | 'outside-window'
  | 'user-block'
  | 'global-block';

export type AllowReason =
  | 'within-window'
  | 'user-allow';

export interface WindowCheckResult {
  allowed: boolean;
  reason: LockReason | AllowReason;
  /** Людино-зрозумілий текст для banner / 503-response. */
  message: string;
}

/**
 * Чи можна менеджеру `login` планувати на період `month` (1-е число)
 * станом на `today`.
 *
 * Pure-функція: всі inputs передаються явно, без side effects. Тестується
 * unit-тестами.
 */
export function canPlanForMonth(
  login: string,
  month: string,
  today: Date,
  settings: PlanningSettings,
  locks: readonly PlanningLock[],
): WindowCheckResult {
  // Нормалізуємо month → 'YYYY-MM-01' (часовий пояс UTC щоб уникнути drift).
  const monthIso = month.length >= 10 ? month.slice(0, 10) : month;
  const monthDate = new Date(`${monthIso.slice(0, 7)}-01T00:00:00Z`);
  const todayMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  if (monthDate.getTime() < todayMonth.getTime()) {
    return {
      allowed: false,
      reason: 'past-month',
      message: 'Планування за минулі місяці закрите.',
    };
  }
  if (monthDate.getTime() > todayMonth.getTime()) {
    return {
      allowed: false,
      reason: 'future-month',
      message: 'Планування майбутніх місяців ще не відкрите.',
    };
  }

  // Поточний місяць — дивимось user/global locks.
  const monthStr = monthDate.toISOString().slice(0, 10);
  const normLogin = login.toLowerCase().trim();
  const relevantLocks = locks.filter(l => {
    const lockMonth = (l.month || '').slice(0, 10);
    if (lockMonth !== monthStr) return false;
    if (l.scope === 'user') return (l.user_login || '').toLowerCase().trim() === normLogin;
    return l.scope === 'global';
  });

  // Priority 1: user-allow перемагає все.
  if (relevantLocks.some(l => l.scope === 'user' && l.type === 'allow')) {
    return {
      allowed: true,
      reason: 'user-allow',
      message: 'Вам дозволено планувати поза стандартним вікном.',
    };
  }
  // Priority 2: user-block.
  if (relevantLocks.some(l => l.scope === 'user' && l.type === 'block')) {
    return {
      allowed: false,
      reason: 'user-block',
      message: 'Планування для вашого логіну заблоковано адміністратором.',
    };
  }
  // Priority 3: global-block.
  if (relevantLocks.some(l => l.scope === 'global' && l.type === 'block')) {
    return {
      allowed: false,
      reason: 'global-block',
      message: 'Планування зараз закрите для всіх менеджерів.',
    };
  }
  // Priority 4: window check — перші N РОБОЧИХ днів місяця (не календарних).
  // Відкрито доки сьогодні ≤ дата N-го робочого дня (вихідні/свята не рахуються;
  // якщо N > робочих днів місяця — getNthWorkingDay клемпить на останній роб. день).
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const dayOfMonth = today.getUTCDate();
  // .getDate() (не getUTCDate): getNthWorkingDay будує дату локально new Date(y,m,day),
  // тож .getDate() повертає задумане число дня у будь-якому TZ (на Vercel UTC — те саме).
  const nthWorkingDom = getNthWorkingDay(y, m, settings.window_days).getDate();
  if (dayOfMonth <= nthWorkingDom) {
    return {
      allowed: true,
      reason: 'within-window',
      message: `Планування відкрите (перші ${settings.window_days} роб. днів місяця, до ${nthWorkingDom}-го числа).`,
    };
  }
  return {
    allowed: false,
    reason: 'outside-window',
    message: `Планування закрите. Вікно — перші ${settings.window_days} робочих днів місяця (до ${nthWorkingDom}-го числа).`,
  };
}
