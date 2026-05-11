/**
 * Регіональний агрегат фактичних продажів по категоріях клієнтів.
 *
 * Сервер-сторонній proxy: викликає Action 2 + Action 3 для кожного login регіону
 * паралельно, групує клієнтів за категорією (з Action 2), сумує fact (з Action 3).
 *
 * Один HTTP запит з фронтенду замість N×2 на регіон.
 *
 * Запит:
 *   POST /api/onec/region-stats
 *   { period: "YYYY-MM", asOfDate?: "YYYY-MM-DD", logins: string[] }
 *
 * Відповідь:
 *   { bySegment: { [segCode]: { byCategory: { active|sleeping|lost|new|none: { factCount, factSum } } } } }
 *
 * Категорія береться з Action 2 (1С) — `категория` поле клієнта.
 * Fact-сума — з Action 3 (1С) — `clients[].amount` per (segment, client).
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

// Vercel: дай функції до 60с — 21 менеджер × 2 виклики 1С (Action 2 + Action 3)
// з timeout 20с кожен. Без цього Vercel killed function на 10с (Hobby default)
// → 500 Internal Server Error без логу. Pro plan дозволяє до 60с.
export const maxDuration = 60;

const ALLOWED_CATS = new Set(['active', 'sleeping', 'lost', 'new', 'none']);
type CatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

const mapCategory = (raw: string | null | undefined): CatKey => {
  const c = (raw || '').toLowerCase().trim();
  if (c === 'активный' || c === 'активний') return 'active';
  if (c === 'спящий' || c === 'сплячий') return 'sleeping';
  if (c === 'потерянный' || c === 'втрачений') return 'lost';
  if (c === 'новый' || c === 'новий') return 'new';
  return 'none';
};

const mapSegmentCode = (code: string): string => {
  if (code === 'ДРУГИЕТМ') return 'OTHER';
  return code;
};

interface OneCResp<T> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
}

async function callOneC<T>(action: string, payload: unknown, timeoutMs = 20000): Promise<T | null> {
  const baseUrl = process.env.ONEC_BASE_URL;
  if (!baseUrl) return null;
  const oneClogin = process.env.ONEC_LOGIN;
  const onecPass = process.env.ONEC_PASSWORD;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (oneClogin && onecPass) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${oneClogin}:${onecPass}`).toString('base64');
  }
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, payload }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const json = JSON.parse(text) as OneCResp<T>;
    if (json.status !== 'success' || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err) {
    console.error('[region-stats] unhandled', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg, bySegment: {} }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { period, asOfDate, logins } = body ?? {};
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'period must be YYYY-MM' }, { status: 400 });
  }
  if (!Array.isArray(logins) || logins.length === 0) {
    return Response.json({ error: 'logins required' }, { status: 400 });
  }
  if (logins.length > 50) {
    return Response.json({ error: 'too many logins (max 50)' }, { status: 400 });
  }

  // Security: scope-перевірка як у /api/onec
  const sessionLogin = session.login.toLowerCase().trim();
  const allowed = new Set<string>([sessionLogin]);
  if (session.role === 'director') {
    for (const l of logins) allowed.add(String(l).toLowerCase().trim());
  } else {
    for (const l of session.managedUsers ?? []) allowed.add(l.toLowerCase().trim());
  }
  const safeLogins = (logins as unknown[])
    .map(l => String(l).toLowerCase().trim())
    .filter(l => allowed.has(l));
  if (safeLogins.length === 0) {
    return Response.json({ error: 'No allowed logins in scope' }, { status: 403 });
  }

  // Паралельно: для кожного login → Action 2 (clients with category) + Action 3 (sales fact)
  // ⚠️ Action 3 формат: { segments: [{ segmentCode, clients: [{ clientId, factAmountUSD }] }] }
  // (НЕ {facts: [...]} і НЕ {amount}). Див. src/lib/onec-types.ts.
  type Action2Resp = { clients: Array<{ clientId: string; category?: string }> };
  type Action3Resp = { segments: Array<{ segmentCode: string; clients: Array<{ clientId: string; factAmountUSD: number | string }> }> };

  const tasks = safeLogins.map(async (login) => {
    const [clientsResp, factResp] = await Promise.all([
      callOneC<Action2Resp>('getClientsForPlanning', { login }),
      // Action 3 потребує clientIds. Зробимо у 2 кроки: спочатку clients, потім fact з тими ID.
      Promise.resolve(null as Action3Resp | null), // placeholder — заповнимо нижче
    ]);
    if (!clientsResp || !clientsResp.clients) return { login, clientsResp: null, factResp: null };
    const clientIds = clientsResp.clients.map(c => c.clientId);
    if (clientIds.length === 0) return { login, clientsResp, factResp: null };
    const factPayload: Record<string, unknown> = { login, period, clientIds };
    if (asOfDate) factPayload.asOfDate = asOfDate;
    const fact = await callOneC<Action3Resp>('getSalesFact', factPayload);
    return { login, clientsResp, factResp: fact };
  });

  const results = await Promise.all(tasks);

  // Агрегація: per segment per category — sum amount + distinct buyer count
  const bySegment: Record<string, {
    byCategory: Record<CatKey, { factCount: number; factSum: number }>;
  }> = {};
  const ensureSeg = (seg: string) => {
    if (!bySegment[seg]) {
      bySegment[seg] = {
        byCategory: {
          active: { factCount: 0, factSum: 0 },
          sleeping: { factCount: 0, factSum: 0 },
          lost: { factCount: 0, factSum: 0 },
          new: { factCount: 0, factSum: 0 },
          none: { factCount: 0, factSum: 0 },
        },
      };
    }
    return bySegment[seg];
  };

  for (const r of results) {
    if (!r.clientsResp || !r.factResp) continue;
    // Захист: 1С іноді повертає payload без clients/segments (порожній менеджер)
    const clients = Array.isArray(r.clientsResp.clients) ? r.clientsResp.clients : [];
    const segments = Array.isArray(r.factResp.segments) ? r.factResp.segments : [];
    if (clients.length === 0 || segments.length === 0) continue;
    // Map clientId → category для цього менеджера
    const catBy = new Map<string, CatKey>();
    for (const c of clients) {
      if (c && c.clientId) catBy.set(c.clientId, mapCategory(c.category));
    }
    // Кожен segment: { segmentCode, clients: [{clientId, factAmountUSD}] }
    for (const seg of segments) {
      if (!seg || !seg.segmentCode) continue;
      const segCode = mapSegmentCode(seg.segmentCode);
      const sBlock = ensureSeg(segCode);
      const buyers = Array.isArray(seg.clients) ? seg.clients : [];
      for (const buyer of buyers) {
        if (!buyer || !buyer.clientId) continue;
        const amt = typeof buyer.factAmountUSD === 'number'
          ? buyer.factAmountUSD
          : parseFloat(String(buyer.factAmountUSD));
        if (!Number.isFinite(amt) || amt === 0) continue;
        const cat = catBy.get(buyer.clientId) ?? 'none';
        if (!ALLOWED_CATS.has(cat)) continue;
        sBlock.byCategory[cat].factSum += amt;
        sBlock.byCategory[cat].factCount += 1;
      }
    }
  }

  return Response.json({
    bySegment,
    meta: {
      period,
      logins: safeLogins.length,
      successful: results.filter(r => r.clientsResp && r.factResp).length,
    },
  });
}
