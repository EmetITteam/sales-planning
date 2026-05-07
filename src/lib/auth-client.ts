/**
 * Клієнтські обгортки над /api/auth/* — все що JS на сторінці робить з сесією
 * проходить через ці функції. У store зберігаємо user, але джерело істини —
 * cookie на сервері.
 */

import type { UserSession } from './types';

interface LoginParams {
  login: string;
  password?: string;
  /** Швидкий вхід через MOCK_USERS (працює лише якщо NEXT_PUBLIC_DEMO_LOGIN=true). */
  demo?: boolean;
}

export async function apiLogin(params: LoginParams): Promise<UserSession> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.user as UserSession;
}

export async function apiLogout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function apiMe(): Promise<UserSession | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}
