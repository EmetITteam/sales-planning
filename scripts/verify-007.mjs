import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const SBURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const r1 = await fetch(`${SBURL}/rest/v1/periods?select=*&order=id`, { headers: H });
console.log('periods after migration:');
console.log(JSON.stringify(await r1.json(), null, 2));

// Андрющенко Petaran трав 2026
const login = encodeURIComponent('rm.zp@emet.in.ua');
const r2 = await fetch(`${SBURL}/rest/v1/forecasts?select=client_name,forecast_amount,period_id&user_id=eq.${login}&segment_code=eq.PETARAN`, { headers: H });
const fc = await r2.json();
console.log(`\nАндрющенко Petaran forecasts: ${fc.length} rows`);
const fSum = fc.reduce((s, r) => s + (Number(r.forecast_amount) || 0), 0);
console.log(`Σ forecast_amount = ${fSum.toFixed(2)}`);
const byPid = {};
for (const r of fc) byPid[r.period_id] = (byPid[r.period_id] || 0) + 1;
console.log('by period_id:', byPid);

const r3 = await fetch(`${SBURL}/rest/v1/gap_closures?select=client_name,potential_amount,period_id&user_id=eq.${login}&segment_code=eq.PETARAN`, { headers: H });
const gc = await r3.json();
console.log(`\nАндрющенко Petaran gap_closures: ${gc.length} rows`);
const gSum = gc.reduce((s, r) => s + (Number(r.potential_amount) || 0), 0);
console.log(`Σ potential_amount = ${gSum.toFixed(2)}`);
const byPidG = {};
for (const r of gc) byPidG[r.period_id] = (byPidG[r.period_id] || 0) + 1;
console.log('by period_id:', byPidG);

console.log(`\nTotal Андрющенко Petaran travень: ${(fSum + gSum).toFixed(2)}`);
