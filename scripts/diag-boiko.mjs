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

const login = encodeURIComponent('sm.kiev4@emet.in.ua');
const segment = 'PETARAN';

// forecasts
const fRes = await fetch(`${SBURL}/rest/v1/forecasts?select=client_name,forecast_amount,period_id,updated_at,manually_added,completed,stage&user_id=eq.${login}&segment_code=eq.${segment}&order=updated_at.desc`, { headers: H });
const f = await fRes.json();
console.log(`forecasts: ${f.length} rows, Σ=$${f.reduce((s, r) => s + Number(r.forecast_amount || 0), 0).toFixed(2)}`);
console.log('by period_id:');
const byPid = {};
for (const r of f) byPid[r.period_id] = (byPid[r.period_id] || 0) + 1;
console.log(' ', byPid);
console.log('\nbyDate (updated_at, top 50):');
const byDate = {};
for (const r of f.slice(0, 50)) {
  const d = r.updated_at?.slice(0, 16) || 'null';
  byDate[d] = (byDate[d] || 0) + 1;
}
for (const [d, c] of Object.entries(byDate).sort()) console.log(` ${d}: ${c}`);

// gap_closures
const gRes = await fetch(`${SBURL}/rest/v1/gap_closures?select=client_name,potential_amount,category,period_id,updated_at,manually_added,closure_completed&user_id=eq.${login}&segment_code=eq.${segment}&order=updated_at.desc`, { headers: H });
const g = await gRes.json();
console.log(`\ngap_closures: ${g.length} rows, Σ=$${g.reduce((s, r) => s + Number(r.potential_amount || 0), 0).toFixed(2)}`);
const byPidG = {};
for (const r of g) byPidG[r.period_id] = (byPidG[r.period_id] || 0) + 1;
console.log('by period_id:', byPidG);
console.log('\ngap byDate (top 50):');
const byDateG = {};
for (const r of g.slice(0, 50)) {
  const d = r.updated_at?.slice(0, 16) || 'null';
  byDateG[d] = (byDateG[d] || 0) + 1;
}
for (const [d, c] of Object.entries(byDateG).sort()) console.log(` ${d}: ${c}`);

// snapshots — первинний список
const sRes = await fetch(`${SBURL}/rest/v1/planning_snapshots?select=client_name,block_type,period_id,captured_at,source&user_id=eq.${login}&segment_code=eq.${segment}&order=captured_at.asc`, { headers: H });
const s = await sRes.json();
console.log(`\nsnapshots: ${s.length} rows`);
const byBlock = {};
const bySource = {};
for (const r of s) {
  byBlock[r.block_type] = (byBlock[r.block_type] || 0) + 1;
  bySource[r.source] = (bySource[r.source] || 0) + 1;
}
console.log('by block_type:', byBlock);
console.log('by source:', bySource);
console.log('First 3 snapshot timestamps:', s.slice(0, 3).map(x => x.captured_at));

// Show first 3 distinct client names in forecasts
console.log('\nForecast clients (first 25 sorted by name):');
const uniqClients = [...new Set(f.map(r => r.client_name))].sort();
console.log(uniqClients.slice(0, 25).join('\n  ').replace(/^/, '  '));
console.log(`  ...total unique: ${uniqClients.length}`);
