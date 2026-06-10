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
  // JSON-wrapper. Якщо приходить JSON — декодуємо base64 з `result.file/data`
  // або робимо second-fetch на `result.url/downloadUrl`. Інакше — стрімінг
  // upstream (Disk API). У будь-якому випадку дістаємо справжнє ім'я з
  // Content-Disposition / JSON шобшобшоб у lightbox показати «photo.jpg»
  // замість «файл-313002» і MIME правильно визначив kind.
  const respContentType = upstream.headers.get('content-type') ?? '';

  // Helper: справжнє ім'я з Content-Disposition («attachment; filename="..."»).
  const filenameFromCD = (cd: string | null): string => {
    if (!cd) return '';
    // Спочатку шукаємо UTF-8 версію (`filename*=UTF-8''...`)
    const utf8 = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8) return decodeURIComponent(utf8[1]);
    const std = cd.match(/filename="?([^";]+)"?/i);
    return std ? std[1] : '';
  };

  // Content-Type → правильна підказка
  const contentTypeFromExt = (n: string): string => {
    const ext = n.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (!ext) return 'application/octet-stream';
    const map: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml', bmp: 'image/bmp',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
      pdf: 'application/pdf',
    };
    return map[ext] ?? 'application/octet-stream';
  };

  if (respContentType.includes('application/json')) {
    const json = (await upstream.json()) as {
      result?: string | {
        file?: string; data?: string; downloadUrl?: string; url?: string;
        name?: string; NAME?: string; fileName?: string;
      };
      error?: string;
      error_description?: string;
    };
    console.log(`[claims/${claimId}/file] Bitrix JSON keys:`, JSON.stringify(json).slice(0, 300));

    if (json.error) {
      return Response.json(
        { error: `Bitrix: ${json.error_description ?? json.error}` },
        { status: 502 },
      );
    }

    const r = json.result;
    let base64 = '';
    let secondaryUrl = '';
    let realName = '';
    if (typeof r === 'string') {
      base64 = r;
    } else if (r && typeof r === 'object') {
      base64 = r.file ?? r.data ?? '';
      secondaryUrl = r.downloadUrl ?? r.url ?? '';
      realName = String(r.name ?? r.NAME ?? r.fileName ?? '');
    }

    const finalName = realName || nameHint;
    const finalCT = realName ? contentTypeFromExt(realName) : contentTypeHint;

    if (base64) {
      const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleaned, 'base64');
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': finalCT,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `inline; filename="${encodeURIComponent(finalName)}"`,
          'Content-Length': String(buffer.length),
        },
      });
    }
    if (secondaryUrl) {
      const second = await fetch(secondaryUrl, { headers: { Accept: '*/*' } });
      if (!second.ok || !second.body) {
        return Response.json({ error: `secondary fetch HTTP ${second.status}` }, { status: 502 });
      }
      const secCD = filenameFromCD(second.headers.get('content-disposition'));
      const useName = realName || secCD || nameHint;
      const useCT =
        second.headers.get('content-type') ??
        (useName !== nameHint ? contentTypeFromExt(useName) : contentTypeHint);
      return new Response(second.body, {
        status: 200,
        headers: {
          'Content-Type': useCT,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `inline; filename="${encodeURIComponent(useName)}"`,
        },
      });
    }
    return Response.json({ error: 'unexpected Bitrix JSON shape' }, { status: 502 });
  }

  // Binary streaming — дістаємо реальне ім'я і MIME з upstream headers
  const upstreamCD = filenameFromCD(upstream.headers.get('content-disposition'));
  const finalName = upstreamCD || nameHint;
  const finalCT = respContentType || (upstreamCD ? contentTypeFromExt(upstreamCD) : contentTypeHint);
  const contentLength = upstream.headers.get('content-length');
  const headers: Record<string, string> = {
    'Content-Type': finalCT,
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': `inline; filename="${encodeURIComponent(finalName)}"`,
  };
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
