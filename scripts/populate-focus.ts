/**
 * Разове наповнення focus_participants (те саме, що робить крон sync-focus).
 * Використовує СПРАВЖНІ detectBrand/brandToSegment (tsx імпортує TS напряму).
 *
 * Запуск: npx tsx scripts/populate-focus.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectBrand } from '../src/lib/strategic-kpi/sales-classifier';
import { brandToSegment } from '../src/lib/weekly-brand-insights';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const l of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SH = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const B = process.env.ONEC_BASE_URL!;
const OH: Record<string, string> = { 'Content-Type': 'application/json' };
if (process.env.ONEC_LOGIN && process.env.ONEC_PASSWORD) OH.Authorization = 'Basic ' + Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD}`).toString('base64');
const PROXY = process.env.DIRECTOR_PROXY_LOGIN || 'sdu@emet.in.ua';

async function onec<T>(action: string, payload: Record<string, unknown>, ms = 45000): Promise<T | null> {
  try {
    const r = await fetch(B, { method: 'POST', headers: OH, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = JSON.parse(await r.text()) as { status?: string; data?: T };
    return j.status === 'success' ? (j.data ?? null) : null;
  } catch { return null; }
}

interface FocusRow { period: string; client_id: string; segment_code: string; focus_name: string; manager_login: string; region_code: string }

async function main() {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  console.log('period', period);

  const reg = await onec<{ regions: Array<{ regionCode: string; managers: Array<{ managerLogin: string }> }> }>('getRegionData', { login: PROXY, period, includeAll: true });
  if (!reg?.regions) { console.error('getRegionData failed'); process.exit(1); }
  const managerRegion = new Map<string, string>();
  for (const r of reg.regions) for (const m of r.managers ?? []) {
    const login = (m.managerLogin || '').toLowerCase().trim();
    if (login && !managerRegion.has(login)) managerRegion.set(login, r.regionCode);
  }
  const logins = [...managerRegion.keys()];
  console.log('менеджерів:', logins.length);

  const rows: FocusRow[] = [];
  const successful: string[] = [];
  let items = 0, unmapped = 0;
  const unmappedNames = new Set<string>();

  const CONC = 3;
  for (let i = 0; i < logins.length; i += CONC) {
    await Promise.all(logins.slice(i, i + CONC).map(async login => {
      const c8 = await onec<{ clients?: Record<string, unknown>[] } | Record<string, unknown>[]>('getManagerClients', { login });
      if (!c8) return;
      const arr = Array.isArray(c8) ? c8 : (c8.clients ?? []);
      const ids = arr.map(c => String((c as Record<string, unknown>).ClientID ?? (c as Record<string, unknown>).clientId ?? '').trim()).filter(Boolean);
      const regionCode = managerRegion.get(login) || '';
      let okAny = ids.length === 0;
      const seen = new Set<string>();
      for (let k = 0; k < ids.length; k += 200) {
        const chunk = ids.slice(k, k + 200);
        const fr = await onec<{ focuses?: Array<{ clientId?: string; items?: Array<{ focusName?: string }> }> }>('getClientFocus', { login, clientIds: chunk });
        if (!fr) continue;
        okAny = true;
        for (const f of fr.focuses ?? []) {
          const clientId = String(f.clientId ?? '').trim();
          if (!clientId) continue;
          for (const it of f.items ?? []) {
            const name = (it.focusName || '').trim();
            if (!name) continue;
            items++;
            const brand = detectBrand(name);
            if (!brand) { unmapped++; unmappedNames.add(name); continue; }
            const segment = brandToSegment(brand);
            const key = `${clientId}|${segment}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({ period, client_id: clientId, segment_code: segment, focus_name: name, manager_login: login, region_code: regionCode });
          }
        }
      }
      if (okAny) successful.push(login);
      process.stdout.write('.');
    }));
  }
  console.log(`\nуспішних менеджерів: ${successful.length}, focus-items: ${items}, unmapped: ${unmapped}, рядків: ${rows.length}`);

  // delete current-period rows for successful managers, then insert.
  for (let i = 0; i < successful.length; i += 50) {
    const batch = successful.slice(i, i + 50).map(l => `"${l}"`).join(',');
    await fetch(`${U}/rest/v1/focus_participants?period=eq.${period}&manager_login=in.(${encodeURIComponent(batch)})`, { method: 'DELETE', headers: { ...SH, Prefer: 'return=minimal' } });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${U}/rest/v1/focus_participants`, { method: 'POST', headers: { ...SH, Prefer: 'return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!r.ok) console.error('insert err', r.status, (await r.text()).slice(0, 200));
  }

  // summary
  const bySeg: Record<string, Set<string>> = {}, byReg: Record<string, number> = {};
  for (const r of rows) { (bySeg[r.segment_code] ??= new Set()).add(r.client_id); byReg[r.region_code] = (byReg[r.region_code] || 0) + 1; }
  console.log('\nучасники по сегментах (унік. клієнтів):');
  for (const [s, set] of Object.entries(bySeg).sort((a, b) => b[1].size - a[1].size)) console.log(`  ${s.padEnd(10)} ${set.size}`);
  console.log('по регіонах:', JSON.stringify(byReg));
  if (unmappedNames.size) console.log('\nUNMAPPED focusName (перші 15):', [...unmappedNames].slice(0, 15));
}
main().catch(e => { console.error(e); process.exit(1); });
