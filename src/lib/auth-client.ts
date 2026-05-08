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

export class LoginError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'LoginError';
    this.status = status;
    this.code = code;
  }
}

export async function apiLogin(params: LoginParams): Promise<UserSession> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new LoginError(data.error || `HTTP ${res.status}`, res.status, data.code);
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
