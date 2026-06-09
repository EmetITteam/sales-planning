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
import { bitrixGetClaim, BitrixError_ } from '@/lib/claims/bitrix-client';
import type { ClaimAttachment, ClaimDetail } from '@/lib/claims/types';

/**
 * Нормалізує `ufCrm4_FILES` (Bitrix disk-field) у ClaimAttachment[].
 *
 * Bitrix віддає поле як array або об'єкт з downloadUrl/showUrl/urlMachine
 * залежно від версії. Збираємо все що схоже на URL у єдиному форматі.
 */
function normalizeClaimFiles(raw: unknown): ClaimAttachment[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : typeof raw === 'object' ? Object.values(raw) : [];
  const out: ClaimAttachment[] = [];
  for (const item of arr) {
    if (!item) continue;
    let url = '';
    let name = 'файл';
    if (typeof item === 'string') {
      url = item;
    } else if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      url = String(obj.downloadUrl ?? obj.url ?? obj.urlMachine ?? obj.showUrl ?? '');
      name = String(obj.name ?? obj.fileName ?? obj.NAME ?? 'файл');
    }
    if (!url) continue;
    const lower = name.toLowerCase();
    const kind: ClaimAttachment['kind'] =
      /\.(jpe?g|png|gif|webp|bmp|svg|heic)$/i.test(lower)
        ? 'image'
        : /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(lower)
          ? 'video'
          : 'other';
    out.push({ url, name, kind });
  }
  return out;
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
    attachments: normalizeClaimFiles(item[CLAIM_FIELDS.files]),
  };

  return Response.json({ claim: detail });
}
