/**
 * Коментарі директора по продажах до плану менеджера (по бренду/сегменту).
 *
 * POST — створити коментар. Опційно розфіналізувати цей бренд (щоб менеджер
 *        міг переробити). Прилітає менеджеру у колокольчик.
 *        Доступ: role director | admin (директор бачить усіх менеджерів).
 * GET  — тред коментарів по (managerLogin, periodId, segmentCode).
 *        Доступ: сам менеджер (свій план) або director | admin.
 *
 * Гранулярність (manager × period × segment) — паритет з period_summaries.
 * Розфіналізація тут дозволена директору ЗАВЖДИ (в обхід can_unfinalize_plans),
 * бо це навмисний директорський workflow.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';
import { SEGMENTS } from '@/lib/mock-data';

const MAX_TEXT = 2000;

function resolvePid(periodId: number, month?: string): number {
  if (month && /^\d{4}-\d{2}/.test(String(month))) return monthlyPidFromMonth(String(month));
  const pure = monthlyPidFromAnyPid(periodId);
  return pure !== periodId ? pure : periodId;
}
function brandName(code: string): string {
  return SEGMENTS.find(s => s.code === code)?.name ?? code;
}

interface PostBody {
  targetLogin?: string;     // менеджер (чий план)
  periodId?: number;
  period?: { month?: string };
  segmentCode?: string;
  text?: string;
  unfinalize?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Фіча — лише для директора по продажах / адміна.
  if (session.role !== 'director' && session.role !== 'admin') {
    return Response.json({ error: 'Forbidden: тільки директор або адмін' }, { status: 403 });
  }

  let body: PostBody;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { targetLogin, periodId, period, segmentCode, unfinalize } = body;
  const text = (body.text ?? '').trim();
  if (!targetLogin || !segmentCode || typeof periodId !== 'number') {
    return Response.json({ error: 'targetLogin + segmentCode + periodId required' }, { status: 400 });
  }
  if (!text) return Response.json({ error: 'Порожній коментар' }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `Коментар задовгий (>${MAX_TEXT})` }, { status: 400 });

  const monthlyPid = resolvePid(periodId, period?.month);
  const action = unfinalize ? 'comment_unfinalize' : 'comment';

  // 1) Коментар.
  const { data: inserted, error: insErr } = await supabase
    .from('plan_comments')
    .insert([{
      manager_login: targetLogin,
      period_id: monthlyPid,
      segment_code: segmentCode,
      author_login: session.login,
      author_name: session.fullName,
      text,
      action,
    }])
    .select('id, created_at')
    .single();
  if (insErr) {
    console.error('[plan-comment.POST] insert error', insErr.message);
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  // 2) Розфіналізація бренда (опційно) — PATCH period_summaries.
  if (unfinalize) {
    const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (URL_BASE && KEY) {
      const qs = [
        `period_id=eq.${monthlyPid}`,
        `user_id=eq.${encodeURIComponent(targetLogin)}`,
        `segment_code=eq.${encodeURIComponent(segmentCode)}`,
      ].join('&');
      const r = await fetch(`${URL_BASE}/rest/v1/period_summaries?${qs}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ finalized_at: null, finalized_by: null }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.error('[plan-comment.POST] unfinalize error', r.status, t.slice(0, 200));
        // Коментар уже збережено — не валимо весь запит, повертаємо warning.
        return Response.json({ success: true, id: inserted?.id, unfinalizeError: `HTTP ${r.status}` });
      }
    }
  }

  // 3) Колокольчик менеджеру (fire-and-forget — не валимо запит якщо не вставилось).
  const bn = brandName(segmentCode);
  try {
    await supabase.from('notifications').insert([{
      user_login: targetLogin,
      type: 'plan_director_comment',
      title: unfinalize ? `План на переробку · ${bn}` : `Коментар до плану · ${bn}`,
      message: text,
      link: '/',
      meta: { segmentCode, periodId: monthlyPid, authorLogin: session.login, authorName: session.fullName, action },
      dedup_key: null,
    }]);
  } catch (e) {
    console.warn('[plan-comment.POST] notification insert failed:', (e as Error).message);
  }

  return Response.json({ success: true, id: inserted?.id, createdAt: inserted?.created_at, unfinalized: !!unfinalize });
}

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const managerLogin = sp.get('managerLogin') ?? session.login;
  const segmentCode = sp.get('segmentCode');
  const periodIdRaw = sp.get('periodId');
  const month = sp.get('month') ?? undefined;

  // Доступ: свій план — або director/admin (бачать усіх).
  if (managerLogin !== session.login && session.role !== 'director' && session.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!periodIdRaw) return Response.json({ error: 'periodId required' }, { status: 400 });
  const monthlyPid = resolvePid(Number(periodIdRaw), month);

  let q = supabase
    .from('plan_comments')
    .select('id, segment_code, author_login, author_name, text, action, created_at')
    .eq('manager_login', managerLogin)
    .eq('period_id', monthlyPid)
    .order('created_at', { ascending: true });
  if (segmentCode) q = q.eq('segment_code', segmentCode);

  const { data, error } = await q;
  if (error) {
    console.error('[plan-comment.GET] error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ comments: data ?? [] });
}
