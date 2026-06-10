/**
 * GET /api/claims/[id] — деталі однієї претензії з Bitrix24 SPA 1038.
 *
 * Доступ: тільки свій claim (поле manager_email = session.login).
 * Admin/Director можуть бачити чужі — поки що НЕ реалізовано (Sprint B+).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import {
  CLAIMS_SPA_ID,
  CLAIM_FIELDS,
  FIELD_MANAGER_EMAIL_IN_CLAIM,
  normalizeBitrixStage,
} from '@/lib/claims/constants';
import {
  bitrixGetClaim,
  bitrixResolveAttachmentName,
  BitrixError_,
} from '@/lib/claims/bitrix-client';
import type { ClaimAttachment, ClaimDetail } from '@/lib/claims/types';

/**
 * Нормалізує `ufCrm4_FILES` (Bitrix disk-field) у ClaimAttachment[].
 *
 * Bitrix віддає поле як array або об'єкт; кожен елемент часто = просто
 * file_id (string/number), або об'єкт з полями id/NAME. У старіших версіях
 * може повертати інший формат (downloadUrl/urlMachine), але цей URL вимагає
 * Bitrix-сесії та не працює для менеджерів — використовуємо id + proxy.
 */
/**
 * Нормалізує `ufCrm4_FILES` (Bitrix smart-process file-field) у ClaimAttachment[].
 *
 * Bitrix у цьому полі повертає масив об'єктів типу:
 *   `{ id: 313002, url: '/bitrix/.../file.php?fileId=313002&signature=...', urlMachine: '...' }`
 *
 * Це **b_file legacy IDs** — не з Disk API. `disk.file.get` і
 * `disk.attachedObject.get` для них fail-ять. АЛЕ у `url` уже є tokenized
 * посилання що валідне для прямого fetch. Беремо його як fallback і
 * передаємо у наш proxy через `?bitrixUrl=...` (з SSRF guard).
 */
async function normalizeClaimFiles(claimId: number, raw: unknown): Promise<ClaimAttachment[]> {
  if (!raw) return [];
  // DEBUG: який саме формат Bitrix віддає у ufCrm4_FILES для цього claim.
  // Потрібно щоб дізнатись чи приходять об'єкти з url/urlMachine, чи тільки
  // id як число. Видалити після фіксу.
  console.log(`[claims/${claimId}] ufCrm4_FILES raw:`, JSON.stringify(raw).slice(0, 800));
  const arr = Array.isArray(raw) ? raw : typeof raw === 'object' ? Object.values(raw) : [];

  type Pending = { fileId: string; name: string; bxUrl: string };
  const pending: Pending[] = [];
  for (const item of arr) {
    if (!item) continue;
    let fileId = '';
    let name = '';
    let bxUrl = '';
    if (typeof item === 'string' || typeof item === 'number') {
      fileId = String(item);
    } else if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      fileId = String(obj.id ?? obj.ID ?? obj.fileId ?? obj.fileID ?? '');
      name = String(obj.name ?? obj.NAME ?? obj.fileName ?? '');
      bxUrl = String(
        obj.downloadUrl ?? obj.urlMachine ?? obj.url ?? obj.showUrl ?? '',
      );
    }
    if (!fileId || !/^\d+$/.test(fileId)) continue;
    pending.push({ fileId, name, bxUrl });
  }

  // Якщо name нема — спробуємо resolve через Disk API (працює рідко
  // для b_file, але якщо файл був прив'язаний як AttachedObject — спрацює).
  return Promise.all(
    pending.map(async ({ fileId, name: rawName, bxUrl }) => {
      let name = rawName;
      if (!name) {
        name = (await bitrixResolveAttachmentName(fileId)) ?? `файл-${fileId}`;
      }
      // Витягуємо розширення з URL якщо name ще placeholder (наприклад
      // url містить `&fileName=photo.jpg`).
      if (name.startsWith('файл-') && bxUrl) {
        const m = bxUrl.match(/[?&](?:fileName|name)=([^&]+)/i);
        if (m) name = decodeURIComponent(m[1]);
      }
      const lower = name.toLowerCase();
      const kind: ClaimAttachment['kind'] =
        /\.(jpe?g|png|gif|webp|bmp|svg|heic)$/i.test(lower)
          ? 'image'
          : /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(lower)
            ? 'video'
            : 'other';
      // Proxy URL: fileId завжди передаємо, bxUrl як fallback якщо є.
      const proxyQs = bxUrl
        ? `?fileId=${encodeURIComponent(fileId)}&bitrixUrl=${encodeURIComponent(bxUrl)}`
        : `?fileId=${encodeURIComponent(fileId)}`;
      return {
        url: `/api/claims/${claimId}/file${proxyQs}`,
        name,
        kind,
      };
    }),
  );
}

interface BitrixItem {
  id: number | string;
  title?: string;
  stageId?: string;
  createdTime?: string;
  [key: string]: unknown;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  let item: BitrixItem | null;
  try {
    item = await bitrixGetClaim<BitrixItem>(CLAIMS_SPA_ID, id);
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }
  if (!item) {
    return Response.json({ error: 'claim not found' }, { status: 404 });
  }

  // Ownership check: тільки свій claim. Admin/Director — exception (TODO).
  const managerEmail = String(item[FIELD_MANAGER_EMAIL_IN_CLAIM] ?? '').toLowerCase().trim();
  const sessionEmail = session.login.toLowerCase().trim();
  if (session.role !== 'admin' && session.role !== 'director' && managerEmail !== sessionEmail) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const detail: ClaimDetail = {
    id: Number(item.id),
    title: String(item.title ?? ''),
    client: String(item.title ?? '').replace(/^Рекламація:\s*/, '').trim() || '—',
    date: String(item.createdTime ?? '').slice(0, 10),
    status: normalizeBitrixStage(item.stageId),
    product: (item[CLAIM_FIELDS.product] as string) ?? null,
    lot: (item[CLAIM_FIELDS.lot] as string) ?? null,
    invoice: (item[CLAIM_FIELDS.invoice] as string) ?? null,
    claimType: (item[CLAIM_FIELDS.claim_type] as string) ?? null,
    details: (item[CLAIM_FIELDS.details] as string) ?? null,
    managerName: (item[CLAIM_FIELDS.manager] as string) ?? null,
    managerEmail: managerEmail || null,
    attachments: await normalizeClaimFiles(id, item[CLAIM_FIELDS.files]),
  };

  return Response.json({ claim: detail });
}
