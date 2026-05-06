/**
 * Серверний прокі до HTTP-сервісу 1С.
 *
 * Browser → POST /api/onec { action, payload }
 *        → ця route форвардить запит на ONEC_BASE_URL
 *        → 1С повертає { status: 'success' | 'error', data | message }
 *        → передаємо як є назад у браузер
 *
 * Чому прокі (а не fetch напряму з браузера):
 *  1) CORS — 1С зазвичай не дозволяє cross-origin
 *  2) Логування і retry зручно робити на сервері
 *
 * ENV:
 *  - ONEC_BASE_URL (обов'язковий) — наприклад https://1c.emet.com.ua/api/handler
 *  - ONEC_LOGIN / ONEC_PASSWORD (опційні) — Basic Auth якщо HTTP-сервіс
 *    вимагає авторизацію. Якщо 1С налаштований на анонімний доступ —
 *    лишити порожніми, заголовок Authorization не додається.
 */

import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const baseUrl = process.env.ONEC_BASE_URL;
  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;

  if (!baseUrl) {
    return Response.json(
      { status: 'error', message: 'Не налаштовано env: потрібно ONEC_BASE_URL' },
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Basic Auth додаємо тільки якщо обидва env задані
  if (login && password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  try {
    // Server-side timeout — інакше Vercel function висить до killу платформи (~10-60с).
    // Клієнт окремо має свій 15с timeout у onec-client.ts; цей — підстраховка.
    const upstream = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: requestBody,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
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
