/**
 * POST /api/auth/login
 *
 * Body: { login, password }
 *
 * Flow:
 *   1) Валідуємо origin (через api-auth)
 *   2) Прокі до 1С action=login
 *   3) Якщо 1С підтвердив auth=true → адаптуємо у UserSession
 *   4) Підписуємо JWT і ставимо HttpOnly cookie sp_session
 *   5) Повертаємо UserSession клієнту (для негайного populate store)
 *
 * Альтернативно (demo): якщо `loginKey` у MOCK_USERS → одразу cookie без 1С.
 *
 * Це РЕАЛЬНА точка входу замість прямого `callOneC('login')` з браузера.
 * Раніше login проходив через /api/onec → клієнт довіряв sessionStorage → сервер
 * довіряв body.userMeta.login. Тепер: cookie підписана сервером, body не довіряємо.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { setSessionCookie } from '@/lib/session';
import { adaptLogin } from '@/lib/onec-adapters';
import { MOCK_USERS } from '@/lib/mock-data';
import { checkRateLimit } from '@/lib/rate-limit';
import type { LoginResponse } from '@/lib/onec-types';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  // Brute-force захист: rate-limit per IP (сесії ще нема).
  // На Vercel `request.headers.get('x-forwarded-for')` дає реальний клієнтський IP.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const rl = checkRateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return Response.json(
      { error: `Забагато спроб входу. Спробуйте через ${rl.retryAfterSec}с.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { login, password, demo } = body ?? {};
  if (!login || typeof login !== 'string') {
    return Response.json({ error: 'login is required' }, { status: 400 });
  }

  // === DEMO logins (тільки якщо NEXT_PUBLIC_DEMO_LOGIN=true). ===
  // Захист від accidentaл: дозволяємо демо лише якщо env прапорець ON.
  if (demo) {
    if (process.env.NEXT_PUBLIC_DEMO_LOGIN !== 'true') {
      return Response.json({ error: 'Demo login disabled' }, { status: 403 });
    }
    const user = MOCK_USERS[login];
    if (!user) {
      return Response.json({ error: 'Demo user not found' }, { status: 404 });
    }
    await setSessionCookie(user);
    return Response.json({ user });
  }

  // === Real 1С login ===
  if (!password) {
    return Response.json({ error: 'password is required' }, { status: 400 });
  }

  const baseUrl = process.env.ONEC_BASE_URL;
  if (!baseUrl) {
    return Response.json({ error: '1С не налаштований (ONEC_BASE_URL)' }, { status: 500 });
  }

  const onecLogin = process.env.ONEC_LOGIN;
  const onecPass = process.env.ONEC_PASSWORD;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (onecLogin && onecPass) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${onecLogin}:${onecPass}`).toString('base64');
  }

  let upstream: Response;
  try {
    upstream = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'login', payload: { login, password } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return Response.json(
      { error: `Помилка зв'язку з 1С: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json(
      { error: `1С повернула не-JSON (HTTP ${upstream.status})` },
      { status: 502 },
    );
  }

  if (json.status === 'error') {
    return Response.json({ error: json.message || 'Помилка 1С' }, { status: 401 });
  }
  const data = json.data as LoginResponse | undefined;
  if (!data || !data.auth) {
    return Response.json({ error: 'Невірний логін або пароль' }, { status: 401 });
  }

  const user = adaptLogin(data);
  await setSessionCookie(user);
  return Response.json({ user });
}
