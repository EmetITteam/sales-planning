/**
 * GET  /api/claims/[id]/comments — список коментарів (timeline) претензії.
 * POST /api/claims/[id]/comments — додати коментар від менеджера.
 *
 * Доступ: тільки свій claim. Перевіряємо через `bitrixGetClaim` → managerEmail.
 *
 * Логіка автора:
 *  - AUTHOR_ID=null/0 → менеджер з нашого додатку. Ім'я витягуємо з `<b>...</b>`
 *    у тексті (формат `bitrixAddComment` шле саме так).
 *  - AUTHOR_ID=<int> → Bitrix-користувач (мед-відділ). Тягнемо ім'я через `user.get`.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import {
  CLAIMS_SPA_ID,
  CLAIM_FIELDS,
  FIELD_MANAGER_EMAIL_IN_CLAIM,
  MED_DEPT_USER_IDS,
} from '@/lib/claims/constants';
import {
  bitrixAddComment,
  bitrixGetClaim,
  bitrixGetUserName,
  bitrixListComments,
  bitrixNotifyUser,
  bitrixResolveAttachmentName,
  BitrixError_,
  type BitrixComment,
  type BitrixCommentFile,
} from '@/lib/claims/bitrix-client';
import type { ClaimAttachment, ClaimComment } from '@/lib/claims/types';

/**
 * Нормалізуємо FILES з Bitrix у ClaimAttachment[].
 *
 * ⚠️ Bitrix-URL у `f.url` вимагає авторизації Bitrix-сесією — менеджери у
 * Bitrix не залогінені, тому пряме відкриття дасть `invalid_authentication`.
 * Замість raw URL віддаємо наш proxy: `/api/claims/{claimId}/file?fileId=X`.
 * Proxy на сервері викличе `disk.file.get` і стрімить байти через webhook auth.
 */
async function normalizeAttachments(
  claimId: number,
  files?: BitrixCommentFile[] | Record<string, BitrixCommentFile>,
): Promise<ClaimAttachment[]> {
  if (!files) return [];
  const arr = Array.isArray(files) ? files : Object.values(files);
  const candidates = arr.filter(
    (f): f is BitrixCommentFile => Boolean(f && typeof f === 'object' && f.id),
  );
  // Bitrix `crm.timeline.comment.list` повертає FILES часто без NAME →
  // паралельно резолвимо справжні імена через disk.attachedObject.get.
  return Promise.all(
    candidates.map(async f => {
      let name = String(f.name ?? '');
      if (!name) {
        name = (await bitrixResolveAttachmentName(f.id!)) ?? `файл-${f.id}`;
      }
      const lower = name.toLowerCase();
      const kind: ClaimAttachment['kind'] =
        /\.(jpe?g|png|gif|webp|bmp|svg|heic)$/i.test(lower)
          ? 'image'
          : /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(lower)
            ? 'video'
            : 'other';
      return {
        url: `/api/claims/${claimId}/file?fileId=${encodeURIComponent(String(f.id))}`,
        name,
        kind,
      };
    }),
  );
}

interface OwnerClaimItem {
  [key: string]: unknown;
}

async function assertOwnsClaim(id: number, sessionLogin: string, sessionRole: string) {
  const item = await bitrixGetClaim<OwnerClaimItem>(CLAIMS_SPA_ID, id);
  if (!item) return { ok: false, status: 404, error: 'claim not found' as const };
  const managerEmail = String(item[FIELD_MANAGER_EMAIL_IN_CLAIM] ?? '').toLowerCase().trim();
  const sessionEmail = sessionLogin.toLowerCase().trim();
  const isAdminLike = sessionRole === 'admin' || sessionRole === 'director';
  if (!isAdminLike && managerEmail !== sessionEmail) {
    return { ok: false, status: 403, error: 'Forbidden' as const };
  }
  return { ok: true as const, managerEmail };
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

  // Ownership check
  try {
    const own = await assertOwnsClaim(id, session.login, session.role);
    if (!own.ok) return Response.json({ error: own.error }, { status: own.status });
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Тягнемо коментарі
  let raw: BitrixComment[];
  try {
    raw = await bitrixListComments(id, CLAIMS_SPA_ID);
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Нормалізуємо: detect authorType по ФОРМАТУ тексту, не по AUTHOR_ID.
  //
  // ⚠️ Bitrix webhook-token має власника (інтегратор-юзер), тому ВСІ комент.
  // з нашого додатку приходять з AUTHOR_ID = той же інтегратор (наприклад 2049).
  // А цей же ID часто є у MED_DEPT_USER_IDS — тому detect по AUTHOR_ID ламається.
  //
  // Натомість дивимось на формат: менеджерські коментарі ми шлемо у форматі
  // «<b>FullName</b> (Менеджер):<br>text». Якщо текст починається з цього
  // патерна — це менеджер. Інакше — Bitrix-користувач (мед-відділ).
  const MANAGER_PATTERN = /^<b>(.+?)<\/b>\s*\(Менеджер\)/;
  const comments: ClaimComment[] = [];
  for (const c of raw) {
    const text = c.COMMENT ?? '';
    const managerMatch = text.match(MANAGER_PATTERN);
    let author = '';
    let authorType: 'manager' | 'bitrix';
    if (managerMatch) {
      author = managerMatch[1];
      authorType = 'manager';
    } else {
      authorType = 'bitrix';
      const authorId = c.AUTHOR_ID;
      author = authorId ? await bitrixGetUserName(authorId) : 'Мед-відділ';
    }
    comments.push({
      id: c.ID,
      text,
      author,
      authorType,
      createdAt: c.CREATED,
      attachments: await normalizeAttachments(id, c.FILES),
    });
  }

  // Реверс — у чат-UI старіші зверху, новіші внизу (як у месенджерах).
  comments.reverse();

  return Response.json({ comments });
}

export async function POST(
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

  // Multipart/form-data — бо у чаті можна прикріпити файли.
  // Поля: text (string) + files (File[]).
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'invalid form-data body' }, { status: 400 });
  }
  const text = String(form.get('text') ?? '').trim();
  const fileEntries = form.getAll('files').filter((v): v is File => v instanceof File);

  // Дозволяємо текст-без-файлів, файли-без-тексту, обидва. НЕ пусто.
  if (!text && fileEntries.length === 0) {
    return Response.json({ error: 'text or files required' }, { status: 400 });
  }
  if (text.length > 5000) {
    return Response.json({ error: 'text too long (>5000 chars)' }, { status: 400 });
  }

  // Ownership check (claim існує і належить менеджеру)
  try {
    const own = await assertOwnsClaim(id, session.login, session.role);
    if (!own.ok) return Response.json({ error: own.error }, { status: own.status });
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Файли → base64 для Bitrix `crm.timeline.comment.add` поле FILES.
  const filesB64: Array<[string, string]> = [];
  for (const f of fileEntries) {
    const bytes = await f.arrayBuffer();
    const b64 = Buffer.from(bytes).toString('base64');
    filesB64.push([f.name, b64]);
  }

  // Формат тексту — той самий що у reclamation-app/api/index.py:314 — щоб
  // get_comments міг парсити ім'я менеджера з <b>...</b>.
  // Якщо менеджер тільки прикріпив файли (без тексту) — пишемо placeholder
  // «Прикріплено файли» щоб коментар не був порожнім (Bitrix не приймає).
  const visibleText = text || `Прикріплено ${filesB64.length} ${filesB64.length === 1 ? 'файл' : 'файлів'}`;
  const escapedText = visibleText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const formatted = `<b>${session.fullName}</b> (Менеджер):<br>${escapedText.replace(/\n/g, '<br>')}`;

  try {
    await bitrixAddComment(id, CLAIMS_SPA_ID, formatted, filesB64.length > 0 ? filesB64 : undefined);
  } catch (e) {
    if (e instanceof BitrixError_) {
      return Response.json({ error: `Bitrix: ${e.description}` }, { status: 502 });
    }
    throw e;
  }

  // Notify мед-відділу — non-blocking.
  const link = `https://bitrix.emet.in.ua/crm/type/${CLAIMS_SPA_ID}/details/${id}/`;
  const notifyMsg = `[URL=${link}]Новий коментар у заявці #${id}[/URL] від менеджера.`;
  Promise.all(
    MED_DEPT_USER_IDS.map(uid =>
      bitrixNotifyUser(uid, notifyMsg).catch(err => {
        console.warn(`[claims/${id}/comments.POST] notify user ${uid} failed:`, err);
      }),
    ),
  ).catch(() => undefined);

  return Response.json({ success: true });
}
