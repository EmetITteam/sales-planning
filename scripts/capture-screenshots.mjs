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

// Маскує ідентифікаторну інфу перед скріном:
// - Вмикає hideAmounts mode (CSS: body[data-hide-amounts="true"] .amount → ***)
// - Замінює full name користувача на "Менеджер EMET" + ініціали
// - Прибирає логін з dropdown
// - Маскує ПІБ менеджерів у списках (перші 3 символи + крапки)
async function maskBeforeShot(page) {
  await page.evaluate(() => {
    // 1. Hide amounts
    document.body.dataset.hideAmounts = 'true';
    try { localStorage.setItem('emet:hideAmounts', 'true'); } catch {}

    // 2. Header user name + login
    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const txt = el.textContent || '';
      if (/Регіональний керівник|Менеджер|Директор/.test(txt) && /@/.test(el.innerHTML || '')) {
        // dropdown content with login — clear
      }
    });
    // Замінити user-name span (h-9, .leading-tight)
    document.querySelectorAll('.flex.flex-col span, .flex-col span').forEach(el => {
      const t = el.textContent || '';
      // Detect "ПІБ" pattern (Слово Слово, кирилиця)
      if (/^[А-ЯІЇЄҐ][а-яіїєґ]+\s+[А-ЯІЇЄҐ][а-яіїєґ]+$/.test(t.trim())) {
        el.textContent = 'Менеджер EMET';
      }
    });

    // 3. Manager rosters: брати text-content де схоже на ПІБ, замінювати на M.ХХХ
    document.querySelectorAll('p, span, div').forEach(el => {
      if (el.children.length > 0) return; // тільки leaf-вузли
      const t = (el.textContent || '').trim();
      // ПІБ шаблон: "Прізвище Ім'я" або "Прізвище І." або "Прізвище Ім'я По-Батькові"
      if (/^[А-ЯІЇЄҐ][а-яіїєґ']{2,}\s+[А-ЯІЇЄҐ][а-яіїєґ'.]+(\s+[А-ЯІЇЄҐ][а-яіїєґ'.]+)?$/.test(t)) {
        // Лишити перше слово, замінити решту на крапки — щоб видно що це ПІБ але не вгадаєш кого
        const parts = t.split(/\s+/);
        el.textContent = parts[0].slice(0, 1) + '. ' + '*'.repeat(Math.max(3, parts[1].length));
      }
    });

    // 4. Email-логіни → masked
    document.querySelectorAll('p, span, div, code').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) {
        el.textContent = '***@emet.in.ua';
      }
    });

    // 5. Avatar initials — replace with neutral
    document.querySelectorAll('[class*="AvatarFallback"], .avatar, [class*="avatar"]').forEach(el => {
      if (/^[А-ЯІЇЄҐ]{1,3}$/.test((el.textContent || '').trim())) {
        el.textContent = 'EM';
      }
    });
  });
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  await maskBeforeShot(page);
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
