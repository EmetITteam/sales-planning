/**
 * CRON: снапшот учасників фокусу (focus_participants) з 1С.
 *
 * Пару разів на день (Vercel cron). Обхід менеджерів: Action 5 (getRegionData,
 * director-proxy, includeAll) → per менеджер Action 8 (getManagerClients: список
 * клієнтів) → getClientFocus (focusName по клієнтах, чанки 200). focusName →
 * бренд-сегмент (detectBrand → brandToSegment). Замінює зріз успішних менеджерів.
 *
 * Тижневий звіт читає focus_participants (не дьоргає 1С наживо).
 *
 * Захист: `Authorization: Bearer ${CRON_SECRET}` АБО admin-сесія.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import { detectBrand } from '@/lib/strategic-kpi/sales-classifier';
import { brandToSegment } from '@/lib/weekly-brand-insights';
import { replaceFocusParticipants, type FocusRow } from '@/lib/focus-participants-store';

export const maxDuration = 300;

const baseUrl = process.env.ONEC_BASE_URL!;
const oneCHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.ONEC_LOGIN && process.env.ONEC_PASSWORD) {
  oneCHeaders['Authorization'] = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');
}

async function callOneC<T>(action: string, payload: Record<string, unknown>, timeoutMs = 30_000, attempt = 0): Promise<{ data: T | null; reason?: string }> {
  try {
    const res = await fetch(baseUrl, { method: 'POST', headers: oneCHeaders, cache: 'no-store', body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
      return { data: null, reason: `http ${res.status}` };
    }
    const json = JSON.parse(text) as { status?: string; data?: T; message?: string };
    if (json.status !== 'success' || !json.data) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
      return { data: null, reason: `status:${json.status}` };
    }
    return { data: json.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt < 2) { await new Promise(r => setTimeout(r, 700)); return callOneC<T>(action, payload, timeoutMs, attempt + 1); }
    return { data: null, reason: /timeout|abort/i.test(msg) ? `timeout` : msg.slice(0, 80) };
  }
}

type RegionResp = { regions: Array<{ regionCode: string; managers: Array<{ managerLogin: string }> }> };
type Action8Resp = { clients?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
type FocusResp = { focuses?: Array<{ clientId?: string; items?: Array<{ focusName?: string }> }> };

const clientIdOf = (c: Record<string, unknown>) => String(c.ClientID ?? c.clientId ?? c.clientID ?? '').trim();

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const okCron = !!secret && (request.headers.get('authorization') || '') === `Bearer ${secret}`;
  if (!okCron) {
    const session = await getSession();
    if (session?.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const { data: region } = await callOneC<RegionResp>('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period, includeAll: true }, 45_000);
  if (!region?.regions) return Response.json({ error: 'getRegionData failed' }, { status: 502 });

  const managerRegion = new Map<string, string>();
  for (const r of region.regions) {
    for (const mgr of r.managers ?? []) {
      const login = (mgr.managerLogin || '').toLowerCase().trim();
      if (login && !managerRegion.has(login)) managerRegion.set(login, r.regionCode);
    }
  }
  const logins = Array.from(managerRegion.keys());

  const rows: FocusRow[] = [];
  const successfulLogins: string[] = [];
  let focusItems = 0, unmapped = 0;
  const failed: string[] = [];

  // Per менеджер: Action 8 (клієнти) → getClientFocus чанками по 200.
  const CONCURRENCY = 3;
  for (let i = 0; i < logins.length; i += CONCURRENCY) {
    const batch = logins.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async login => {
      const c8 = await callOneC<Action8Resp>('getManagerClients', { login }, 45_000);
      if (!c8.data) { failed.push(login); return; }
      const arr = Array.isArray(c8.data) ? c8.data : (c8.data.clients ?? []);
      const clientIds = arr.map(clientIdOf).filter(Boolean);
      const regionCode = managerRegion.get(login) || '';

      // getClientFocus чанками по 200.
      let okAny = clientIds.length === 0; // нема клієнтів = успіх (0 учасників)
      const seen = new Set<string>(); // dedupe (client|segment)
      for (let k = 0; k < clientIds.length; k += 200) {
        const chunk = clientIds.slice(k, k + 200);
        const fr = await callOneC<FocusResp>('getClientFocus', { login, clientIds: chunk }, 45_000);
        if (!fr.data) continue;
        okAny = true;
        for (const f of fr.data.focuses ?? []) {
          const clientId = String(f.clientId ?? '').trim();
          if (!clientId) continue;
          for (const it of f.items ?? []) {
            const name = (it.focusName || '').trim();
            if (!name) continue;
            focusItems++;
            const brand = detectBrand(name);
            if (!brand) { unmapped++; continue; }
            const segment = brandToSegment(brand);
            const key = `${clientId}|${segment}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({ period, client_id: clientId, segment_code: segment, focus_name: name, manager_login: login, region_code: regionCode });
          }
        }
      }
      if (okAny) successfulLogins.push(login);
      else failed.push(login);
    }));
  }

  const res = await replaceFocusParticipants(period, successfulLogins, rows);
  return Response.json({
    ok: true, period,
    managers: logins.length, mgrOk: successfulLogins.length, mgrFail: failed.length,
    focusItems, unmapped, participants: rows.length, inserted: res.inserted,
    failedLogins: failed.slice(0, 20),
  });
}
