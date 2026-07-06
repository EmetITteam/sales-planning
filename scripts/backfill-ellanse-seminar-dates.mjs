/**
 * Backfill sales.seminar_date / sales.project_date для Ellanse з 1С-вигрузки.
 *
 * Джерело: побудовий звіт «Продажи» з групи 02.ELLANSE (Представництва) з
 * додатковими полями «Документ продажи.Семинар.Дата проведения» та
 * «Документ продажи.Проект.Дата проведения». Файл дає користувач (лежить поза
 * репо, на G:). Скрипт матчить рядки sales по (doc_id + назва семінару/проекту)
 * — це коректний grain, бо один документ може містити РІЗНІ семінари в різних
 * рядках (перевірено: 3 таких документи), тож матч лише по doc_id був би хибним.
 *
 * Оновлює ТІЛЬКИ дві дата-колонки через PATCH by id (згруповано по значенню
 * дати). merge-duplicates upsert НЕ підходить — PostgREST вимагає повний рядок
 * (NOT NULL doc_id). Ідемпотентно: повторний запуск виставляє ті самі дати.
 *
 * Запуск:  node scripts/backfill-ellanse-seminar-dates.mjs [--apply]
 * Без --apply — dry-run (тільки рахує, нічого не пише).
 *
 * Створено 2026-07-06 (ADR-18 / семінари по датах, migration 044).
 */
import fs from 'node:fs';

const FILE = process.env.ELLANSE_FILE
  || 'G:/Мой диск/Аналитика/product-analytics/data/Єллансе.txt';
const APPLY = process.argv.includes('--apply');

// --- env ---
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

// «20.04.2026 00:00:00» → «2026-04-20»
const toISO = s => {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// --- parse file → maps keyed (doc_id||name) ---
let t = fs.readFileSync(FILE, 'utf8');
if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
const lines = t.split(/\r?\n/);
let ds = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].split('\t')[1] === 'Документ продажи') { ds = i + 1; break; }
}
if (ds < 0) throw new Error('Не знайдено рядок-шапку «Документ продажи»');
const docRe = /(ЗИН\d+)/;
// колонки: [1]Документ [10]Семинар [11]Проект [12]Семінар.Дата [13]Проект.Дата
const semMap = new Map(), projMap = new Map();
let semConf = 0, projConf = 0;
for (let i = ds; i < lines.length; i++) {
  const c = lines[i].split('\t');
  if (!c[1]) continue;
  const dm = c[1].match(docRe);
  if (!dm) continue;
  const doc = dm[1];
  const sem = c[10]?.trim(), proj = c[11]?.trim();
  const sd = toISO(c[12]), pd = toISO(c[13]);
  if (sem && sd) { const k = `${doc}||${sem}`; if (semMap.has(k) && semMap.get(k) !== sd) semConf++; else semMap.set(k, sd); }
  if (proj && pd) { const k = `${doc}||${proj}`; if (projMap.has(k) && projMap.get(k) !== pd) projConf++; else projMap.set(k, pd); }
}
console.log(`Файл: seminar-пар=${semMap.size} (конфл ${semConf}), project-пар=${projMap.size} (конфл ${projConf})`);

// --- fetch all Ellanse sales ---
const sales = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${U}/rest/v1/sales?brand=eq.Ellanse&select=id,doc_id,seminar,project&order=id&limit=1000&offset=${from}`, { headers: H });
  const d = await r.json();
  sales.push(...d);
  if (d.length < 1000) break;
}
console.log('Ellanse sales рядків:', sales.length);

// --- групуємо оновлення по значенню дати ---
const semGroups = new Map(), projGroups = new Map();  // date → id[]
let setSem = 0, setProj = 0, noMatch = 0;
for (const s of sales) {
  if (s.seminar) {
    const v = semMap.get(`${s.doc_id}||${s.seminar.trim()}`);
    if (v) { (semGroups.get(v) ?? semGroups.set(v, []).get(v)).push(s.id); setSem++; }
    else noMatch++;
  }
  if (s.project) {
    const v = projMap.get(`${s.doc_id}||${s.project.trim()}`);
    if (v) { (projGroups.get(v) ?? projGroups.set(v, []).get(v)).push(s.id); setProj++; }
  }
}
console.log(`До оновлення: seminar_date=${setSem} (${semGroups.size} дат), project_date=${setProj} (${projGroups.size} дат), семінар-без-дати=${noMatch}`);

if (!APPLY) { console.log('DRY-RUN (додай --apply щоб записати).'); process.exit(0); }

// --- apply: PATCH id=in.(...) по датах, чанками ---
async function patchGroups(groups, col) {
  let done = 0;
  for (const [date, ids] of groups) {
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const r = await fetch(`${U}/rest/v1/sales?id=in.(${chunk.join(',')})`, {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ [col]: date }),
      });
      if (!r.ok) { console.error('PATCH FAIL', col, r.status, await r.text()); process.exit(1); }
      done += chunk.length;
    }
  }
  console.log(`  ${col}: оновлено ${done} рядків`);
}
await patchGroups(semGroups, 'seminar_date');
await patchGroups(projGroups, 'project_date');
console.log('Готово.');
