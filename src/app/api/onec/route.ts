/**
 * Серверний прокі до HTTP-сервісу 1С.
 *
 * Browser → POST /api/onec { action, payload }
 *        → ця route додає Authorization: Basic + base URL з env
 *        → 1С повертає { status: 'success' | 'error', data | message }
 *        → передаємо як є назад у браузер
 *
 * Чому прокі (а не fetch напряму з браузера):
 *  1) CORS — 1С зазвичай не дозволяє cross-origin
 *  2) Безпека — пароль з env не світиться у клієнтському JS
 *  3) Логування і retry зручно робити на сервері
 *
 * ENV (треба в .env.local на Vercel):
 *  - ONEC_BASE_URL — наприклад https://1c.emet.com.ua/api/handler
 *  - ONEC_LOGIN — сервісний логін у 1С
 *  - ONEC_PASSWORD — пароль
 */

import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const baseUrl = process.env.ONEC_BASE_URL;
  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;

  if (!baseUrl || !login || !password) {
    return Response.json(
      {
        status: 'error',
        message: 'Не налаштовано env: потрібно ONEC_BASE_URL, ONEC_LOGIN, ONEC_PASSWORD',
      },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, payload } = body ?? {};
  if (!action || typeof action !== 'string') {
    return Response.json({ status: 'error', message: 'Missing or invalid action' }, { status: 400 });
  }

  // Спеціальний випадок для login — payload містить пароль користувача
  // (а не сервісний). Передаємо як є.
  const requestBody = JSON.stringify({ action, payload: payload ?? {} });

  // Basic auth з env
  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  try {
    const upstream = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: requestBody,
      // Серверний fetch у Next.js Edge не кешуємо — дані динамічні
      cache: 'no-store',
    });

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return Response.json(
        {
          status: 'error',
          message: `1С повернула не-JSON (HTTP ${upstream.status}): ${text.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }

    // Передаємо відповідь 1С як є — клієнт сам розбере success/error
    return Response.json(json, { status: upstream.ok ? 200 : upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { status: 'error', message: `Помилка зв'язку з 1С: ${message}` },
      { status: 502 },
    );
  }
}
