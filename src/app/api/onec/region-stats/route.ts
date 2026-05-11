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

type CatKey = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

// ⚠️ КАТЕГОРІЇ НЕ ПО 1С-полю `category`!
// Узгоджено з директором продажу (memory: active_vs_inactive_brand_rule.md):
//   'active'  = клієнт купував ЦЕЙ БРЕНД за останні 3 місяці (по lastPurchaseDate
//               сегмента з Action 2 purchases[])
//   'sleeping/lost/none' = купував цей бренд раніше 3 міс — frontend колапсує
//               у одну «Активізація». Тут різниці нема, кладемо все в 'sleeping'.
//   'new'    = 1С-категорія `Новый` ВЦІЛОМУ (тобто клієнт вперше з'являється у
//               системі) — це справді 1С-маркер, а не наша 3-місячна логіка.
//
// Раніше тут була `mapCategory` що читала 1С-поле `category` — дивні цифри
// бо «активний» у 1С означає «купував взагалі», а не «купував саме Vitaran».
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

const isRecentBrandPurchase = (dateStr: string | null | undefined, cutoffMs: number): boolean => {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d).getTime() >= cutoffMs;
};

const isNewClient1C = (raw: string | null | undefined): boolean => {
  const c = (raw || '').toLowerCase().trim();
  return c === 'новый' || c === 'новий';
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

  const { period, asOfDate, logins, plannedClientIds } = body ?? {};
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'period must be YYYY-MM' }, { status: 400 });
  }
  if (!Array.isArray(logins) || logins.length === 0) {
    return Response.json({ error: 'logins required' }, { status: 400 });
  }
  if (logins.length > 50) {
    return Response.json({ error: 'too many logins (max 50)' }, { status: 400 });
  }
  // plannedClientIds (опційний) — Set ID-ів клієнтів які реально у плані
  // менеджерів. Якщо передано — рахуємо «Незапланованих» (купили, але не
  // у плані). Якщо не передано — Незаплановані = 0 (не можемо порахувати).
  const plannedSet = new Set<string>(
    Array.isArray(plannedClientIds)
      ? plannedClientIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : []
  );

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

  // Паралельно: для кожного login → Action 2 (clients with purchases) + Action 3 (sales fact)
  // ⚠️ Action 3 формат: { segments: [{ segmentCode, clients: [{ clientId, factAmountUSD }] }] }
  // (НЕ {facts: [...]} і НЕ {amount}). Див. src/lib/onec-types.ts.
  // Action 2 повертає purchases[] per segment з lastPurchaseDate — потрібно
  // для нашої 3-місячної класифікації по бренду.
  type Action2Resp = {
    clients: Array<{
      clientId: string;
      category?: string;
      purchases?: Array<{ segmentCode: string; lastPurchaseDate?: string }>;
    }>;
  };
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
  // Плюс top-level `unplanned` — buyers ID яких НЕ у plannedSet.
  const bySegment: Record<string, {
    byCategory: Record<CatKey, { factCount: number; factSum: number }>;
    unplanned: { factCount: number; factSum: number };
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
        unplanned: { factCount: 0, factSum: 0 },
      };
    }
    return bySegment[seg];
  };

  // Cutoff для 3-місячного правила. Раз обчислюємо, потім перевіряємо для
  // кожного buyer per segment.
  const cutoffMs = Date.now() - THREE_MONTHS_MS;
  const havePlanInfo = plannedSet.size > 0;

  for (const r of results) {
    if (!r.clientsResp || !r.factResp) continue;
    // Захист: 1С іноді повертає payload без clients/segments (порожній менеджер)
    const clients = Array.isArray(r.clientsResp.clients) ? r.clientsResp.clients : [];
    const segments = Array.isArray(r.factResp.segments) ? r.factResp.segments : [];
    if (clients.length === 0 || segments.length === 0) continue;

    // Map (clientId, segmentCode) → lastPurchaseDate цього бренду — для
    // нашого 3-місячного правила «активний по бренду».
    // І окремо Set "новий клієнт у 1С" — для bucket-у `new`.
    const lastPurchaseBy = new Map<string, string>();
    const newClientSet = new Set<string>();
    for (const c of clients) {
      if (!c || !c.clientId) continue;
      if (isNewClient1C(c.category)) newClientSet.add(c.clientId);
      const purchases = Array.isArray(c.purchases) ? c.purchases : [];
      for (const p of purchases) {
        if (!p || !p.segmentCode || !p.lastPurchaseDate) continue;
        const segCode = mapSegmentCode(p.segmentCode);
        lastPurchaseBy.set(`${c.clientId}|${segCode}`, p.lastPurchaseDate);
      }
    }

    // Кожен segment: { segmentCode, clients: [{clientId, factAmountUSD}] }
    // ⚠️ Логіка категоризації (узгоджена з директором продажу):
    //   - 'new'      = клієнт з 1С-категорією 'Новий' (це справжній 1С-маркер)
    //   - 'active'   = купував ЦЕЙ бренд за останні 3 міс (lastPurchaseDate ≥ today-90д)
    //   - 'sleeping' = купував цей бренд раніше 3 міс (frontend колапсує
    //                  sleeping+lost+none у 'Активізація')
    //   - 'unplanned' = ОКРЕМИЙ ЗРІЗ. Buyer що НЕ у plannedSet. Може
    //                  пересікатися з усіма попередніми (це підмножина).
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

        // Класифікуємо за нашим бізнес-правилом, не за 1С-полем
        let cat: CatKey;
        if (newClientSet.has(buyer.clientId)) {
          cat = 'new';
        } else {
          const lpd = lastPurchaseBy.get(`${buyer.clientId}|${segCode}`);
          cat = isRecentBrandPurchase(lpd, cutoffMs) ? 'active' : 'sleeping';
        }

        // 1) Завжди — у відповідну категорію
        sBlock.byCategory[cat].factSum += amt;
        sBlock.byCategory[cat].factCount += 1;

        // 2) Якщо плановий список переданий і buyer НЕ у ньому — додаємо у
        //    unplanned (підмножина, не виключення).
        if (havePlanInfo && !plannedSet.has(buyer.clientId)) {
          sBlock.unplanned.factSum += amt;
          sBlock.unplanned.factCount += 1;
        }
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
