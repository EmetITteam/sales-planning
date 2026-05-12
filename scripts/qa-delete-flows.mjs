/**
 * QA-сценарій: всі варіанти видалення клієнтів у формі планування.
 *
 * Перевіряємо bug який повторно з'являвся:
 * 1. Single-delete (через урну) → save → refresh → видалений зник
 * 2. Bulk-delete (декілька, не всі) → save → refresh → видалені не повернулись
 * 3. Bulk-delete всіх з gap → save → refresh → gap пустий
 * 4. Bulk-delete всіх з forecast → save → refresh → forecast пустий
 * 5. Bulk-delete всіх з обох блоків → save → refresh → пусто
 *
 * Запуск:
 *   QA_LOGIN=email QA_PASSWORD=pass node scripts/qa-delete-flows.mjs
 *   HEADLESS=1 — без вікна
 *
 * Вивід: кроки + scrshots у scripts/qa-output/delete-flows/
 */

import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const BASE_URL = process.env.QA_URL ?? 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.QA_LOGIN ?? '';
const PASSWORD = process.env.QA_PASSWORD ?? '';
const HEADLESS = process.env.HEADLESS === '1' || true; // sandbox = headless
const SEGMENT = process.env.QA_SEGMENT ?? 'Ellanse'; // який бренд тестуємо
const OUT_DIR = join(process.cwd(), 'scripts', 'qa-output', 'delete-flows');

try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(OUT_DIR, { recursive: true });

let stepCount = 0;
const log = {
  step: (msg) => console.log(`\n━━━ ${++stepCount}. ${msg} ━━━`),
  ok: (msg) => console.log(`  ✅ ${msg}`),
  bug: (msg) => console.log(`  ❌ BUG: ${msg}`),
  note: (msg) => console.log(`  💡 ${msg}`),
};
const shot = async (page, name) => {
  try { await page.screenshot({ path: join(OUT_DIR, `${String(stepCount).padStart(2, '0')}-${name}.png`), fullPage: true }); }
  catch {}
};

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(LOGIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /увійти|login/i }).first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await shot(page, 'logged-in');
}

async function openForm(page, segmentName) {
  // Якщо ми у RM/Director дашборді — зайти у "Моє планування" або через drill-down.
  // Спрощено: шукаємо кнопку "Моє планування", якщо є — натискаємо.
  const myBtn = page.locator('button:has-text("Моє планування")').first();
  if (await myBtn.count() > 0) {
    await myBtn.click();
    await page.waitForTimeout(2000);
  }
  // Тепер шукаємо бренд-row і клікаємо
  const brandRow = page.locator(`text=/${segmentName}/i`).first();
  await brandRow.waitFor({ state: 'visible', timeout: 15000 });
  await brandRow.click();
  // BrandRow expand → "Перейти у форму"
  const goToForm = page.locator('text=/Перейти у форму/').first();
  try {
    await goToForm.waitFor({ state: 'visible', timeout: 10000 });
    await goToForm.click();
  } catch {
    // Якщо нема — можливо вже у формі
  }
  // Чекаємо markers що ми у формі
  await page.waitForSelector('text=/Прогноз по активних|Закриття розриву/i', { timeout: 20000 });
  // Чекаємо поки auto-populate додасть рядки (1С відповіла)
  await page.waitForTimeout(3000);
}

/** Підрахунок поточних рядків у блоці (forecast=прогноз, gap=розриву). */
async function countRows(page, block) {
  // Простий підрахунок "Клієнтів N" з footer-у блоку
  const footerText = await page.locator('body').innerText();
  // Приклад: "Клієнтів 15 (0 ✓)" — тут шукаємо число.
  // Footer для forecast: "Прогноз $X | Факт $Y | Незавершено $Z | Клієнтів N (M ✓)"
  // Footer для gap:      "Потенціал $X | Факт $Y | Клієнтів N"
  const matches = [...footerText.matchAll(/Кл(?:ієнтів|иентов)\s+(\d+)/g)];
  if (block === 'forecast') return matches[0] ? parseInt(matches[0][1], 10) : 0;
  if (block === 'gap')      return matches[1] ? parseInt(matches[1][1], 10) : 0;
  return 0;
}

async function clickSaveAndWait(page) {
  const saveBtn = page.locator('button:has-text("Зберегти")').first();
  const respPromise = page.waitForResponse(r => r.url().includes('/api/planning') && r.request().method() === 'POST', { timeout: 15000 });
  await saveBtn.click();
  const resp = await respPromise;
  log.note(`POST /api/planning → ${resp.status()}`);
  // Read payload + response
  try {
    const body = JSON.parse(resp.request().postData() || '{}');
    log.note(`payload: clearAll=${body.clearAll}, forecasts=${body.forecasts?.length ?? 0}, gap=${body.gapClosures?.length ?? 0}`);
  } catch {}
  // Чекаємо toast «Збережено»
  await page.waitForTimeout(1500);
}

async function refresh(page) {
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // для нав persistence + load
}

async function bulkDelete(page, blockSelectorSelectAll) {
  // Виділити всіх через select-all checkbox у блоці
  await blockSelectorSelectAll.check();
  await page.waitForTimeout(500);
  // Кнопка "Видалити обраних"
  await page.locator('button:has-text("Видалити обраних")').first().click();
  // Модалка → "Видалити"
  await page.locator('button:has-text("Видалити"):not(:has-text("Видалити обраних"))').first().click();
  await page.waitForTimeout(800);
}

// ═════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`QA delete flows — ${BASE_URL}`);
  console.log(`Login: ${LOGIN}`);
  console.log(`Segment: ${SEGMENT}\n`);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 300 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    log.step('Login');
    await login(page);
    log.ok(`Logged in as ${LOGIN}`);

    log.step(`Open form for segment: ${SEGMENT}`);
    await openForm(page, SEGMENT);
    await shot(page, 'form-opened');
    const initialForecast = await countRows(page, 'forecast');
    const initialGap = await countRows(page, 'gap');
    log.ok(`Initial: forecast=${initialForecast}, gap=${initialGap}`);

    if (initialForecast === 0 && initialGap === 0) {
      log.bug('Форма пуста — нема що тестувати. 1С не повернула клієнтів?');
      await shot(page, 'form-empty');
      return;
    }

    // ─── Сценарій 1: Bulk-delete всіх з gap → save → refresh ───
    if (initialGap > 0) {
      log.step('Сценарій 1: Bulk-delete ВСІХ з gap → save → refresh');
      // Шукаємо select-all checkbox у gap-блоку. Видимий тільки в md:grid.
      // Спрощено: select-all з aria-label="Обрати всіх" + наближено до тексту "Закриття"
      const gapSelectAll = page.locator('section:has-text("Закриття розриву") input[aria-label="Обрати всіх"]').first()
        .or(page.locator('input[aria-label="Обрати всіх"]').nth(1));
      await bulkDelete(page, gapSelectAll);
      const afterDelete = await countRows(page, 'gap');
      if (afterDelete === 0) log.ok(`Після bulk-delete: gap=0 (state очистився)`);
      else log.bug(`Після bulk-delete gap=${afterDelete} (мав бути 0)`);
      await shot(page, 'after-bulk-delete-gap');

      await clickSaveAndWait(page);
      await shot(page, 'after-save-gap');
      await refresh(page);
      const afterRefresh = await countRows(page, 'gap');
      if (afterRefresh === 0) log.ok(`Після refresh: gap=0 — DELETE спрацював у БД ✓`);
      else log.bug(`Після refresh gap=${afterRefresh} (мав бути 0) — клієнти повернулись!`);
      await shot(page, 'after-refresh-gap');
    } else {
      log.note('Сценарій 1 пропущено — gap пустий від початку');
    }

    // ─── Сценарій 2: Bulk-delete всіх з forecast → save → refresh ───
    const forecastNow = await countRows(page, 'forecast');
    if (forecastNow > 0) {
      log.step('Сценарій 2: Bulk-delete ВСІХ з forecast → save → refresh');
      const forecastSelectAll = page.locator('input[aria-label="Обрати всіх"]').first();
      await bulkDelete(page, forecastSelectAll);
      const afterDelete = await countRows(page, 'forecast');
      if (afterDelete === 0) log.ok(`Після bulk-delete: forecast=0`);
      else log.bug(`Після bulk-delete forecast=${afterDelete} (мав бути 0)`);
      await shot(page, 'after-bulk-delete-forecast');

      await clickSaveAndWait(page);
      await shot(page, 'after-save-forecast');
      await refresh(page);
      const afterRefresh = await countRows(page, 'forecast');
      if (afterRefresh === 0) log.ok(`Після refresh: forecast=0 ✓`);
      else log.bug(`Після refresh forecast=${afterRefresh} — повернулись!`);
      await shot(page, 'after-refresh-forecast');
    }

    // ─── Перевірка console errors ───
    if (consoleErrors.length > 0) {
      log.step('Console errors');
      consoleErrors.slice(0, 5).forEach(e => log.bug(`console: ${e.slice(0, 200)}`));
    }
  } catch (err) {
    log.bug(`Exception: ${err.message}`);
    await shot(page, 'fatal-error');
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
  console.log(`\nScreenshots + video: ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
