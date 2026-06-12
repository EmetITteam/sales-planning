/**
 * Bitrix SPA 1048 — створення картки верифікації нового клієнта.
 *
 * Використовується у /api/clients/verifications (POST) після того як
 * `registerNewClient` у 1С повернув успіх і ми маємо ClientID.
 *
 * Усі виклики через `process.env.BITRIX_WEBHOOK_URL` (server-only).
 * Помилки логуються але НЕ блокують основний flow — якщо Bitrix впав,
 * клієнт у 1С все одно створений, верифікацію можна додати руками.
 */

import {
  BITRIX_SPA_ENTITY_TYPE_ID,
  BITRIX_SPA_CATEGORY_ID,
  BITRIX_STAGES,
  BITRIX_FIELDS,
} from './client-verifications/types';

export interface VerificationFile {
  name: string;
  /** Base64-encoded content (без data:... префіксу). */
  contentBase64: string;
}

export interface CreateVerificationParams {
  clientId1c: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  managerLogin: string;
  files?: VerificationFile[];
}

export interface CreateVerificationResult {
  bitrixItemId: number;
}

/**
 * Створити картку у Bitrix SPA 1048. Повертає `bitrixItemId` для збереження
 * у `client_verifications.bitrix_item_id`.
 *
 * Кидає Error якщо webhook URL не налаштований або Bitrix відповів error.
 * Викликаючий API має try/catch і логувати — клієнт у 1С вже створений,
 * критично не блокувати UX.
 */
export async function createVerificationRequest(
  params: CreateVerificationParams,
): Promise<CreateVerificationResult> {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('BITRIX_WEBHOOK_URL env not set');
  }

  // Title картки — те що видно у списку Bitrix. Робимо людино-читане.
  const title = `Новий клієнт: ${params.clientName}`;

  const fields: Record<string, unknown> = {
    title,
    entityTypeId: BITRIX_SPA_ENTITY_TYPE_ID,
    categoryId: BITRIX_SPA_CATEGORY_ID,
    stageId: BITRIX_STAGES.NEW,
    [BITRIX_FIELDS.CLIENT_NAME]: params.clientName,
    [BITRIX_FIELDS.CLIENT_PHONE]: params.clientPhone,
    [BITRIX_FIELDS.CLIENT_ADDRESS]: params.clientAddress,
    [BITRIX_FIELDS.CLIENT_ID_1C]: params.clientId1c,
    [BITRIX_FIELDS.MANAGER_LOGIN]: params.managerLogin,
  };

  // Файли — той самий патерн що у reclamation-app/api/index.py для SPA 1038:
  // масив пар [filename, base64content]. Multiple-поле приймає список таких пар.
  if (params.files && params.files.length > 0) {
    fields[BITRIX_FIELDS.DOCUMENTS] = params.files.map(f => [f.name, f.contentBase64]);
  }

  // Bitrix webhook URL без trailing slash → додаємо метод напряму.
  const url = webhookUrl.replace(/\/$/, '') + '/crm.item.add';

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      entityTypeId: BITRIX_SPA_ENTITY_TYPE_ID,
      fields,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Bitrix HTTP ${r.status}: ${text.slice(0, 200)}`);
  }

  const data = await r.json();
  if (data.error) {
    throw new Error(`Bitrix error: ${data.error_description || data.error}`);
  }

  const itemId = data?.result?.item?.id;
  if (typeof itemId !== 'number') {
    throw new Error(`Bitrix returned no item id: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Шлемо колокольчик-уведомлення КЦ-менеджерам у Bitrix про нову
  // заявку. Той самий патерн що для рекламацій (reclamation-app шле
  // через im.notify для MED_DEPT_USER_IDS). Не блокуємо основний flow
  // якщо не вийде — fire-and-forget.
  void notifyKcAboutNewVerification(itemId, params.clientName).catch((e) => {
    console.error('[bitrix-verification] notifyKc failed:', e instanceof Error ? e.message : e);
  });

  return { bitrixItemId: itemId };
}

/**
 * KC_USER_IDS — список Bitrix user_id менеджерів колл-центру.
 *
 * Аналог `MED_DEPT_USER_IDS` у reclamation-app для рекламацій. Список
 * взято з проєкту `emet-call-center/config.py` (MANAGERS dict) —
 * Тетяна Пашкевич є керівником КЦ, інші — менеджери КЦ.
 *
 * Якщо склад КЦ змінюється — оновити тут, не у двох місцях:
 *   - emet-call-center/config.py:MANAGERS (для аналітики)
 *   - sales-planning тут (для notify при створенні клієнта)
 */
const KC_USER_IDS: number[] = [
  1519,  // Яна Наконечна
  2077,  // Анастасия Другтейн
  6894,  // Тетяна Пашкевич (керівник КЦ)
  13408, // Ірина Іщенко
  2094,  // Оксана Кошова
];

/**
 * Шле системне сповіщення у Bitrix-колокольчик для кожного КЦ-юзера.
 * Текст — клікабельне посилання на картку SPA 1048.
 */
async function notifyKcAboutNewVerification(itemId: number, clientName: string): Promise<void> {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl || KC_USER_IDS.length === 0) return;

  const url = webhookUrl.replace(/\/$/, '') + '/im.notify';
  const link = `https://bitrix.emet.in.ua/crm/type/${BITRIX_SPA_ENTITY_TYPE_ID}/details/${itemId}/`;
  const message = `🆕 [URL=${link}]Новий клієнт «${clientName}» на верифікацію[/URL] — створено у 1С, потребує підтвердження.`;

  // Шлемо паралельно. Збій одного user-а не блокує іншого.
  await Promise.allSettled(
    KC_USER_IDS.map((uid) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: uid, message, type: 'SYSTEM' }),
        signal: AbortSignal.timeout(5_000),
      }),
    ),
  );
}

/**
 * Витягти Bitrix item для перевірки/синхронізації. Використовується webhook
 * handler-ом коли приходить event щоб resolve clientId1c з bitrix item id.
 */
export async function fetchBitrixItem(itemId: number): Promise<Record<string, unknown> | null> {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) return null;

  const url = webhookUrl.replace(/\/$/, '') + '/crm.item.get';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ entityTypeId: BITRIX_SPA_ENTITY_TYPE_ID, id: itemId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data?.result?.item ?? null;
}
