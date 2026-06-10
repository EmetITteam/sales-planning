/**
 * GET /api/claims/[id]/file?fileId=N — proxy для Bitrix Disk файлів.
 *
 * Проблема: Bitrix віддає файли у `FILES` як URL, який вимагає авторизації
 * Bitrix-сесією. Менеджери не мають акаунтів у Bitrix → пряме відкриття
 * URL у браузері дає `invalid_authentication` / `allowed_only_intranet_user`.
 *
 * Рішення: запит з фронта йде сюди, ми викликаємо `disk.file.get` через
 * webhook (server-side), отримуємо tokenized DOWNLOAD_URL, fetch-имо і
 * стрімимо байти у відповідь.
 *
 * Security:
 *  - Auth + ownership check (тільки свій claim).
 *  - fileId — int, валідуємо.
 *  - DOWNLOAD_URL завжди bitrixHost (інакше нема сенсу — Bitrix не верне).
 *
 * Cache: 1 година приватний кеш у браузері. Bitrix-токен може протермінуватись,
 * але для preview це OK; якщо файл оновиться — нам по hash це не зрозуміти.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { CLAIMS_SPA_ID, FIELD_MANAGER_EMAIL_IN_CLAIM } from '@/lib/claims/constants';
import {
  bitrixGetClaim,
  bitrixGetDiskDownloadUrl,
  bitrixHost,
  BitrixError_,
} from '@/lib/claims/bitrix-client';

interface OwnerClaimItem {
  [key: string]: unknown;
}

async function assertOwns(id: number, sessionLogin: string, sessionRole: string) {
  const item = await bitrixGetClaim<OwnerClaimItem>(CLAIMS_SPA_ID, id);
  if (!item) return { ok: false as const, status: 404 };
  const managerEmail = String(item[FIELD_MANAGER_EMAIL_IN_CLAIM] ?? '').toLowerCase().trim();
  const sessionEmail = sessionLogin.toLowerCase().trim();
  const isAdminLike = sessionRole === 'admin' || sessionRole === 'director';
  if (!isAdminLike && managerEmail !== sessionEmail) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const };
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
  const claimId = Number(idStr);
  if (!Number.isInteger(claimId) || claimId <= 0) {
    return Response.json({ error: 'invalid claim id' }, { status: 400 });
  }

  const fileIdStr = request.nextUrl.searchParams.get('fileId');
  if (!fileIdStr || !/^\d+$/.test(fileIdStr)) {
    return Response.json({ error: 'fileId required (integer)' }, { status: 400 });
  }
  const fileId = Number(fileIdStr);

  // Ownership check
  try {
    const own = await assertOwns(claimId, session.login, session.role);
    if (!own.ok) {
      return Response.json({ error: 'Forbidden' }, { status: own.status });
    }
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Спочатку пробуємо Disk API (працює для AttachedObject / Disk File ID
  // з timeline-коментарів). Якщо null — є fallback на bitrixUrl з
  // самого ufCrm4_FILES (там Bitrix віддає tokenized URL прямо у відповіді).
  let urlToFetch = '';
  let contentTypeHint = 'application/octet-stream';
  let nameHint = `file-${fileId}`;

  const meta = await bitrixGetDiskDownloadUrl(fileId);
  if (meta) {
    urlToFetch = meta.url;
    contentTypeHint = meta.contentType;
    nameHint = meta.name;
  } else {
    // Fallback на bitrixUrl з query (для smart-process FILES що b_file legacy)
    const fallback = request.nextUrl.searchParams.get('bitrixUrl');
    if (fallback) {
      try {
        const host = bitrixHost();
        // Bitrix URL може приходити як relative path → побудуємо абсолютний.
        const absolute = fallback.startsWith('/')
          ? `https://${host}${fallback}`
          : fallback;
        const parsed = new URL(absolute);
        if (parsed.host !== host) {
          return Response.json({ error: 'forbidden host in bitrixUrl' }, { status: 403 });
        }
        urlToFetch = absolute;
      } catch {
        return Response.json({ error: 'invalid bitrixUrl' }, { status: 400 });
      }
    }
  }

  if (!urlToFetch) {
    console.warn(
      `[claims/${claimId}/file] fileId=${fileId} resolve failed: disk-meta=${!!meta}, bitrixUrl=${request.nextUrl.searchParams.get('bitrixUrl') ?? 'NONE'}`,
    );
    return Response.json({ error: 'file not found in Bitrix Disk' }, { status: 404 });
  }
  console.log(`[claims/${claimId}/file] fileId=${fileId} → fetching: ${urlToFetch.slice(0, 120)}...`);

  // Fetch і стрімимо
  let upstream: Response;
  try {
    upstream = await fetch(urlToFetch, {
      headers: { Accept: '*/*' },
    });
  } catch (e) {
    console.warn(`[claims/${claimId}/file] upstream fetch failed:`, e);
    return Response.json({ error: 'upstream fetch failed' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: `Bitrix returned HTTP ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  // Bitrix REST endpoint `crm.controller.item.getFile` через webhook повертає
  // JSON-wrapper: `{ result: { file: 'base64...' } }` або `{ result: 'base64...' }`.
  // Якщо так — декодуємо base64 і віддаємо бінарні байти. Інакше — streaming
  // оригіналу (Disk API повертає бінарний контент напряму).
  const respContentType = upstream.headers.get('content-type') ?? '';
  if (respContentType.includes('application/json')) {
    const json = (await upstream.json()) as {
      result?: string | { file?: string; data?: string; downloadUrl?: string; url?: string };
      error?: string;
      error_description?: string;
    };
    console.log(`[claims/${claimId}/file] Bitrix JSON keys:`, JSON.stringify(json).slice(0, 200));

    // Bitrix error?
    if (json.error) {
      return Response.json(
        { error: `Bitrix: ${json.error_description ?? json.error}` },
        { status: 502 },
      );
    }
    // Витягуємо base64 або вторинний URL
    const r = json.result;
    let base64 = '';
    let secondaryUrl = '';
    if (typeof r === 'string') {
      base64 = r;
    } else if (r && typeof r === 'object') {
      base64 = r.file ?? r.data ?? '';
      secondaryUrl = r.downloadUrl ?? r.url ?? '';
    }

    if (base64) {
      // Bitrix іноді віддає base64 з префіксом `data:image/jpeg;base64,...`
      const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleaned, 'base64');
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentTypeHint,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `inline; filename="${encodeURIComponent(nameHint)}"`,
          'Content-Length': String(buffer.length),
        },
      });
    }
    if (secondaryUrl) {
      const second = await fetch(secondaryUrl, { headers: { Accept: '*/*' } });
      if (!second.ok || !second.body) {
        return Response.json({ error: `secondary fetch HTTP ${second.status}` }, { status: 502 });
      }
      return new Response(second.body, {
        status: 200,
        headers: {
          'Content-Type': second.headers.get('content-type') ?? contentTypeHint,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `inline; filename="${encodeURIComponent(nameHint)}"`,
        },
      });
    }
    return Response.json({ error: 'unexpected Bitrix JSON shape' }, { status: 502 });
  }

  // Streaming оригіналу (binary content)
  const contentLength = upstream.headers.get('content-length');
  const headers: Record<string, string> = {
    'Content-Type': respContentType || contentTypeHint,
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': `inline; filename="${encodeURIComponent(nameHint)}"`,
  };
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
