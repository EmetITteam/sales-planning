#!/usr/bin/env node
// ============================================================================
// Backfill sales з TSV-вигрузки 1С у Supabase таблицю `sales`.
//
// Джерело: G:\Мой диск\Аналитика\product-analytics\data\Фул База 2022.txt
// Ціль:    Supabase таблиця `sales` (схема — migration 027)
//
// Логіка:
//   1. Читаємо TSV потоково (readline на 94 MB файл щоб не з'їсти всю память)
//   2. Кожен рядок парсимо через ті ж правила що analytics-june-final.py
//      (11 брендів, IGNORE list, EXCLUDE list, gift-detection)
//   3. Батчами по 1000 upsert у Supabase через REST API
//      (unique (doc_id, doc_line) — гарантує no dupes при повторному запуску)
//   4. Записуємо у sales_import_batches: скільки прийнято/skip/gift/ignored
//
// Запуск:
//   node scripts/analytics-sales-backfill.mjs [--source PATH] [--batch-id ID]
//   node scripts/analytics-sales-backfill.mjs --dry-run   # не пише у БД, лише парсить
//
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (беремо з .env)
// ============================================================================

import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// ============================================================================
// ENV load (проста версія без dotenv)
// ============================================================================
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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

// ============================================================================
// CLI args
// ============================================================================
const args = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      argMap.set(key, next);
      i++;
    } else {
      argMap.set(key, true);
    }
  }
}

const SOURCE = argMap.get('source') || 'G:\\Мой диск\\Аналитика\\product-analytics\\data\\Фул База 2022.txt';
const DRY_RUN = !!argMap.get('dry-run');
const BATCH_ID = argMap.get('batch-id') || `full-backfill-${new Date().toISOString().slice(0, 10)}`;
const BATCH_SIZE = 1000;
const TRIGGERED_BY = argMap.get('by') || 'itd@emet.in.ua';

// ============================================================================
// Brand detection — портовано з analytics-june-final.py
// Порядок ВАЖЛИВИЙ: специфічні правила першими.
// ============================================================================
const BRAND_RULES = [
  ['Neuronox',   /Neuronox|Ботулотоксин/i],
  ['Petaran',    /PETARAN/i],
  ['Ellanse',    /ELLANSE/i],
  ['Vitaran',    /HP\s*CELL\s*VITARAN|VITARAN\s*(?:i\b|Tox|Whitening|Cosm|а\s*ассор)/i],
  ['EXOXE',      /\bEXOXE\b(?!\-)/i],
  ['Neuramis',   /NEURAMIS/i],
  ['IUSE SB',    /IUSE.*Skin\s*Booster|Skin\s*Booster/i],
  ['IUSE hair',  /IUSE.*(?:hair|волос)|IUSE\s+H\b/i],
  ['IUSE Coll.', /IUSE.*Collagen|Marine\s*Collagen/i],
  ['ESSE',       /\.?ESSE\b|C5\.ESSE|SkinTrial|Skin\s*Trial|Gift\s*set\s*2026|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set|Bakuchiol|Biome|Concealer|tube|Sensitive)/i],
  ['БАД',        /MAGNOX|Дієтична\s*добавк|Диетическая\s*добавк|БАД/i],
];

function detectBrand(product) {
  for (const [brand, pat] of BRAND_RULES) {
    if (pat.test(product)) return brand;
  }
  return null;
}

// Товари яких повністю ІГНОРУЄМО (розхідники, косметика)
const IGNORE_PATTERNS = [
  /Exosome-PDRN/i,
  /PURE\s*CENTELLA/i,
  /Холодоагент/i,
  /Канюл/i,
  /\bГолк\b|Screw\s*Needles/i,
  /Шприц/i,
  /Картридж/i,
  /Насадк/i,
  /Beach\s*Bag|Пляжна\s*сумка|Мішечок|Сумка\s*(?:C1|Esse)/i,
  /\bсаше\b|sachet/i,
  /\bTESTER\b|ТЕСТЕР|тестер/i,
];

function isIgnoredProduct(product) {
  return IGNORE_PATTERNS.some(pat => pat.test(product));
}

// Поводи скидки — виключаємо рядок повністю (не як промо)
const EXCLUDE_DISCOUNT_PATTERNS = [
  /Рекламная\s*продукция/i,
  /День\s*Рождения|ДР\b/i,
  /Гонорар/i,
];

function isExcludedDiscount(discount) {
  if (!discount) return false;
  return EXCLUDE_DISCOUNT_PATTERNS.some(pat => pat.test(discount));
}

function isAmbassador(discount) {
  return !!discount && /Амбассадор/i.test(discount);
}

function isGiftInDiscount(discount) {
  return !!discount && /Подар(ок|унок)/i.test(discount);
}

function detectGiftBrand(discount) {
  if (!isGiftInDiscount(discount)) return null;
  const m = discount.match(/Подар(?:ок|унок)\s+([^(]+?)(?:\s*\(|$)/i);
  if (!m) return null;
  return detectBrand(m[1]);
}

function detectChannel(division) {
  const d = (division || '').toLowerCase().trim();
  if (d.includes('коллцентр') || d.includes('call center') || d.includes('call-center')) {
    return 'call_center';
  }
  return 'representatives';
}

// ============================================================================
// Парсинг чисел (1С формат: NBSP роздільник, кома-decimal)
// ============================================================================
function parseNum(s) {
  if (!s || s.trim() === '') return 0;
  let cleaned = s.replace(/ /g, '').replace(/\s/g, '');
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================================
// Парсинг дати: '08.07.2024 09:21:54' → ISO
// ============================================================================
function parseDate(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  // Trim year+month+day+time, timezone Kyiv (UTC+2/+3) — залишаємо як timestamp
  // без tz щоб не плутатись з DST. Пізніше можна ставити Kyiv locale.
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

// ============================================================================
// Парсинг document ID + line з поля "Реализация товаров и услуг ЗИН00016140 от 05.06.2026 15:18:27"
// ============================================================================
function parseDocId(docText) {
  if (!docText) return null;
  const m = docText.match(/(ЗИН\d+|ЗЛП\d+|№\d+|\d{8,})/);
  return m ? m[1] : null;
}

// ============================================================================
// Supabase REST helpers
// ============================================================================
async function supaFetch(path, opts = {}) {
  const url = `${SUPA_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    Prefer: opts.prefer || 'return=minimal',
    ...(opts.headers || {}),
  };
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase ${opts.method || 'GET'} ${path}: ${r.status} ${text}`);
  }
  if (r.status === 204 || opts.noJson) return null;
  // return=minimal → 201 з порожнім body
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function upsertBatch(rows) {
  if (rows.length === 0) return;
  await supaFetch('sales?on_conflict=doc_id,doc_line', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: rows,
  });
}

async function startBatch() {
  if (DRY_RUN) return;
  await supaFetch('sales_import_batches?on_conflict=batch_id', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: [{
      batch_id: BATCH_ID,
      source: 'tsv-manual',
      status: 'in_progress',
      triggered_by: TRIGGERED_BY,
      started_at: new Date().toISOString(),
      rows_read: 0,
      rows_accepted: 0,
      rows_ignored: 0,
      rows_gift: 0,
      rows_excluded: 0,
    }],
  });
}

async function finishBatch(counters, error) {
  if (DRY_RUN) return;
  const payload = {
    status: error ? 'failed' : 'done',
    finished_at: new Date().toISOString(),
    ...counters,
  };
  if (error) payload.error = String(error).slice(0, 1000);
  // Update by batch_id
  const url = `${SUPA_URL}/rest/v1/sales_import_batches?batch_id=eq.${encodeURIComponent(BATCH_ID)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    console.error('Failed to finish batch:', await r.text());
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log(`Source:   ${SOURCE}`);
  console.log(`Batch ID: ${BATCH_ID}`);
  console.log(`Dry run:  ${DRY_RUN}`);
  console.log('---');

  if (!existsSync(SOURCE)) {
    console.error(`FILE NOT FOUND: ${SOURCE}`);
    process.exit(1);
  }

  await startBatch();

  const counters = {
    rows_read: 0,
    rows_accepted: 0,
    rows_ignored: 0,
    rows_gift: 0,
    rows_excluded: 0,
  };

  let headerIdx = null;
  let header = null;
  let idx = {};
  const docLineCounters = new Map(); // doc_id → next line number
  let buffer = [];
  let flushCount = 0;
  const startTime = Date.now();

  const stream = createReadStream(SOURCE, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  try {
    for await (const rawLine of rl) {
      lineNum++;
      // Знаходимо header (перший рядок з "Документ продажи" і "Дата")
      if (headerIdx === null) {
        if (rawLine.includes('Документ продажи') && rawLine.includes('Дата')) {
          headerIdx = lineNum;
          header = rawLine.split('\t').map(c => c.trim());
          idx = {
            doc: header.indexOf('Документ продажи'),
            date: header.indexOf('Дата'),
            clientName: header.indexOf('Контрагент'),
            code: header.indexOf('Код'),
            phone: header.indexOf('Телефон контрагента'),
            product: header.indexOf('Номенклатура'),
            discount: header.indexOf('Повод скидки'),
            division: header.indexOf('Подразделение'),
            seller: header.indexOf('Сотрудник'),
            seminar: header.indexOf('Семинар'),
            project: header.indexOf('Проект'),
            qty: header.indexOf('Количество (в ед. хранения)'),
            sum: header.indexOf('Сумма продажи (без НДС) в USD'),
          };
          console.log(`Header at line ${headerIdx}. Columns detected: ${JSON.stringify(idx)}`);
        }
        continue;
      }

      const parts = rawLine.split('\t');
      if (parts.length < idx.sum + 1) continue;

      const docText = parts[idx.doc];
      const clientCode = parts[idx.code]?.trim();
      const product = parts[idx.product]?.trim();
      const division = parts[idx.division]?.trim();
      if (!clientCode || !product || !division) continue;

      counters.rows_read++;

      const docId = parseDocId(docText);
      const saleDate = parseDate(parts[idx.date]);
      if (!docId || !saleDate) continue;

      const discount = parts[idx.discount]?.trim() || '';
      const qty = parseNum(parts[idx.qty]);
      const sumUsd = parseNum(parts[idx.sum]);

      // Класифікація
      const brand = detectBrand(product);
      const channel = detectChannel(division);
      const isIgnored = !brand && isIgnoredProduct(product);
      const isGift = isGiftInDiscount(discount) && sumUsd === 0;
      const isExcluded = isExcludedDiscount(discount) || (isAmbassador(discount) && sumUsd === 0);

      if (isIgnored) counters.rows_ignored++;
      else if (isGift) counters.rows_gift++;
      else if (isExcluded) counters.rows_excluded++;
      else counters.rows_accepted++;

      // Excluded: promo-related discounts (Реклама/ДР/Гонорар/Амбассадор-free)
      // — окрема колонка щоб фільтрувати у агрегатах разом з is_ignored/is_gift.

      // doc_line — послідовний номер рядка в цьому документі
      // (у TSV немає явного doc_line; рахуємо самі)
      const nextLine = (docLineCounters.get(docId) || 0) + 1;
      docLineCounters.set(docId, nextLine);

      const row = {
        doc_id: docId,
        doc_line: nextLine,
        sale_date: saleDate,
        client_code: clientCode,
        client_name: parts[idx.clientName]?.trim() || '',
        phone: parts[idx.phone]?.trim() || null,
        product,
        discount: discount || null,
        division,
        seller: parts[idx.seller]?.trim() || null,
        seminar: parts[idx.seminar]?.trim() || null,
        project: parts[idx.project]?.trim() || null,
        qty,
        sum_usd: sumUsd,
        brand: brand || 'НЕ_МАПНУТО',
        channel,
        is_ignored: isIgnored,
        is_gift: isGift,
        is_excluded: isExcluded,
        gift_brand: detectGiftBrand(discount),
        batch_id: BATCH_ID,
      };
      buffer.push(row);

      if (buffer.length >= BATCH_SIZE) {
        if (!DRY_RUN) await upsertBatch(buffer);
        flushCount += buffer.length;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (flushCount / elapsed).toFixed(0);
        console.log(`  Flushed ${flushCount.toLocaleString()} rows · ${rate} rows/sec · read ${counters.rows_read.toLocaleString()}`);
        buffer = [];
      }
    }

    // Flush залишки
    if (buffer.length > 0) {
      if (!DRY_RUN) await upsertBatch(buffer);
      flushCount += buffer.length;
      console.log(`  Flushed final ${buffer.length} rows`);
    }

    await finishBatch(counters);

    const elapsed = (Date.now() - startTime) / 1000;
    console.log('---');
    console.log('DONE');
    console.log(`  Rows read:      ${counters.rows_read.toLocaleString()}`);
    console.log(`  Rows accepted:  ${counters.rows_accepted.toLocaleString()}`);
    console.log(`  Rows ignored:   ${counters.rows_ignored.toLocaleString()}`);
    console.log(`  Rows gift:      ${counters.rows_gift.toLocaleString()}`);
    console.log(`  Rows excluded:  ${counters.rows_excluded.toLocaleString()}`);
    console.log(`  Time:           ${elapsed.toFixed(1)}s (${(flushCount / elapsed).toFixed(0)} rows/sec)`);
    console.log(`  Batch ID:       ${BATCH_ID}`);
    if (DRY_RUN) console.log('  *** DRY RUN — nothing written to Supabase ***');
  } catch (e) {
    console.error('FAILED:', e);
    await finishBatch(counters, e).catch(() => {});
    process.exit(1);
  }
}

main();
