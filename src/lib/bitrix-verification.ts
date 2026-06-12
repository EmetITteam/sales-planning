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

export interface CreateVerificationParams {
  clientId1c: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  managerLogin: string;
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

  return { bitrixItemId: itemId };
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
