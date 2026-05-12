/**
 * QA: повна перевірка сценаріїв видалення клієнтів у формі планування.
 *
 * Сценарії (всі через UI як справжній user):
 *   A. Single-delete (через урну) одного клієнта → save → refresh
 *   B. Bulk-delete декількох (НЕ всіх) → save → refresh
 *   C. Bulk-delete ВСІХ з gap (порожній блок) → save → refresh
 *   D. Bulk-delete ВСІХ з forecast → save → refresh
 *
 * Інваріант кожного сценарію: після refresh кількість клієнтів = state ДО
 * refresh. Тобто save реально видалив у БД, ніщо не повернулось.
 *
 * Запуск:
 *   QA_LOGIN=email QA_PASSWORD=pass node scripts/qa-delete-flows.mjs
 *   HEADLESS=1 — без вікна (default у sandbox)
 *   QA_SEGMENT=Petaran — конкретний бренд (default — авто-пошук непустого)
 *
 * Вивід: console + screenshots у scripts/qa-output/delete-flows/
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
const HEADLESS = (process.env.HEADLESS ?? '1') === '1';
const FORCE_SEGMENT = process.env.QA_SEGMENT;
const OUT_DIR = join(process.cwd(), 'scripts', 'qa-output', 'delete-flows');

try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(OUT_DIR, { recursive: true });

const SEGMENTS = ['Petaran', 'Ellanse', 'EXOXE', 'ESSE', 'Neuramis', 'Neuronox', 'Vitaran', 'IUSE'];
let stepCount = 0;
const results = { ok: 0, bug: 0 };
const log = {
  step: (msg) => console.log(`\n━━━ ${++stepCount}. ${msg} ━━━`),
  ok: (msg) => { console.log(`  ✅ ${msg}`); results.ok++; },
  bug: (msg) => { console.log(`  ❌ BUG: ${msg}`); results.bug++; },
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
  // Чекаємо РЕАЛЬНУ ознаку залогіненого state — name у app-header АБО brand row
  // АБО myPlanning button. Чекаємо до 30с (1С getRegionData повільне).
  try {
    await page.waitForSelector(
      'text=/Моє планування|Petaran|Ellanse|Vitaran|Дашборд|Менеджер|Регіон/i',
      { timeout: 45000 },
    );
  } catch {
    throw new Error('Login не пройшов або dashboard не завантажився за 45с');
  }
  await page.waitForTimeout(2000);
  // Якщо РМ/Director — натискаємо "Моє планування" (бо їх root = регіон/компанія)
  const myBtn = page.locator('button:has-text("Моє планування")').first();
  if (await myBtn.count() > 0) {
    await myBtn.click();
    await page.waitForTimeout(3000);
  }
}

/** Для menager dashboard — лічимо рядки клієнтів у обох блоках з footer-у. */
async function readCounts(page) {
  // Footer Прогноз: "Клієнтів N (M ✓)"; Footer Gap: "Клієнтів N"
  const text = await page.locator('body').innerText();
  const matches = [...text.matchAll(/Кл[іи][єе]нт[іи]?в?\s+(\d+)/gi)];
  // У форму попадає кілька footer-ів: hero "Клієнти" і двох блоків.
  // Беремо ОСТАННІ ДВА — це footers blocks.
  const nums = matches.map(m => parseInt(m[1], 10));
  if (nums.length < 2) return { forecast: 0, gap: 0 };
  return { forecast: nums[nums.length - 2], gap: nums[nums.length - 1] };
}

async function backToDashboard(page) {
  // Спробуємо різні варіанти "назад на dashboard"
  const candidates = [
    page.locator('a:has-text("Дашборд")').first(),
    page.locator('button:has-text("Дашборд")').first(),
    page.getByRole('link', { name: /Дашборд/ }).first(),
    page.locator('text=← Дашборд').first(),
  ];
  for (const c of candidates) {
    try {
      if (await c.count() > 0 && await c.isVisible({ timeout: 500 }).catch(() => false)) {
        await c.click();
        await page.waitForTimeout(2000);
        return;
      }
    } catch {}
  }
  // Fallback — просто повна перезавантажка з clean nav
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  const myBtn = page.locator('button:has-text("Моє планування")').first();
  if (await myBtn.count() > 0) {
    await myBtn.click();
    await page.waitForTimeout(2000);
  }
}

async function openForm(page, segmentName) {
  await backToDashboard(page);
  // Шукаємо BrandRow з brand-name. Не точне співпадіння — у рядку може бути
  // ще цифри (% / суми). h3-стиль або data-attribute відсутні, beremо просто
  // text-locator.
  const brandRow = page.locator(`text=/${segmentName}/i`).first();
  try {
    await brandRow.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    return false;
  }
  await brandRow.click();
  await page.waitForTimeout(1000);
  // Variant A: BrandRow expand → CTA "Перейти у форму"
  const goToForm = page.locator('text=/Перейти у форму/').first();
  try {
    await goToForm.waitFor({ state: 'visible', timeout: 5000 });
    await goToForm.click();
  } catch { /* можливо одразу у формі */ }
  // Чекаємо markers форми
  try {
    await page.waitForSelector('text=/Прогноз по активних|Закриття розриву/i', { timeout: 15000 });
  } catch {
    return false;
  }
  // Чекаємо поки auto-populate додасть рядки — даємо 1С відповісти
  await page.waitForTimeout(5000);
  return true;
}

async function findNonEmptyBrand(page) {
  if (FORCE_SEGMENT) {
    if (await openForm(page, FORCE_SEGMENT)) {
      const c = await readCounts(page);
      if (c.forecast + c.gap > 0) {
        log.ok(`Бренд ${FORCE_SEGMENT}: forecast=${c.forecast}, gap=${c.gap}`);
        return { name: FORCE_SEGMENT, ...c };
      }
      log.bug(`QA_SEGMENT=${FORCE_SEGMENT} порожній`);
      return null;
    }
    log.bug(`Не вдалось відкрити форму бренду ${FORCE_SEGMENT}`);
    return null;
  }
  for (const seg of SEGMENTS) {
    log.note(`Пробуємо бренд ${seg}...`);
    if (!(await openForm(page, seg))) {
      log.note(`  не вдалось відкрити ${seg}`);
      continue;
    }
    const c = await readCounts(page);
    if (c.forecast + c.gap > 0) {
      log.ok(`Знайдено непустий бренд: ${seg} (forecast=${c.forecast}, gap=${c.gap})`);
      return { name: seg, ...c };
    }
    log.note(`  ${seg}: пустий (forecast=0, gap=0)`);
  }
  return null;
}

async function clickSaveAndCapture(page, label) {
  const saveBtn = page.locator('button:has-text("Зберегти")').first();
  const respPromise = page.waitForResponse(
    r => r.url().includes('/api/planning') && !r.url().includes('aggregate') && r.request().method() === 'POST',
    { timeout: 20000 },
  );
  await saveBtn.click();
  let payload = {};
  try {
    const resp = await respPromise;
    log.note(`POST /api/planning → ${resp.status()} (${label})`);
    try { payload = JSON.parse(resp.request().postData() || '{}'); } catch {}
    log.note(`  payload: clearAll=${payload.clearAll}, forecasts=${payload.forecasts?.length ?? 0}, gap=${payload.gapClosures?.length ?? 0}`);
  } catch (e) {
    log.bug(`save failed: ${e.message}`);
  }
  await page.waitForTimeout(1500);
  return payload;
}

async function refreshPage(page) {
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
}

async function bulkDeleteAll(page, blockName) {
  // selectAll header checkbox + "Видалити обраних" + Confirm "Видалити"
  const headerCb = page.locator('input[aria-label="Обрати всіх"]').first();
  await headerCb.check({ force: true });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Видалити обраних")').first().click();
  await page.locator('button:has-text("Видалити"):not(:has-text("обраних"))').first().click();
  await page.waitForTimeout(1200);
  log.note(`bulk-delete всіх з ${blockName} натиснуто`);
}

async function singleDelete(page, blockName) {
  // Перша урна (delete) у списку. Має бути у блоці
  const trashBtn = page.locator('button[aria-label="Видалити клієнта"]').first();
  if (await trashBtn.count() === 0) {
    log.note(`немає кнопки видалення у ${blockName}`);
    return false;
  }
  await trashBtn.click();
  await page.locator('button:has-text("Видалити"):not(:has-text("обраних"))').first().click();
  await page.waitForTimeout(800);
  log.note(`single-delete у ${blockName} натиснуто`);
  return true;
}

// ═════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`QA delete flows — ${BASE_URL}`);
  console.log(`Login: ${LOGIN}`);
  console.log(`Headless: ${HEADLESS}`);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 250 });
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
    await shot(page, 'logged-in');

    log.step('Знаходимо непустий бренд');
    const brand = await findNonEmptyBrand(page);
    if (!brand) {
      log.bug('Жодного непустого бренду не знайдено — нема що тестувати.');
      return;
    }
    await shot(page, `form-${brand.name}-initial`);

    // ─── A. Single-delete (через урну) ───
    if (brand.gap > 0 || brand.forecast > 0) {
      log.step(`A. Single-delete одного клієнта → save → refresh`);
      const before = await readCounts(page);
      const block = before.forecast > 0 ? 'forecast' : 'gap';
      const ok = await singleDelete(page, block);
      if (!ok) { log.bug('single-delete не натиснулось'); }
      else {
        const afterDel = await readCounts(page);
        const expected = before[block] - 1;
        if (afterDel[block] === expected) log.ok(`State ${block}: ${before[block]} → ${afterDel[block]} (-1)`);
        else log.bug(`State ${block}: ${before[block]} → ${afterDel[block]} (мав бути ${expected})`);
        await shot(page, 'A-after-single-delete');
        await clickSaveAndCapture(page, 'A: single');
        await refreshPage(page);
        const afterRef = await readCounts(page);
        if (afterRef[block] === expected) log.ok(`Refresh ${block}: ${afterRef[block]} ✓ (видалений у БД, не повернувся)`);
        else log.bug(`Refresh ${block}: ${afterRef[block]} (мав бути ${expected}) — клієнт повернувся!`);
        await shot(page, 'A-after-refresh');
      }
    }

    // ─── B. Bulk-delete декількох (НЕ всіх) ───
    // Цей сценарій вимагає мінімум 3 рядка щоб виділити 2 з 3.
    // Зробимо тільки якщо forecast>=3 АБО gap>=3.
    const cur = await readCounts(page);
    if (cur.forecast >= 3) {
      log.step(`B. Bulk-delete 2 з ${cur.forecast} forecast → save → refresh`);
      // Виділяємо перші 2 рядки checkbox-ами
      const rowChecks = page.locator('input[type="checkbox"][aria-label^="Обрати "]').all();
      const checks = await rowChecks;
      if (checks.length >= 2) {
        await checks[0].check({ force: true });
        await checks[1].check({ force: true });
        await page.waitForTimeout(400);
        await page.locator('button:has-text("Видалити обраних")').first().click();
        await page.locator('button:has-text("Видалити"):not(:has-text("обраних"))').first().click();
        await page.waitForTimeout(1200);
        const afterDel = await readCounts(page);
        const expected = cur.forecast - 2;
        if (afterDel.forecast === expected) log.ok(`State forecast: ${cur.forecast} → ${afterDel.forecast} (-2)`);
        else log.bug(`State forecast: ${cur.forecast} → ${afterDel.forecast} (мав бути ${expected})`);
        await shot(page, 'B-after-bulk-partial');
        await clickSaveAndCapture(page, 'B: bulk partial');
        await refreshPage(page);
        const afterRef = await readCounts(page);
        if (afterRef.forecast === expected) log.ok(`Refresh forecast: ${afterRef.forecast} ✓`);
        else log.bug(`Refresh forecast: ${afterRef.forecast} (мав бути ${expected})`);
        await shot(page, 'B-after-refresh');
      } else {
        log.note('checkbox-ів < 2 — пропускаємо B');
      }
    } else {
      log.note(`forecast=${cur.forecast}<3 — пропускаємо B (мало даних для часткового видалення)`);
    }

    // ─── C. Bulk-delete ВСІХ з GAP → save → refresh ───
    const cur2 = await readCounts(page);
    if (cur2.gap > 0) {
      log.step(`C. Bulk-delete ВСІХ ${cur2.gap} з gap → save → refresh`);
      // SelectAll саме у gap-блоку — другий "Обрати всіх" header (forecast=перший).
      const selectAllInputs = await page.locator('input[aria-label="Обрати всіх"]').all();
      const idx = selectAllInputs.length === 1 ? 0 : 1; // forecast=0, gap=1
      if (selectAllInputs.length > idx) {
        await selectAllInputs[idx].check({ force: true });
        await page.waitForTimeout(400);
        // Шукаємо bulk-bar найближчий до gap-блоку — другий "Видалити обраних"
        const bulkBtns = await page.locator('button:has-text("Видалити обраних")').all();
        const btn = bulkBtns[bulkBtns.length - 1] || bulkBtns[0];
        await btn.click();
        await page.locator('button:has-text("Видалити"):not(:has-text("обраних"))').first().click();
        await page.waitForTimeout(1200);
        const afterDel = await readCounts(page);
        if (afterDel.gap === 0) log.ok(`State gap: ${cur2.gap} → 0`);
        else log.bug(`State gap: ${cur2.gap} → ${afterDel.gap} (мав бути 0)`);
        await shot(page, 'C-after-bulk-all-gap');
        await clickSaveAndCapture(page, 'C: bulk all gap');
        await refreshPage(page);
        const afterRef = await readCounts(page);
        if (afterRef.gap === 0) log.ok(`Refresh gap: 0 ✓ (DELETE спрацював у БД)`);
        else log.bug(`Refresh gap: ${afterRef.gap} (мав бути 0) — клієнти повернулись!`);
        await shot(page, 'C-after-refresh');
      }
    } else {
      log.note('gap=0 — пропускаємо C');
    }

    // ─── D. Bulk-delete ВСІХ з FORECAST → save → refresh ───
    const cur3 = await readCounts(page);
    if (cur3.forecast > 0) {
      log.step(`D. Bulk-delete ВСІХ ${cur3.forecast} з forecast → save → refresh`);
      const selectAllInputs = await page.locator('input[aria-label="Обрати всіх"]').all();
      if (selectAllInputs.length > 0) {
        await selectAllInputs[0].check({ force: true });
        await page.waitForTimeout(400);
        await page.locator('button:has-text("Видалити обраних")').first().click();
        await page.locator('button:has-text("Видалити"):not(:has-text("обраних"))').first().click();
        await page.waitForTimeout(1200);
        const afterDel = await readCounts(page);
        if (afterDel.forecast === 0) log.ok(`State forecast: ${cur3.forecast} → 0`);
        else log.bug(`State forecast: ${cur3.forecast} → ${afterDel.forecast}`);
        await shot(page, 'D-after-bulk-all-forecast');
        await clickSaveAndCapture(page, 'D: bulk all forecast');
        await refreshPage(page);
        const afterRef = await readCounts(page);
        if (afterRef.forecast === 0) log.ok(`Refresh forecast: 0 ✓`);
        else log.bug(`Refresh forecast: ${afterRef.forecast} (мав бути 0) — клієнти повернулись!`);
        await shot(page, 'D-after-refresh');
      }
    } else {
      log.note('forecast=0 — пропускаємо D');
    }

    if (consoleErrors.length > 0) {
      log.step('Console errors під час тесту');
      consoleErrors.slice(0, 8).forEach(e => log.bug(`console: ${e.slice(0, 200)}`));
    }
  } catch (err) {
    log.bug(`Exception: ${err.message}`);
    await shot(page, 'fatal-error');
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n━━━ ПІДСУМОК ━━━`);
  console.log(`✅ ok:  ${results.ok}`);
  console.log(`❌ bug: ${results.bug}`);
  console.log(`Screenshots: ${OUT_DIR}`);
  process.exit(results.bug > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
