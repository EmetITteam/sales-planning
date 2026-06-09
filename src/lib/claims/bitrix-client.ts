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
 * Повертає id створеного коментаря.
 *
 * Опціональні файли (Sprint 2B.B+): передаються Bitrix як масив
 * `[[filename, base64-content], ...]` у поле `FILES`. Bitrix зберігає їх
 * як вкладення у timeline-comment — мед-відділ бачить thumbnails прямо у
 * timeline UI.
 */
export async function bitrixAddComment(
  entityId: number,
  entityTypeId: number,
  commentHTML: string,
  files?: Array<[string, string]>,
): Promise<number> {
  const fields: Record<string, unknown> = {
    ENTITY_ID: entityId,
    ENTITY_TYPE: `dynamic_${entityTypeId}`,
    COMMENT: commentHTML,
  };
  if (files && files.length > 0) {
    fields.FILES = files;
  }
  const id = await bitrixCall<number>('crm.timeline.comment.add', { fields });
  return id;
}

/**
 * Список претензій з SPA по фільтру. Використовується для `/claims` сторінки —
 * filter `{managerEmail}` повертає тільки claims цього менеджера.
 *
 * Bitrix віддає масив items з повним набором полів — ми selectом обмежуємось
 * до необхідних для list-card.
 */
export async function bitrixListClaims<T = Record<string, unknown>>(
  entityTypeId: number,
  filter: Record<string, string | number>,
  select: string[] = ['id', 'title', 'stageId', 'createdTime'],
): Promise<T[]> {
  type ListResult = { items?: T[] };
  const result = await bitrixCall<ListResult>('crm.item.list', {
    entityTypeId,
    filter,
    select,
    order: { id: 'DESC' },
  });
  return result.items ?? [];
}

/**
 * Деталь одного claim (всі поля). Викликається на `/claims/[id]`.
 * Доступ-контроль (тільки свій claim) caller робить через перевірку
 * managerEmail у поверненому об'єкті.
 */
export async function bitrixGetClaim<T = Record<string, unknown>>(
  entityTypeId: number,
  id: number,
): Promise<T | null> {
  type GetResult = { item?: T };
  const result = await bitrixCall<GetResult>('crm.item.get', { entityTypeId, id });
  return result.item ?? null;
}

/**
 * Коментарі (timeline) для claim. Для нашого SPA entityType будується як
 * `dynamic_<id>` — це Bitrix-конвенція для custom-entities.
 *
 * Order DESC — новіші зверху (хоча у чат-UI ми їх перевертаємо).
 */
export interface BitrixCommentFile {
  /** Bitrix Disk file ID. */
  id?: string | number;
  /** Original filename. */
  name?: string;
  /** Public URL для перегляду. */
  url?: string;
  /** Розмір у байтах. */
  size?: number | string;
}

export interface BitrixComment {
  ID: string;
  COMMENT: string;
  AUTHOR_ID: string | number | null;
  CREATED: string;
  /** Прикріплені файли (Sprint 2B.B+). Bitrix повертає масив об'єктів
   *  з id/name/url. У старих коментарях поля може не бути. */
  FILES?: BitrixCommentFile[] | Record<string, BitrixCommentFile>;
}

export async function bitrixListComments(
  entityId: number,
  entityTypeId: number,
): Promise<BitrixComment[]> {
  const result = await bitrixCall<BitrixComment[]>('crm.timeline.comment.list', {
    filter: {
      ENTITY_ID: entityId,
      ENTITY_TYPE: `dynamic_${entityTypeId}`,
      TYPE_ID: 'COMMENT',
    },
    order: { ID: 'DESC' },
  });
  return Array.isArray(result) ? result : [];
}

/**
 * Отримати display name Bitrix-користувача (для відображення автора коментаря
 * у чаті). Кешуємо у пам'яті процесу (на serverless invocations не зберігається,
 * але у межах одного render-у економить запити).
 */
const USER_NAME_CACHE = new Map<string, string>();

export async function bitrixGetUserName(userId: string | number): Promise<string> {
  const key = String(userId);
  const cached = USER_NAME_CACHE.get(key);
  if (cached) return cached;

  try {
    type UserGetResult = Array<{ NAME?: string; LAST_NAME?: string }>;
    const result = await bitrixCall<UserGetResult>('user.get', { ID: key });
    if (Array.isArray(result) && result.length > 0) {
      const u = result[0];
      const name = `${u.NAME ?? ''} ${u.LAST_NAME ?? ''}`.trim();
      if (name) {
        USER_NAME_CACHE.set(key, name);
        return name;
      }
    }
  } catch {
    // Тихо ігноруємо — fallback нижче.
  }
  return `Користувач ${key}`;
}
