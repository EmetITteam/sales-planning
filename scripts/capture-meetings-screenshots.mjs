/**
 * Скріншоти для розділу «Зустрічі» + admin/unfinalize-permissions.
 *
 * Вивід: public/screenshots/meetings-*.png + admin-*.png
 *
 * Запуск: node scripts/capture-meetings-screenshots.mjs
 *
 * Використовує QA_LOGIN / QA_PASSWORD з .env. Робить screenshots на пустій
 * сесії (новий browser context) щоб не було state з кешу.
 *
 * Mask логіка — та сама що у capture-screenshots.mjs: hideAmounts mode +
 * заміна ПІБ + ***@emet.in.ua. Перевір що скрін НЕ містить чутливих даних
 * перед commit-ом у git.
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
  console.error('QA_LOGIN / QA_PASSWORD required у .env');
  process.exit(1);
}

async function waitForDataReady(page, readyIndicator = null, timeout = 25000) {
  try {
    await page.waitForSelector('text=/Завантажуємо.*1С|Завантаження зустрічей/i', { state: 'detached', timeout });
  } catch { /* spinner may not appear */ }
  if (readyIndicator) {
    await page.waitForSelector(readyIndicator, { timeout });
  }
  await page.waitForTimeout(500);
}

/** Маскуємо суми + ПІБ + email перед screenshot. */
async function maskBeforeShot(page) {
  await page.evaluate(() => {
    document.body.dataset.hideAmounts = 'true';
    try { localStorage.setItem('emet:hideAmounts', 'true'); } catch {}

    // ПІБ → "П. ***"
    document.querySelectorAll('p, span, div, h1, h2, h3, h4').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^[А-ЯІЇЄҐ][а-яіїєґ']{2,}\s+[А-ЯІЇЄҐ][а-яіїєґ'.]+(\s+[А-ЯІЇЄҐ][а-яіїєґ'.]+)?$/.test(t)) {
        const parts = t.split(/\s+/);
        el.textContent = parts[0].slice(0, 1) + '. ' + '*'.repeat(Math.max(3, parts[1].length));
      }
    });

    // Email-логіни → masked
    document.querySelectorAll('p, span, div, code').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) {
        el.textContent = '***@emet.in.ua';
      }
    });

    // Avatar initials → "EM"
    document.querySelectorAll('[class*="AvatarFallback"], .avatar, [class*="avatar"]').forEach(el => {
      if (/^[А-ЯІЇЄҐ]{1,3}$/.test((el.textContent || '').trim())) {
        el.textContent = 'EM';
      }
    });

    // Номери телефонів → ***
    document.querySelectorAll('p, span, div, a').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^\+?\d{10,15}$/.test(t.replace(/\D/g, ''))) {
        el.textContent = '+380 *** *** ***';
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
  // ─── 1. Login ───
  console.log('1. Logging in...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').fill(LOGIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /увійти/i }).click();
  // Чекаємо на зникнення "Перевіряю сесію" — це гарантує що bootstrap завершено.
  try {
    await page.waitForSelector('text=/Перевіряю сесію/', { state: 'detached', timeout: 30000 });
  } catch { /* may not appear at all */ }
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // ─── 2. /meetings — список зустрічей ───
  console.log('2. /meetings — список...');
  await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'networkidle', timeout: 30000 });
  // Чекаємо на header "Зустрічі" або кнопку "Нова зустріч" — обов'язково є
  // незалежно від того чи є дані.
  await page.waitForSelector('button:has-text("Нова зустріч"), h1:has-text("Зустрічі")', { timeout: 20000 });
  await page.waitForTimeout(2500); // дати час на завантаження списку
  await shot(page, 'meetings-01-list');

  // Scroll down — якщо є зустрічі, побачимо більше
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);
  await shot(page, 'meetings-02-list-scroll');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ─── 3. Створення нової зустрічі ───
  console.log('3. Створення зустрічі...');
  const newMeetingBtn = page.locator('button:has-text("Нова зустріч")').first();
  if (await newMeetingBtn.count() > 0) {
    await newMeetingBtn.click();
    await page.waitForSelector('text=/Створити зустріч|Нова зустріч/i', { timeout: 10000 });
    await page.waitForTimeout(800);
    await shot(page, 'meetings-03-create-empty');

    // Вибір клієнта (відкрити picker)
    const clientPicker = page.locator('button:has-text("Обрати клієнта"), button:has-text("Свого клієнта")').first();
    if (await clientPicker.count() > 0) {
      await clientPicker.click();
      await page.waitForTimeout(800);
      await shot(page, 'meetings-04-client-picker');
      // Close picker (Esc)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    // Close form
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ─── 4. Admin: розфіналізація permissions ───
  console.log('4. /admin/unfinalize-permissions...');
  try {
    await page.goto(`${BASE_URL}/admin/unfinalize-permissions`, { waitUntil: 'networkidle', timeout: 20000 });
    // Якщо не admin → редірект на /
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('/admin/unfinalize-permissions')) {
      await page.waitForSelector('text=/Розфіналізація планів/i', { timeout: 10000 });
      await page.waitForTimeout(800);
      await shot(page, 'admin-01-unfinalize-permissions');
    } else {
      console.warn('  · skipped — not admin session (redirected to ' + url + ')');
    }
  } catch (e) {
    console.warn('  · admin/unfinalize-permissions skipped:', e.message);
  }

  // ─── 5. Admin: stage-edit-permissions ───
  console.log('5. /admin/stage-edit-permissions...');
  try {
    await page.goto(`${BASE_URL}/admin/stage-edit-permissions`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('/admin/stage-edit-permissions')) {
      await page.waitForSelector('text=/Редагування етапу/i', { timeout: 10000 });
      await page.waitForTimeout(800);
      await shot(page, 'admin-02-stage-edit-permissions');
    }
  } catch (e) {
    console.warn('  · stage-edit-permissions skipped:', e.message);
  }

  // ─── 6. Admin menu ───
  console.log('6. /admin (меню)...');
  try {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    if (page.url().endsWith('/admin')) {
      await page.waitForSelector('text=/Адмін-панель|Керування плануванням/i', { timeout: 10000 });
      await page.waitForTimeout(500);
      await shot(page, 'admin-03-menu');
    }
  } catch (e) {
    console.warn('  · /admin skipped:', e.message);
  }

  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
} catch (err) {
  console.error('FAIL:', err.message);
  await page.screenshot({ path: join(OUT_DIR, 'meetings-error.png') }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
