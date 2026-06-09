/**
 * Bitrix24 REST client для модуля Рекламацій.
 *
 * Server-side тільки — токен у URL небезпечний для browser-side. Якщо треба
 * direct browser → Bitrix (наприклад upload файлів), генерувати presigned URL
 * на нашому сервері і повертати клієнту.
 *
 * BITRIX_WEBHOOK_URL з env. Зараз у reclamation-app він hardcoded у git
 * (security risk) — при переносі обов'язково через env. Формат:
 *   https://bitrix.emet.in.ua/rest/<user_id>/<webhook_token>/
 *
 * Якщо env не виставлено — повертаємо чітку помилку щоб не падали на null.
 */

interface BitrixSuccess<T = unknown> {
  result: T;
  time?: { start: number; finish: number; duration: number };
}

interface BitrixError {
  error: string;
  error_description: string;
}

export type BitrixResponse<T = unknown> = BitrixSuccess<T> | BitrixError;

export class BitrixError_ extends Error {
  constructor(
    public readonly code: string,
    public readonly description: string,
    public readonly httpStatus?: number,
  ) {
    super(`Bitrix ${code}: ${description}`);
    this.name = 'BitrixError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Викликати Bitrix REST endpoint. Повертає `result` (з обгортки знятий)
 * або кидає BitrixError_.
 */
export async function bitrixCall<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const baseUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!baseUrl) {
    throw new BitrixError_('CONFIG', 'BITRIX_WEBHOOK_URL env not set');
  }
  // Гарантуємо trailing slash перед методом.
  const url = baseUrl.endsWith('/') ? `${baseUrl}${method}` : `${baseUrl}/${method}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let body: BitrixResponse<T>;
    try {
      body = (await res.json()) as BitrixResponse<T>;
    } catch {
      throw new BitrixError_('PARSE', `Невалідний JSON у відповіді (HTTP ${res.status})`, res.status);
    }

    if ('error' in body) {
      throw new BitrixError_(body.error, body.error_description, res.status);
    }
    if (!res.ok) {
      throw new BitrixError_('HTTP', `HTTP ${res.status} ${res.statusText}`, res.status);
    }
    return body.result;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof BitrixError_) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new BitrixError_('TIMEOUT', `Bitrix не відповів за ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new BitrixError_('NETWORK', e instanceof Error ? e.message : 'unknown error');
  }
}

/**
 * Створити нову претензію у SPA 1038.
 * Повертає `{ id }` створеного запису.
 */
export async function bitrixCreateClaim(
  fields: Record<string, unknown>,
  entityTypeId: number,
): Promise<{ id: number }> {
  type AddResult = { item: { id: number } };
  const result = await bitrixCall<AddResult>('crm.item.add', {
    entityTypeId,
    fields,
  });
  return { id: result.item.id };
}

/**
 * Послати дзвіночок (`im.notify`) Bitrix-користувачу. Використовується для
 * нотіф мед-відділу про нову претензію або новий коментар.
 *
 * `userId` — Bitrix integer user-ID (НЕ email).
 * `message` — може містити Bitrix-розмітку `[URL=...]текст[/URL]`.
 */
export async function bitrixNotifyUser(
  userId: number,
  message: string,
): Promise<void> {
  await bitrixCall<unknown>('im.notify', {
    to: userId,
    message,
    type: 'SYSTEM',
  });
}

/**
 * Додати коментар у timeline претензії.
 * `entityTypeId` — обов'язково префікс `dynamic_` для SPA.
 */
export async function bitrixAddComment(
  entityId: number,
  entityTypeId: number,
  commentHTML: string,
): Promise<void> {
  await bitrixCall<unknown>('crm.timeline.comment.add', {
    fields: {
      ENTITY_ID: entityId,
      ENTITY_TYPE: `dynamic_${entityTypeId}`,
      COMMENT: commentHTML,
    },
  });
}
