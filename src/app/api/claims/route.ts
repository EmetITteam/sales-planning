/**
 * POST /api/claims — створити нову претензію у Bitrix24 SPA 1038.
 * GET  /api/claims — список претензій менеджера (з Bitrix фільтр по managerEmail).
 *
 * POST (multipart/form-data):
 *   - client, clientId1c, meetingId
 *   - claimType, product, lot, invoice
 *   - otherProductName (якщо product='OTHER')
 *   - simpleDesc (якщо тип НЕ медичний)
 *   - anketa (JSON-string з полями для медичних типів)
 *   - files: File[] (фото/відео, до ~4MB сумарно)
 *
 * GET — pull з Bitrix `crm.item.list`, нормалізуємо в ClaimSummary[].
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import {
  CLAIMS_SPA_ID,
  CLAIM_FIELDS,
  CLAIM_TYPES,
  FIELD_MANAGER_EMAIL_IN_CLAIM,
  MED_DEPT_USER_IDS,
  PRODUCTS,
  normalizeBitrixStage,
  type ClaimType,
  type ProductCode,
} from '@/lib/claims/constants';
import { serializeClaimDetails, MEDICAL_CLAIM_TYPES } from '@/lib/claims/anketa-schema';
import {
  bitrixCreateClaim,
  bitrixListClaims,
  bitrixListComments,
  bitrixNotifyUser,
  BitrixError_,
} from '@/lib/claims/bitrix-client';
import type { ClaimSummary } from '@/lib/claims/types';

/**
 * Detect чи останній коментар у timeline — від мед-відділу (без відповіді
 * менеджера). Використовується для unread-badge у списку /claims.
 *
 * Той самий regex що у /api/claims/[id]/comments GET: менеджерські коментарі
 * мають формат «<b>Name</b> (Менеджер):<br>...». Якщо НЕ matches — це мед-відділ.
 */
const MANAGER_PATTERN = /^<b>(.+?)<\/b>\s*\(Менеджер\)/;

interface BitrixListItem {
  id: number | string;
  title: string;
  stageId?: string;
  createdTime?: string;
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Фільтр по managerEmail. Admin/Director можуть бачити чужі claims через
  // ?managerEmail=... — поки що ні (Sprint B+), завжди тільки свої.
  const filter = { [FIELD_MANAGER_EMAIL_IN_CLAIM]: session.login };

  let items: BitrixListItem[];
  try {
    items = await bitrixListClaims<BitrixListItem>(CLAIMS_SPA_ID, filter);
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  const baseClaims: ClaimSummary[] = items.map(item => ({
    id: Number(item.id),
    title: item.title ?? '',
    client: (item.title ?? '').replace(/^Рекламація:\s*/, '').trim() || '—',
    date: (item.createdTime ?? '').slice(0, 10),
    status: normalizeBitrixStage(item.stageId),
  }));

  // Sprint 2B.B+: для кожної рекламації паралельно тягнемо timeline-коментарі
  // і визначаємо чи останній — від мед-відділу (unread badge для менеджера).
  //
  // Bitrix REST дозволяє кілька паралельних викликів (~10-20 swift), а у
  // менеджера зазвичай <50 рекламацій → загалом ~5-15с у найгіршому. Для
  // подальшої оптимізації можна перейти на batch endpoint.
  //
  // Якщо bitrixListComments фейлить для конкретної рекламації — нехай вона
  // буде без флага unread (не блокуємо весь list).
  const enriched: ClaimSummary[] = await Promise.all(
    baseClaims.map(async claim => {
      try {
        const comments = await bitrixListComments(claim.id, CLAIMS_SPA_ID);
        if (comments.length === 0) return claim;
        // bitrixListComments order DESC → перший це найновіший
        const last = comments[0];
        const text = last.COMMENT ?? '';
        const isManagerLast = MANAGER_PATTERN.test(text);
        return {
          ...claim,
          hasUnread: !isManagerLast,
          lastCommentAt: last.CREATED,
        };
      } catch (err) {
        console.warn(`[claims.GET] comments for #${claim.id} failed:`, err);
        return claim;
      }
    }),
  );

  return Response.json({ claims: enriched });
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'invalid form-data body' }, { status: 400 });
  }

  // Витягуємо текстові поля
  const client = String(form.get('client') ?? '').trim();
  const clientId1c = String(form.get('clientId1c') ?? '').trim() || null;
  const meetingId = String(form.get('meetingId') ?? '').trim() || null;
  const claimType = String(form.get('claimType') ?? '') as ClaimType;
  const product = String(form.get('product') ?? '') as ProductCode;
  const lot = String(form.get('lot') ?? '').trim();
  const invoice = String(form.get('invoice') ?? '').trim();
  const otherProductName = String(form.get('otherProductName') ?? '').trim();
  const simpleDesc = String(form.get('simpleDesc') ?? '').trim();
  let anketa: Record<string, string> = {};
  try {
    const raw = String(form.get('anketa') ?? '{}');
    anketa = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid anketa JSON' }, { status: 400 });
  }

  // Validation
  const errors: string[] = [];
  if (!client) errors.push('client required');
  if (!claimType || !(claimType in CLAIM_TYPES)) errors.push('claimType invalid');
  if (!product || !(product in PRODUCTS)) errors.push('product invalid');
  if (!lot) errors.push('lot required');
  if (product === 'OTHER' && !otherProductName) errors.push('otherProductName required for OTHER product');
  const isMedical = (MEDICAL_CLAIM_TYPES as readonly string[]).includes(claimType);
  if (!isMedical && !simpleDesc) errors.push('simpleDesc required for non-medical types');
  if (errors.length > 0) {
    return Response.json({ error: `Validation: ${errors.join(', ')}` }, { status: 400 });
  }

  // Об'єднуємо всі поля для serializeClaimDetails (anketa + simple_desc + other_product_name).
  const allValues = {
    ...anketa,
    simple_desc: simpleDesc,
    other_product_name: otherProductName,
  };
  let detailsText = serializeClaimDetails(product, claimType, allValues);

  // Додаємо meetingId у details якщо є — для майбутнього посилання назад.
  if (meetingId) {
    detailsText = `[Sales-Planning meeting: ${meetingId}]\n${detailsText}`;
  }

  // Файли — Bitrix чекає масив [filename, base64-content] у поле disk.
  // Ліміт Vercel body — 4.5MB, файли мають бути обмежені на UI.
  const filesList: Array<[string, string]> = [];
  const fileEntries = form.getAll('files').filter((v): v is File => v instanceof File);
  for (const f of fileEntries) {
    const bytes = await f.arrayBuffer();
    const b64 = Buffer.from(bytes).toString('base64');
    filesList.push([f.name, b64]);
  }

  // Готуємо Bitrix-поля.
  const bxFields: Record<string, unknown> = {
    [CLAIM_FIELDS.title]: `Рекламація: ${client}`,
    [CLAIM_FIELDS.product]: product,
    [CLAIM_FIELDS.claim_type]: CLAIM_TYPES[claimType],
    [CLAIM_FIELDS.lot]: lot,
    [CLAIM_FIELDS.invoice]: invoice || '-',
    [CLAIM_FIELDS.details]: detailsText,
    [CLAIM_FIELDS.manager]: session.fullName,
    [CLAIM_FIELDS.manager_email]: session.login,
    OPENED: 'Y',
  };
  if (filesList.length > 0) {
    bxFields[CLAIM_FIELDS.files] = filesList;
  }

  let newClaim: { id: number };
  try {
    newClaim = await bitrixCreateClaim(bxFields, CLAIMS_SPA_ID);
  } catch (e) {
    if (e instanceof BitrixError_) {
      console.error('[claims.POST] Bitrix create failed', {
        code: e.code,
        description: e.description,
        manager: session.login,
        client,
      });
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Зменшуємо unused-var warning
  void clientId1c;

  const link = `https://bitrix.emet.in.ua/crm/type/${CLAIMS_SPA_ID}/details/${newClaim.id}/`;

  // Notify мед-відділу — non-blocking.
  const notifyMsg = `[URL=${link}]Нова рекламація #${newClaim.id}[/URL]\nКлієнт: ${client}\nМенеджер: ${session.fullName}`;
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
