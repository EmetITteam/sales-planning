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
  // ⚠️ Bitrix REST `crm.timeline.comment.list` за замовчуванням повертає
  // лише ID/COMMENT/AUTHOR_ID/CREATED — БЕЗ поля FILES. Треба явний select
  // інакше прикріплення зникають з відповіді.
  const result = await bitrixCall<BitrixComment[]>('crm.timeline.comment.list', {
    filter: {
      ENTITY_ID: entityId,
      ENTITY_TYPE: `dynamic_${entityTypeId}`,
      TYPE_ID: 'COMMENT',
    },
    select: ['ID', 'COMMENT', 'AUTHOR_ID', 'CREATED', 'FILES'],
    order: { ID: 'DESC' },
  });
  return Array.isArray(result) ? result : [];
}

/**
 * Bitrix host з webhook URL — потрібно для побудови повних download-посилань
 * (DOWNLOAD_URL з `disk.file.get` зазвичай повертається як relative path
 * `/bitrix/services/...`).
 */
export function bitrixHost(): string {
  const baseUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!baseUrl) throw new BitrixError_('CONFIG', 'BITRIX_WEBHOOK_URL env not set');
  return new URL(baseUrl).host;
}

interface DiskMetaResult {
  DOWNLOAD_URL?: string;
  NAME?: string;
  OBJECT_ID?: string | number;
  ID?: string | number;
  SIZE?: number | string;
}

function inferContentType(name: string): string {
  const lower = name.toLowerCase();
  return /\.(jpg|jpeg)$/i.test(lower) ? 'image/jpeg'
    : /\.png$/i.test(lower) ? 'image/png'
    : /\.gif$/i.test(lower) ? 'image/gif'
    : /\.webp$/i.test(lower) ? 'image/webp'
    : /\.heic$/i.test(lower) ? 'image/heic'
    : /\.mp4$/i.test(lower) ? 'video/mp4'
    : /\.mov$/i.test(lower) ? 'video/quicktime'
    : /\.webm$/i.test(lower) ? 'video/webm'
    : /\.pdf$/i.test(lower) ? 'application/pdf'
    : 'application/octet-stream';
}

/**
 * Отримати tokenized download URL диск-файла з Bitrix.
 *
 * Bitrix Disk файли не публічні: пряме відкриття URL з браузера без сесії
 * дає 401/403 (`allowed_only_intranet_user`).
 *
 * ID у Bitrix FILES може бути двох типів:
 *  - **AttachedObject ID** — для timeline-коментарів (Bitrix обертає файли
 *    у AttachedObject коли вони прикріплюються до сутностей). Використовуємо
 *    `disk.attachedObject.get` → отримуємо DOWNLOAD_URL.
 *  - **Disk File ID** — для disk-fields (наприклад `ufCrm4_FILES`).
 *    Використовуємо `disk.file.get` напряму.
 *
 * Стратегія: спочатку attachedObject (timeline use-case частіше), якщо fail
 * — fallback на disk.file.get. У обох випадках повертаємо повний https URL
 * з токеном для прямого fetch.
 */
export async function bitrixGetDiskDownloadUrl(
  fileId: string | number,
): Promise<{ url: string; name: string; contentType: string } | null> {
  const host = bitrixHost();
  const buildResult = (raw: DiskMetaResult): { url: string; name: string; contentType: string } | null => {
    let url = raw.DOWNLOAD_URL ?? '';
    if (!url) return null;
    if (url.startsWith('/')) url = `https://${host}${url}`;
    const name = String(raw.NAME ?? `file-${fileId}`);
    return { url, name, contentType: inferContentType(name) };
  };

  // 1) Attached Object (typical для timeline FILES + disk-field у SPA)
  try {
    const result = await bitrixCall<DiskMetaResult>('disk.attachedObject.get', { id: fileId });
    if (result) {
      const out = buildResult(result);
      if (out) return out;
      // Якщо у attachedObject нема DOWNLOAD_URL, але є OBJECT_ID → fetch file by OBJECT_ID
      const objectId = result.OBJECT_ID;
      if (objectId) {
        try {
          const fileResult = await bitrixCall<DiskMetaResult>('disk.file.get', { id: objectId });
          if (fileResult) {
            const out2 = buildResult(fileResult);
            if (out2) return out2;
          }
        } catch (e) {
          console.warn(`[bitrixGetDiskDownloadUrl] disk.file.get(${objectId}) failed:`, e);
        }
      }
    }
  } catch (e) {
    // attachedObject не знайдено — пробуємо як disk.file нижче
    if (!(e instanceof BitrixError_)) {
      console.warn(`[bitrixGetDiskDownloadUrl] disk.attachedObject.get(${fileId}) failed:`, e);
    }
  }

  // 2) Fallback: пряме звернення як до Disk File
  try {
    const result = await bitrixCall<DiskMetaResult>('disk.file.get', { id: fileId });
    if (result) return buildResult(result);
  } catch (e) {
    if (!(e instanceof BitrixError_)) {
      console.warn(`[bitrixGetDiskDownloadUrl] disk.file.get(${fileId}) failed:`, e);
    }
  }

  return null;
}

/**
 * Резолвимо справжнє ім'я файла за його ID. Bitrix `crm.timeline.comment.list`
 * повертає FILES без поля NAME (тільки id+url), через це ми скрізь мали
 * placeholder «файл» — а без розширення фронт не міг визначити kind
 * (image/video) і показував generic «Прев'ю недоступне».
 *
 * Спочатку пробуємо `disk.attachedObject.get` (тип з timeline), потім
 * `disk.file.get` (тип з disk-полів). Кешуємо у пам'яті процесу.
 */
const ATTACHMENT_NAME_CACHE = new Map<string, string>();

export async function bitrixResolveAttachmentName(
  fileId: string | number,
): Promise<string | null> {
  const key = String(fileId);
  const cached = ATTACHMENT_NAME_CACHE.get(key);
  if (cached !== undefined) return cached || null;

  try {
    const result = await bitrixCall<DiskMetaResult>('disk.attachedObject.get', { id: fileId });
    if (result?.NAME) {
      const name = String(result.NAME);
      ATTACHMENT_NAME_CACHE.set(key, name);
      return name;
    }
  } catch {
    // try disk.file.get below
  }
  try {
    const result = await bitrixCall<DiskMetaResult>('disk.file.get', { id: fileId });
    if (result?.NAME) {
      const name = String(result.NAME);
      ATTACHMENT_NAME_CACHE.set(key, name);
      return name;
    }
  } catch {
    // unknown id — кешуємо як пустий щоб не повторювати fetch
  }
  ATTACHMENT_NAME_CACHE.set(key, '');
  return null;
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
