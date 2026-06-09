/**
 * POST /api/claims — створити нову претензію у Bitrix24 SPA 1038.
 *
 * Flow (Sprint A — без файлів):
 *  1. Валідовуємо JWT-сесію менеджера (його login = email).
 *  2. Серіалізуємо анкету через `serializeAnketa` → текст для поля `details`.
 *  3. Викликаємо `bitrixCreateClaim` → отримуємо новий ID.
 *  4. Шлемо `im.notify` мед-відділу (5 user-ID з constants).
 *  5. Повертаємо `{ id, link }` клієнту.
 *
 * Файли (Sprint A.4): браузер шле напряму у Bitrix через `disk.folder.uploadfile`
 * (треба перевірити CORS). Тут поки що ігноруємо.
 *
 * Чат у Bitrix timeline (Sprint B) — окремий PATCH endpoint.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import {
  CLAIMS_SPA_ID,
  CLAIM_FIELDS,
  CLAIM_TYPES,
  MED_DEPT_USER_IDS,
  PRODUCTS,
  type ClaimType,
  type ProductCode,
} from '@/lib/claims/constants';
import { serializeAnketa } from '@/lib/claims/anketa-schema';
import { bitrixCreateClaim, bitrixNotifyUser, BitrixError_ } from '@/lib/claims/bitrix-client';

interface CreateClaimBody {
  /** Клієнт (з ClientPicker — переважно ID + display name з 1С). */
  client: string;
  /** ClientID з 1С — для майбутньої прив'язки claim ↔ client (Sprint C). */
  clientId1c?: string | null;
  /** ID нашої зустрічі — якщо створено з картки зустрічі (Sprint C). */
  meetingId?: string | null;
  /** Тип скарги. */
  claimType: ClaimType;
  /** Препарат (key з PRODUCTS). */
  product: ProductCode;
  /** LOT номер партії препарату. */
  lot: string;
  /** № реалізації (необов'язково). */
  invoice?: string | null;
  /** Значення полів анкети (id → string). */
  anketa: Record<string, string>;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CreateClaimBody;
  try {
    body = (await request.json()) as CreateClaimBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // Валідація обов'язкових полів — типи перевіряємо через TS на компайл-таймі,
  // але у runtime треба перевірити що значення передані.
  const errors: string[] = [];
  if (!body.client?.trim()) errors.push('client required');
  if (!body.claimType || !(body.claimType in CLAIM_TYPES)) errors.push('claimType invalid');
  if (!body.product || !(body.product in PRODUCTS)) errors.push('product invalid');
  if (!body.lot?.trim()) errors.push('lot required');
  if (!body.anketa || typeof body.anketa !== 'object') errors.push('anketa required');
  if (errors.length > 0) {
    return Response.json({ error: `Validation: ${errors.join(', ')}` }, { status: 400 });
  }

  // Серіалізуємо анкету у текст для Bitrix `details`.
  const detailsText = serializeAnketa(body.product, body.anketa);
  const claimTypeReadable = CLAIM_TYPES[body.claimType];

  // Готуємо Bitrix-поля (з префіксами ufCrm4_*).
  const bxFields: Record<string, unknown> = {
    [CLAIM_FIELDS.title]: `Рекламація: ${body.client}`,
    [CLAIM_FIELDS.product]: body.product,
    [CLAIM_FIELDS.claim_type]: claimTypeReadable,
    [CLAIM_FIELDS.lot]: body.lot,
    [CLAIM_FIELDS.invoice]: body.invoice?.trim() || '-',
    [CLAIM_FIELDS.details]: detailsText,
    [CLAIM_FIELDS.manager]: session.fullName,
    [CLAIM_FIELDS.manager_email]: session.login,
    OPENED: 'Y',
  };

  let newClaim: { id: number };
  try {
    newClaim = await bitrixCreateClaim(bxFields, CLAIMS_SPA_ID);
  } catch (e) {
    if (e instanceof BitrixError_) {
      console.error('[claims.POST] Bitrix create failed', {
        code: e.code,
        description: e.description,
        manager: session.login,
        client: body.client,
      });
      return Response.json(
        { error: `Bitrix: ${e.description}` },
        { status: 502 },
      );
    }
    throw e;
  }

  const link = `https://bitrix.emet.in.ua/crm/type/${CLAIMS_SPA_ID}/details/${newClaim.id}/`;

  // Notify мед-відділу — НЕ блокуємо відповідь клієнту. Помилка нотіфу
  // не критична: claim вже створений у Bitrix, мед-відділ побачить його у
  // своєму UI або через email-нотіф Bitrix-workflow.
  const notifyMsg = `[URL=${link}]Нова рекламація #${newClaim.id}[/URL]\nКлієнт: ${body.client}\nМенеджер: ${session.fullName}`;
  Promise.all(
    MED_DEPT_USER_IDS.map(uid =>
      bitrixNotifyUser(uid, notifyMsg).catch(err => {
        console.warn(`[claims.POST] notify user ${uid} failed:`, err);
      }),
    ),
  ).catch(() => undefined);

  return Response.json({
    id: newClaim.id,
    link,
    success: true,
  });
}
