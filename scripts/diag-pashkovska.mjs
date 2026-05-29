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

const PID = 20260501;

// 1. Скільки взагалі рядків у forecasts/gaps з цим період_id?
async function countAll(table) {
  const r = await fetch(`${SBURL}/rest/v1/${table}?select=user_id&period_id=eq.${PID}`, { headers: { ...H, Range: '0-9999', Prefer: 'count=exact' } });
  const data = await r.json();
  const byLogin = {};
  for (const row of data) byLogin[row.user_id] = (byLogin[row.user_id] || 0) + 1;
  console.log(`\n${table}: ${data.length} rows у періоді ${PID}`);
  console.log('Per user_id (топ-15):');
  for (const [u, c] of Object.entries(byLogin).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${u.padEnd(35)} ${c}`);
  }
}

await countAll('forecasts');
await countAll('gap_closures');

// 2. Конкретно щось є під rm.odessa?
const fres = await fetch(`${SBURL}/rest/v1/forecasts?select=segment_code,stage,forecast_amount,client_name&user_id=eq.rm.odessa%40emet.in.ua&period_id=eq.${PID}`, { headers: { ...H, Range: '0-9999' } });
const fdata = await fres.json();
console.log(`\nforecasts для rm.odessa: ${fdata.length}`);
if (fdata.length > 0) {
  const stages = {};
  for (const r of fdata) stages[r.stage || '(null)'] = (stages[r.stage || '(null)'] || 0) + 1;
  console.log('Stages distribution:', stages);
  console.log('Sample 5:', fdata.slice(0, 5).map(r => `${r.client_name} | ${r.segment_code} | stage=${JSON.stringify(r.stage)} | $${r.forecast_amount}`));
}
