/**
 * Capture screenshots for the manager-facing presentation + user manual.
 * Output: public/screenshots/<role>-<step>.png
 *
 * Usage: node scripts/capture-screenshots.mjs
 *
 * Uses QA_LOGIN/QA_PASSWORD з .env. Run на пустій сесії — кешу не буде.
 */

import { chromium } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
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

const BASE_URL = process.env.QA_URL ?? 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.QA_LOGIN;
const PASSWORD = process.env.QA_PASSWORD;
const OUT_DIR = join(process.cwd(), 'public', 'screenshots');
mkdirSync(OUT_DIR, { recursive: true });

if (!LOGIN || !PASSWORD) {
  console.error('QA_LOGIN / QA_PASSWORD required');
  process.exit(1);
}

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`✓ ${name}.png`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  // ─── 1. Login screen ───
  console.log('1. Login screen...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, '01-login');

  // ─── 2. Login and reach dashboard ───
  console.log('2. Logging in...');
  await page.locator('input[type="email"]').fill(LOGIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /увійти/i }).click();
  await page.waitForSelector('text=/Регіон|Менеджери|Торгові марки|Огляд по компанії/i', { timeout: 30000 });
  await page.waitForTimeout(2000); // wait for Action 5 to fill data

  // ─── 3. RM Dashboard (or Director — depends on QA login) ───
  console.log('3. Top dashboard...');
  await shot(page, '02-rm-dashboard');

  // Scroll to brands section
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await shot(page, '03-rm-brands');

  // Scroll all the way down
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await shot(page, '04-rm-bottom');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ─── 4. RM clicks on a brand (BrandManagerGroup expand) ───
  console.log('4. Brand drill-down...');
  await page.locator('text=/Ellanse|Petaran|Neuramis/i').first().click();
  await page.waitForTimeout(1000);
  await shot(page, '05-rm-brand-expanded');

  // Click "Моє планування" to enter Manager view
  console.log('5. Entering "Моє планування"...');
  const myPlanningBtn = page.locator('button:has-text("Моє планування")').first();
  if (await myPlanningBtn.count() > 0) {
    await myPlanningBtn.click();
    await page.waitForTimeout(2000);
    await shot(page, '06-manager-dashboard');

    // Click ELLANSE to open expand
    console.log('6. Clicking ELLANSE...');
    await page.locator('text=/Ellanse/i').first().click();
    await page.waitForTimeout(1500);
    await shot(page, '07-manager-brand-expand');

    // Click "Перейти у форму"
    console.log('7. Opening planning form...');
    const goToForm = page.locator('text=/Перейти у форму/').first();
    await goToForm.waitFor({ state: 'visible', timeout: 10000 });
    await goToForm.click();
    await page.waitForSelector('text=/Дані по клієнтах|Прогноз по активних/i', { timeout: 15000 });
    await page.waitForTimeout(3000); // wait for clients to load

    await shot(page, '08-planning-form-top');

    // Scroll to forecasts
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    await shot(page, '09-planning-forecasts');

    // Scroll to gap closures
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(500);
    await shot(page, '10-planning-gap-closures');

    // Scroll to bottom (save button)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await shot(page, '11-planning-bottom');
  }

  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
} catch (err) {
  console.error('FAIL:', err.message);
  await page.screenshot({ path: join(OUT_DIR, 'error.png') }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
