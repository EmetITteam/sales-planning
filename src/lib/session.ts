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
import { randomBytes } from 'node:crypto';
import type { UserSession, UserRole } from './types';

const COOKIE_NAME = 'sp_session';
const TTL_SECONDS = 60 * 60 * 24; // 24h

// Dev-only ephemeral secret: генерується ОДИН раз на процес. Без хардкоду
// (раніше було `'dev-only-secret-change-in-production-32b'` — дозволяло
// підробляти JWT на будь-якому деплої з цим fallback). JWT-сесії не
// валідні між рестартами dev-сервера — це бажана поведінка локально.
let DEV_EPHEMERAL_SECRET: string | null = null;

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  // Перевірка на runtime (не на module-level) — інакше `next build`
  // на CI/Vercel падає бо env збираються після phase build.
  if (process.env.NODE_ENV === 'production') {
    if (!raw) {
      throw new Error(
        'SESSION_SECRET env variable is required in production. ' +
        'Generate one: `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`. ' +
        'Set in Vercel → Environment Variables.'
      );
    }
    // HS256 рекомендує ключ ≥ 32 байти (256 біт). Менший — brute-force-able.
    if (raw.length < 32) {
      throw new Error(
        `SESSION_SECRET too short (${raw.length} chars). Must be ≥ 32 chars for HS256 security.`
      );
    }
    return new TextEncoder().encode(raw);
  }
  // Dev: якщо env задано — використовуємо його (sticky JWT між рестартами).
  // Якщо ні — генеруємо random per-process, попереджаємо у консолі.
  if (raw && raw.length >= 32) return new TextEncoder().encode(raw);
  if (!DEV_EPHEMERAL_SECRET) {
    DEV_EPHEMERAL_SECRET = randomBytes(32).toString('hex');
    console.warn(
      '[session] SESSION_SECRET not set or too short — using random per-process secret. ' +
      'JWT-сесії не виживуть рестарт. Для sticky-dev додай SESSION_SECRET у .env.'
    );
  }
  return new TextEncoder().encode(DEV_EPHEMERAL_SECRET);
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
 *
 * ⚠️ 2026-06-29: blacklist check ВСЕРЕДИНІ getSession() — гарантує що
 * BLOCKED_LOGINS блокуються у ВСІХ 35+ API routes що викликають getSession(),
 * не лише /api/onec + /api/auth/login. Якщо логін у banlist → null (як
 * unauthorized) → route автоматично поверне 401.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  // Inline import щоб уникнути circular dep (feature-flags теж може колись
  // використовувати session). Якщо в blacklist — повертаємо null.
  const { isBlockedLogin } = await import('./feature-flags');
  if (isBlockedLogin(session.login)) {
    return null;
  }
  return session;
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
