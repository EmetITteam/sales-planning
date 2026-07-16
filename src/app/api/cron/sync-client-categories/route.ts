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

async function callOneC<T>(action: string, payload: Record<string, unknown>, attempt = 0): Promise<T | null> {
  try {
    const res = await fetch(baseUrl, {
      method: 'POST', headers: oneCHeaders, cache: 'no-store',
      body: JSON.stringify({ action, payload }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const json = JSON.parse(text) as { status?: string; data?: T };
    if (json.status !== 'success' || !json.data) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 600)); return callOneC<T>(action, payload, attempt + 1); }
      return null;
    }
    return json.data;
  } catch {
    if (attempt < 2) { await new Promise(r => setTimeout(r, 600)); return callOneC<T>(action, payload, attempt + 1); }
    return null;
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
  const region = await callOneC<RegionResp>('getRegionData', {
    login: DIRECTOR_PROXY_LOGIN, period, includeAll: true,
  });
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

  // Action 8 по кожному менеджеру (батчами) → снапшот.
  const CONCURRENCY = 5;
  const fresh: SnapshotRow[] = [];
  let mgrOk = 0, mgrFail = 0;
  for (let i = 0; i < logins.length; i += CONCURRENCY) {
    const batch = logins.slice(i, i + CONCURRENCY);
    const resps = await Promise.all(batch.map(login =>
      callOneC<Action8Resp>('getManagerClients', { login }).then(d => ({ login, d })),
    ));
    for (const { login, d } of resps) {
      if (!d) { mgrFail++; continue; }
      mgrOk++;
      const arr = Array.isArray(d) ? d : (d.clients ?? []);
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
    }
  }

  const stats = await syncClientCategories(fresh, monthFirstIso, todayIso);
  console.log('[cron/sync-client-categories]', { period, managers: logins.length, mgrOk, mgrFail, ...stats });

  return Response.json({ ok: true, period, managers: logins.length, mgrOk, mgrFail, ...stats });
}
