/**
 * Server-side виклик 1С HTTP-сервісу (Sprint 1.5.3).
 *
 * Відрізняється від `/api/onec` proxy тим, що НЕ перевіряє session — це
 * виключно для серверних задач: cron-worker, scheduled jobs. Безпека —
 * через CRON_SECRET на самому endpoint.
 *
 * Використання:
 *   import { callOneCServer } from '@/lib/onec-server';
 *   const data = await callOneCServer('saveNewMeeting', { ... });
 *
 * При помилці кидає Error з категоризованим повідомленням.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export interface OneCServerResult<T = unknown> {
  ok: boolean;
  data?: T;
  errorMessage?: string;
  httpStatus?: number;
}

/**
 * Виклик 1С action з server-side. Повертає {ok, data | errorMessage}.
 *
 * Чому не throws? Cron-worker обробляє багато рядків поспіль — throws
 * перетворило б happy-path обробку у try/catch ladder. Discriminated union
 * простіша до читання.
 */
export async function callOneCServer<T = unknown>(
  action: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<OneCServerResult<T>> {
  const baseUrl = process.env.ONEC_BASE_URL;
  if (!baseUrl) {
    return { ok: false, errorMessage: 'ONEC_BASE_URL env not set' };
  }

  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (login && password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        errorMessage: `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        httpStatus: res.status,
      };
    }

    const json = (await res.json()) as { status?: string; data?: T; message?: string };
    if (json.status === 'error') {
      return { ok: false, errorMessage: json.message ?? '1С повернула помилку без опису' };
    }
    if (json.status !== 'success') {
      return {
        ok: false,
        errorMessage: `Неочікувана відповідь 1С: ${JSON.stringify(json).slice(0, 200)}`,
      };
    }
    return { ok: true, data: json.data };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      errorMessage: isTimeout
        ? `Таймаут (${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}мс) при виклику ${action}`
        : `Мережна помилка: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
