/**
 * CRON: синхронізація зрізу категорій клієнтів (client_category_history).
 *
 * Погодинно (Vercel cron). Обходить усі регіони/менеджерів через 1С Action 5
 * (getRegionData, director-proxy, includeAll) → per менеджер Action 8
 * (getManagerClients: ClientCategory + isReserved) → будує снапшот → SCD2-синк.
 *
 * Перший прогін = backfill (таблиця порожня → усі як нові, valid_from = 1-ше
 * місяця). Далі — тільки зміни: резерв оновлюється щопрогону, категорія/
 * менеджер/регіон версіонуються при зміні, зниклі клієнти закриваються.
 *
 * Захист: заголовок `Authorization: Bearer ${CRON_SECRET}` (Vercel cron) АБО
 * admin-сесія (ручний запуск/backfill). Без цього — 401.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import { mapClientCategory } from '@/lib/onec-adapters';
import { isClientReserved } from '@/lib/mityng-types';
import { syncClientCategories, type SnapshotRow } from '@/lib/client-category-store';

export const maxDuration = 300; // великий обхід усіх менеджерів компанії

const baseUrl = process.env.ONEC_BASE_URL!;
const oneCHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.ONEC_LOGIN && process.env.ONEC_PASSWORD) {
  oneCHeaders['Authorization'] = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');
}

async function callOneC<T>(
  action: string, payload: Record<string, unknown>, timeoutMs = 30_000, attempt = 0,
): Promise<{ data: T | null; reason?: string }> {
  try {
    const res = await fetch(baseUrl, {
      method: 'POST', headers: oneCHeaders, cache: 'no-store',
      body: JSON.stringify({ action, payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
      return { data: null, reason: `http ${res.status}: ${text.slice(0, 120)}` };
    }
    const json = JSON.parse(text) as { status?: string; data?: T; message?: string };
    if (json.status !== 'success' || !json.data) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
      return { data: null, reason: `status:${json.status} ${(json.message ?? '').slice(0, 120)}` };
    }
    return { data: json.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
    return { data: null, reason: /timeout|abort/i.test(msg) ? `timeout(${timeoutMs}ms)` : msg.slice(0, 120) };
  }
}

type RegionResp = { regions: Array<{ regionCode: string; managers: Array<{ managerLogin: string }> }> };
type Action8Resp = { clients?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

export async function GET(request: NextRequest) {
  // --- auth ---
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const okCron = !!secret && authHeader === `Bearer ${secret}`;
  let okAdmin = false;
  if (!okCron) {
    const session = await getSession();
    okAdmin = session?.role === 'admin';
  }
  if (!okCron && !okAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const period = `${y}-${String(m).padStart(2, '0')}`;
  const monthFirstIso = `${period}-01`;
  const todayIso = now.toISOString().slice(0, 10);

  // Усі регіони/менеджери — через директор-прокси + includeAll.
  const { data: region } = await callOneC<RegionResp>('getRegionData', {
    login: DIRECTOR_PROXY_LOGIN, period, includeAll: true,
  }, 45_000);
  if (!region?.regions) {
    return Response.json({ error: 'getRegionData failed' }, { status: 502 });
  }

  // Унікальні (login → regionCode). Менеджер у 2 регіонах: беремо перший (1С
  // повертає дублі; активна версія все одно одна на клієнта).
  const managerRegion = new Map<string, string>();
  for (const r of region.regions) {
    for (const mgr of r.managers ?? []) {
      const login = (mgr.managerLogin || '').toLowerCase().trim();
      if (login && !managerRegion.has(login)) managerRegion.set(login, r.regionCode);
    }
  }
  const logins = Array.from(managerRegion.keys());

  const fresh: SnapshotRow[] = [];
  const successfulLogins = new Set<string>();
  const addClients = (login: string, arr: Record<string, unknown>[]) => {
    // Порожній АЛЕ успішний респонс → НЕ маркуємо successful, інакше
    // disappeared-close закрив би всіх наявних клієнтів цього менеджера.
    if (arr.length === 0) return;
    successfulLogins.add(login);
    const regionCode = managerRegion.get(login) || '';
    for (const c of arr) {
      const clientId = String(c.ClientID ?? c.clientId ?? c.clientID ?? '').trim();
      if (!clientId) continue;
      fresh.push({
        clientId,
        clientName: (c.ClientName ?? c.clientName) as string | undefined,
        category: mapClientCategory((c.ClientCategory ?? c.category) as string | undefined),
        managerLogin: login,
        regionCode,
        isReserved: isClientReserved(c),
      });
    }
  };
  const unwrap = (d: Action8Resp): Record<string, unknown>[] => Array.isArray(d) ? d : (d.clients ?? []);

  // Action 8 по кожному менеджеру (батчами, concurrency 3, timeout 45с).
  const CONCURRENCY = 3;
  const failed: { login: string; reason: string }[] = [];
  for (let i = 0; i < logins.length; i += CONCURRENCY) {
    const batch = logins.slice(i, i + CONCURRENCY);
    const resps = await Promise.all(batch.map(login =>
      callOneC<Action8Resp>('getManagerClients', { login }, 45_000).then(res => ({ login, res })),
    ));
    for (const { login, res } of resps) {
      if (res.data) addClients(login, unwrap(res.data));
      else failed.push({ login, reason: res.reason ?? 'unknown' });
    }
  }

  // «Неверное имя менеджера» = Action 8 не приймає логін. Але це може бути
  // реальний менеджер (колл-центр лідогенерації) — пробуємо Action 2
  // (getClientsForPlanning), який теж віддає категорію. Решта (продукт/фін
  // без клієнтів) лишиться skip.
  const isNoRoster = (reason: string) => /неверное имя|невірне ім|invalid manager|не найден|not found/i.test(reason);
  const noRoster = failed.filter(f => isNoRoster(f.reason));
  const retryable = failed.filter(f => !isNoRoster(f.reason));

  // Ретрай-прохід для СПРАВЖНІХ падінь Action 8 (таймаут/http) — 60с.
  const stillFailed: { login: string; reason: string }[] = [];
  for (const f of retryable) {
    const res = await callOneC<Action8Resp>('getManagerClients', { login: f.login }, 60_000);
    if (res.data) addClients(f.login, unwrap(res.data));
    else stillFailed.push({ login: f.login, reason: res.reason ?? f.reason });
  }

  // Fallback Action 2 для no-roster логінів (call-center). Action 2 не несе
  // резерву → is_reserved=false (для лідогенерації резерв не застосовується).
  type A2Resp = { clients?: Array<{ clientId?: string; category?: string; clientName?: string }> };
  const skipped: string[] = [];
  for (const f of noRoster) {
    const res = await callOneC<A2Resp>('getClientsForPlanning', { login: f.login }, 45_000);
    const arr = res.data?.clients ?? [];
    if (res.data && arr.length > 0) {
      successfulLogins.add(f.login);
      const regionCode = managerRegion.get(f.login) || '';
      for (const c of arr) {
        const clientId = String(c.clientId ?? '').trim();
        if (!clientId) continue;
        fresh.push({
          clientId, clientName: c.clientName,
          category: mapClientCategory(c.category),
          managerLogin: f.login, regionCode, isReserved: false,
        });
      }
    } else {
      skipped.push(f.login);
    }
  }

  // Закриваємо зниклих ТІЛЬКИ серед успішних менеджерів (упавших/skip не чіпаємо).
  const stats = await syncClientCategories(fresh, monthFirstIso, todayIso, successfulLogins);
  const mgrOk = successfulLogins.size;
  const mgrFail = stillFailed.length;
  const mgrSkipped = skipped.length;
  console.log('[cron/sync-client-categories]', { period, managers: logins.length, mgrOk, mgrSkipped, mgrFail, skippedLogins: skipped, failedLogins: stillFailed, ...stats });

  return Response.json({ ok: true, period, managers: logins.length, mgrOk, mgrSkipped, mgrFail, skippedLogins: skipped, failedLogins: stillFailed, ...stats });
}
