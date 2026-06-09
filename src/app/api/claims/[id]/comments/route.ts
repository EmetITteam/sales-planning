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
  BitrixError_,
  type BitrixComment,
} from '@/lib/claims/bitrix-client';
import type { ClaimComment } from '@/lib/claims/types';

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
    });
  }

  // Реверс — у чат-UI старіші зверху, новіші внизу (як у месенджерах).
  comments.reverse();

  return Response.json({ comments });
}

interface PostBody {
  text: string;
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

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const text = String(body.text ?? '').trim();
  if (!text) {
    return Response.json({ error: 'text required' }, { status: 400 });
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

  // Формат як у reclamation-app/api/index.py:314 — щоб get_comments міг
  // парсити ім'я менеджера з <b>...</b>.
  const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const formatted = `<b>${session.fullName}</b> (Менеджер):<br>${escapedText.replace(/\n/g, '<br>')}`;

  try {
    await bitrixAddComment(id, CLAIMS_SPA_ID, formatted);
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
