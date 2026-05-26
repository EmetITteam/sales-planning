/**
 * Клієнт-обгортка для виклику HTTP-сервісу 1С через серверний прокі
 * (`/api/onec`). Браузер НЕ ходить у 1С напряму — всі виклики йдуть
 * через Next.js route, який додає Basic Auth і ховає пароль у env.
 *
 * Використання:
 *   import { callOneC } from '@/lib/onec-client';
 *   const data = await callOneC('login', { login, password });
 *   // data: LoginResponse, типи виводяться автоматично з action.
 *
 * При помилці — кидає OneCError (Error subclass), щоб caller міг
 * показати UI fallback.
 */

import type { OneCAction, OneCActionMap } from './onec-types';

export class OneCError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'OneCError';
  }
}

export class OneCNetworkError extends Error {
  constructor(message: string, public readonly action: string) {
    super(message);
    this.name = 'OneCNetworkError';
  }
}

/** Auth-related error — сесія завершилась, треба переавтентифікуватись. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Сесія завершилась — увійдіть знову');
    this.name = 'SessionExpiredError';
  }
}

interface CallOptions {
  /** Час очікування у мс. Default 15000 (15 сек). */
  timeoutMs?: number;
  /** Скільки разів пробувати при network errors. Default 1 (без retry). */
  retries?: number;
}

/**
 * Виклик 1С action через прокі. Type-safe: action визначає тип payload і response.
 */
export async function callOneC<A extends OneCAction>(
  action: A,
  payload: OneCActionMap[A]['request'],
  options: CallOptions = {},
): Promise<OneCActionMap[A]['response']> {
  const { timeoutMs = 15000, retries = 1 } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('/api/onec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // 4xx/5xx з нашого прокі — не retry, кидаємо одразу.
        // 401/403 = сесія завершилась → диспатчимо global event, AppHeader
        // буде logout + показати toast. Кидаємо SessionExpiredError щоб
        // useOneCData міг показати чистий банер замість JSON dump.
        if (res.status === 401 || res.status === 403) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('emet:session-expired'));
          }
          throw new SessionExpiredError();
        }
        const text = await res.text().catch(() => '');
        throw new OneCError(`HTTP ${res.status}: ${text || res.statusText}`, action, res.status);
      }

      const json = await res.json();
      // 1С завжди повертає { status: 'success' | 'error' }
      if (json?.status === 'error') {
        throw new OneCError(json.message || '1С повернула помилку без опису', action);
      }
      if (json?.status !== 'success') {
        throw new OneCError(`Неочікувана відповідь 1С: ${JSON.stringify(json).slice(0, 200)}`, action);
      }
      return json.data as OneCActionMap[A]['response'];
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      // SessionExpired / OneCError — бізнес-помилки, не retry
      if (err instanceof SessionExpiredError) throw err;
      if (err instanceof OneCError) throw err;

      // Network/timeout — спробуємо ще раз якщо є retries
      if (attempt < retries) continue;

      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      throw new OneCNetworkError(
        isTimeout
          ? `Таймаут (${timeoutMs}ms) при виклику ${action}`
          : `Мережна помилка: ${err instanceof Error ? err.message : String(err)}`,
        action,
      );
    }
  }

  // Недосяжно (loop або повертає, або кидає), але TypeScript хоче return
  throw new OneCNetworkError(
    `Несподівана помилка: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    action,
  );
}
