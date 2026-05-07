/**
 * Серверна сесія через підписану HttpOnly cookie (JWT з `jose`).
 *
 * Чому HttpOnly cookie замість sessionStorage:
 *  - JS на сторінці НЕ може прочитати → захист від XSS-крадіжки
 *  - Браузер автоматично шле з кожним fetch (credentials: 'include' не потрібен
 *    для same-origin)
 *  - SameSite=Lax відсікає cross-site CSRF
 *  - Нема трейтінгу `userMeta.login` з body — сервер довіряє ТІЛЬКИ сесії
 *
 * Чому JWT (а не opaque session ID + Redis):
 *  - Stateless — не треба shared store на Vercel serverless
 *  - 1С — джерело істини для login; Supabase не зберігає сесій
 *  - Якщо треба revoke — додамо TTL=24h і просто чекаємо expire
 *
 * Secret: env `SESSION_SECRET` (мін 32 байти). На prod — обовʼязково встановити.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { UserSession, UserRole } from './types';

const COOKIE_NAME = 'sp_session';
const TTL_SECONDS = 60 * 60 * 24; // 24h

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET env variable is required in production. ' +
    'Generate one: `openssl rand -hex 32`. Set in Vercel → Environment Variables.'
  );
}

function getSecret(): Uint8Array {
  // Dev fallback — мусить бути ≥32 байти для HS256.
  const raw = process.env.SESSION_SECRET || 'dev-only-secret-change-in-production-32b';
  return new TextEncoder().encode(raw);
}

export interface SessionPayload {
  login: string;
  fullName: string;
  role: UserRole;
  region: string;
  regionCode: string;
  managedUsers: string[];
  /** Підписано на сервері — JWT іса гарантія. */
  iat?: number;
  exp?: number;
}

export async function signSession(user: UserSession): Promise<string> {
  return new SignJWT({
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    region: user.region,
    regionCode: user.regionCode,
    managedUsers: user.managedUsers,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    if (typeof payload.login !== 'string') return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Прочитати сесію з cookie на сервері (route handlers, server actions).
 * Повертає null якщо нема або підпис невалідний.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(user: UserSession): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
