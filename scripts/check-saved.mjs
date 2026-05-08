import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const r = await fetch(`${URL}/rest/v1/forecasts?segment_code=eq.ELLANSE&order=created_at.desc&limit=15&select=id,client_name,forecast_amount,segment_code,user_id,period_id,training_id,training_name,stage_done,created_at`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const data = await r.json();
console.log(`Recent ELLANSE forecasts (latest 15):`);
console.log(JSON.stringify(data, null, 2));

const r2 = await fetch(`${URL}/rest/v1/gap_closures?segment_code=eq.ELLANSE&order=created_at.desc&limit=15&select=id,client_name,potential_amount,segment_code,user_id,period_id,stage,stage_done,closure_completed,created_at`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const data2 = await r2.json();
console.log(`\nRecent ELLANSE gap_closures (latest 15):`);
console.log(JSON.stringify(data2, null, 2));
