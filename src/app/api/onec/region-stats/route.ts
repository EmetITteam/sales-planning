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
import { aggregateRegionStats, aggregateClientCategoryStats } from '@/lib/region-stats-aggregate';
import { resolveRegionOverrides } from '@/lib/region-access';
import { isClientReserved } from '@/lib/mityng-types';
import { readActiveRosterByLogins } from '@/lib/client-category-store';

// Vercel: дай функції до 60с — 21 менеджер × 2 виклики 1С (Action 2 + Action 3)
// з timeout 20с кожен. Без цього Vercel killed function на 10с (Hobby default)
// → 500 Internal Server Error без логу. Pro plan дозволяє до 60с.
export const maxDuration = 60;

// Класифікація + агрегація винесена в src/lib/region-stats-aggregate.ts
// (memory: active_vs_inactive_brand_rule.md — категорії по lastPurchaseDate
// бренду, НЕ по 1С-полю clients[].category). Pure-функція тестується unit-тестами.

interface OneCResp<T> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
}

async function callOneC<T>(
  action: string,
  payload: unknown,
  timeoutMs = 25000,
  attempt = 1,
): Promise<T | null> {
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
    if (json.status !== 'success' || !json.data) {
      if (attempt < 2) {
        // Один retry — 1С іноді віддає transient помилки на батчах
        await new Promise(r => setTimeout(r, 500));
        return callOneC<T>(action, payload, timeoutMs, attempt + 1);
      }
      console.warn('[region-stats.callOneC] failed', { action, status: json.status, message: json.message });
      return null;
    }
    return json.data;
  } catch (err) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 500));
      return callOneC<T>(action, payload, timeoutMs, attempt + 1);
    }
    console.warn('[region-stats.callOneC] error', { action, err: err instanceof Error ? err.message : String(err) });
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

  const { period, asOfDate, logins, forecastClientIds, gapNewClientIds, gapActivationClientIds } = body ?? {};
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
  const isMultiRegionRM = !!(await resolveRegionOverrides(sessionLogin));
  if (session.role === 'director' || session.role === 'admin' || isMultiRegionRM) {
    for (const l of logins) allowed.add(String(l).toLowerCase().trim());
  } else {
    for (const l of session.managedUsers ?? []) allowed.add(l.toLowerCase().trim());
  }
  const safeLoginsRaw = (logins as unknown[])
    .map(l => String(l).toLowerCase().trim())
    .filter(l => allowed.has(l));
  // ⚠️ Dedup логінів ПЕРЕД 1С-викликами. ПІДТВЕРДЖЕНО ЕМПІРИЧНО 2026-05-12:
  // Director передавав 21 логін, з них 1 дубль → 1С викликалось двічі для
  // того самого менеджера → buyers дублювались у aggregate ($17,970).
  // Імовірно 1С Action 5 повертає того самого менеджера у двох регіонах
  // (рідкісний edge case, можливо менеджер працює на 2 регіони).
  const safeLoginsSet = new Set(safeLoginsRaw);
  const safeLogins = Array.from(safeLoginsSet);
  const duplicateLoginsInRequest = safeLoginsRaw.length - safeLogins.length;
  // Список саме тих логінів які дублювались — для діагностики
  const duplicatedLoginsList: string[] = [];
  if (duplicateLoginsInRequest > 0) {
    const seen = new Set<string>();
    for (const l of safeLoginsRaw) {
      if (seen.has(l) && !duplicatedLoginsList.includes(l)) duplicatedLoginsList.push(l);
      seen.add(l);
    }
  }
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
      clientName?: string;
      category?: string;
      isReserved?: boolean;
      purchases?: Array<{ segmentCode: string; lastPurchaseDate?: string }>;
    }>;
  };
  type Action3Resp = { segments: Array<{ segmentCode: string; clients: Array<{ clientId: string; factAmountUSD: number | string }> }> };
  // Action 8 (getManagerClients) — єдине джерело прапорця isReserved.
  type Action8Resp = { clients?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

  // Один менеджер = 1 виклик Action 2 + 1 виклик Action 3 (sequential).
  // Раніше всі 21 менеджер летіли в 1С паралельно (42 запити одночасно) — 1С
  // перевантажувався, частина запитів падала з timeout → у відповіді ~30%
  // менеджерів не було, totalFact зменшувався втричі.
  // Тепер обмежуємо concurrency до CONCURRENCY_LIMIT менеджерів за раз.
  const CONCURRENCY_LIMIT = 5;

  // 🚀 Ростер (категорія + резерв) читаємо з НАШОГО зрізу (client_category_history),
  // а не з Action 2 + Action 8 — гарячий шлях падає до 1 виклику 1С/менеджера
  // (тільки факт Action 3). Fallback на live-шлях, поки крон ще не наповнив зріз.
  const dbRoster = await readActiveRosterByLogins(safeLogins).catch(() => [] as Awaited<ReturnType<typeof readActiveRosterByLogins>>);
  const rosterByLogin = new Map<string, Array<{ clientId: string; clientName?: string; category?: string; isReserved?: boolean }>>();
  for (const r of dbRoster) {
    const arr = rosterByLogin.get(r.manager_login) ?? [];
    arr.push({ clientId: r.client_id, clientName: r.client_name ?? undefined, category: r.category, isReserved: r.is_reserved });
    rosterByLogin.set(r.manager_login, arr);
  }
  // DB-шлях ЛИШЕ якщо зріз покриває ВСІХ менеджерів регіону — інакше частина
  // менеджерів дала б порожній ростер → мовчазний недолік Бази/факту. Регіон з
  // не-синканим менеджером (напр. новий, або колл-центр) → повністю live.
  const useDb = dbRoster.length > 0 && safeLogins.every(l => rosterByLogin.has(l));

  const fetchOneManager = async (login: string) => {
    let clientsResp: Action2Resp | null;
    if (useDb) {
      // Ростер із БД — категорія та резерв уже тут. 1С не чіпаємо (окрім факту).
      const dbClients = rosterByLogin.get(login) ?? [];
      clientsResp = { clients: dbClients };
    } else {
      // Live fallback: Action 2 (клієнти) + Action 8 (резерв) паралельно.
      const [c2, mgrResp] = await Promise.all([
        callOneC<Action2Resp>('getClientsForPlanning', { login }),
        callOneC<Action8Resp>('getManagerClients', { login }),
      ]);
      clientsResp = c2;
      if (clientsResp?.clients && mgrResp) {
        const arr = Array.isArray(mgrResp) ? mgrResp : (mgrResp.clients ?? []);
        const reserved = new Set<string>();
        for (const m of arr) {
          const rid = m?.ClientID ?? m?.clientId ?? m?.clientID;
          if (rid != null && isClientReserved(m)) reserved.add(String(rid));
        }
        if (reserved.size > 0) {
          for (const c of clientsResp.clients) if (reserved.has(String(c.clientId))) c.isReserved = true;
        }
      }
    }
    if (!clientsResp || !clientsResp.clients) return { login, clientsResp: null, factResp: null };
    const clientIds = clientsResp.clients.map(c => c.clientId);
    if (clientIds.length === 0) return { login, clientsResp, factResp: null };
    const factPayload: Record<string, unknown> = { login, period, clientIds };
    if (asOfDate) factPayload.asOfDate = asOfDate;
    const fact = await callOneC<Action3Resp>('getSalesFact', factPayload);
    return { login, clientsResp, factResp: fact };
  };

  // Простий semaphore: батчимо safeLogins по CONCURRENCY_LIMIT і ждем кожен батч.
  const results: Array<Awaited<ReturnType<typeof fetchOneManager>>> = [];
  for (let i = 0; i < safeLogins.length; i += CONCURRENCY_LIMIT) {
    const batch = safeLogins.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(batch.map(fetchOneManager));
    results.push(...batchResults);
  }

  // Агрегація винесена в pure-функцію (src/lib/region-stats-aggregate.ts) —
  // тестується unit-тестами без HTTP/моків. Endpoint тільки готує дані.
  // Включаємо менеджера якщо є РОСТЕР (clientsResp) — навіть коли факт (Action 3)
  // впав: База/Заплановано лишаються, купили=0 (краще ніж загубити менеджера).
  const managerInputs = results
    .filter(r => r.clientsResp)
    .map(r => ({
      login: r.login,
      clients: r.clientsResp!.clients ?? [],
      segments: r.factResp?.segments ?? [],
    }));
  // Діагностика резерву: скільки клієнтів позначено isReserved (виключаються
  // з clientCategory). Видно у meta відповіді + у Vercel logs.
  const rosterTotal = managerInputs.reduce((s, m) => s + m.clients.length, 0);
  const reservedExcluded = managerInputs.reduce((s, m) => s + m.clients.filter(c => c.isReserved).length, 0);
  console.log('[region-stats] reserve', { logins: managerInputs.length, rosterTotal, reservedExcluded });
  // Класифікація buyer-ів по плану менеджера: forecast/gapNew/gapActivation/unplanned.
  // Кожен у рівно одному bucket (без дублювання). Σ = totalFact.
  const aggregated = aggregateRegionStats(managerInputs, {
    forecastClientIds: Array.isArray(forecastClientIds) ? forecastClientIds : null,
    gapNewClientIds: Array.isArray(gapNewClientIds) ? gapNewClientIds : null,
    gapActivationClientIds: Array.isArray(gapActivationClientIds) ? gapActivationClientIds : null,
  });

  // Унікальні клієнти з планом (хоча б в одному бренді). Бакети приходять у
  // форматі `${SEGMENT}|${clientId}` → витягуємо clientId і дедуплимо.
  const plannedClientIdSet = new Set<string>();
  for (const arr of [forecastClientIds, gapNewClientIds, gapActivationClientIds]) {
    if (Array.isArray(arr)) {
      for (const key of arr) {
        const cid = String(key).split('|')[1] || '';
        if (cid) plannedClientIdSet.add(cid);
      }
    }
  }
  const clientCategory = aggregateClientCategoryStats(managerInputs, Array.from(plannedClientIdSet));

  const successCount = results.filter(r => r.clientsResp && r.factResp).length;
  if (successCount < safeLogins.length) {
    console.warn('[region-stats] partial data', {
      period,
      requested: safeLogins.length,
      successful: successCount,
      failed: safeLogins.length - successCount,
      failedLogins: results.filter(r => !r.clientsResp || !r.factResp).map(r => r.login),
    });
  }
  // Лог стат dedup щоб видно було у Vercel function logs.
  if (aggregated.dedup.skippedCount > 0) {
    console.warn('[region-stats] dedup', {
      period,
      skippedCount: aggregated.dedup.skippedCount,
      skippedSum: Math.round(aggregated.dedup.skippedSum),
      uniquePairs: aggregated.dedup.uniquePairs,
    });
  }
  return Response.json({
    bySegment: aggregated.bySegment,
    clientCategory,
    meta: {
      period,
      logins: safeLogins.length,
      successful: successCount,
      partial: successCount < safeLogins.length,
      // Діагностика резерву — скільки клієнтів виключено з clientCategory.
      rosterTotal,
      reservedExcluded,
      // Дiагностика dedup — у DevTools Network видно, що саме пропущено.
      dedupSkippedCount: aggregated.dedup.skippedCount,
      dedupSkippedSum: aggregated.dedup.skippedSum,
      uniquePairs: aggregated.dedup.uniquePairs,
      // Топ-30 конкретних дублів для діагностики:
      // [{ segmentCode, clientId, clientName, occurrences: [{login, factAmountUSD}] }]
      duplicates: aggregated.dedup.duplicates.slice(0, 30),
      // 🔍 Діагностика логінів: якщо frontend надіслав дублі логінів —
      // duplicateLoginsInRequest > 0 і це і є джерело pair-дублів.
      loginsRawCount: safeLoginsRaw.length,
      loginsDedupCount: safeLogins.length,
      duplicateLoginsInRequest,
      duplicatedLoginsList, // [] якщо немає; інакше список ПОВТОРЮВАНИХ логінів
    },
  });
}
