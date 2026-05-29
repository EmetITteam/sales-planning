/**
 * Скріншоти вкладки «Мої клієнти» (/clients) для manual + presentation.
 * Маскує суми (.amount → ***), імʼя менеджера, ПІБ клієнтів, емейли.
 * Output: public/screenshots/clients-*.png
 *
 * Usage: node scripts/capture-clients.mjs
 * Креди: QA_LOGIN/QA_PASSWORD з .env. URL: QA_URL або lyart-preview.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const BASE_URL = (process.env.QA_URL && process.env.QA_URL.trim()) || 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.QA_LOGIN;
const PASSWORD = process.env.QA_PASSWORD;
const OUT_DIR = join(process.cwd(), 'public', 'screenshots');
mkdirSync(OUT_DIR, { recursive: true });

if (!LOGIN || !PASSWORD) { console.error('QA_LOGIN / QA_PASSWORD required'); process.exit(1); }

// Маскування ідентифікаторної інфи (сума/ПІБ/емейл/імʼя менеджера).
async function maskBeforeShot(page) {
  await page.evaluate(() => {
    document.body.dataset.hideAmounts = 'true';
    try { localStorage.setItem('emet:hideAmounts', 'true'); } catch {}
    // Імʼя менеджера у шапці
    document.querySelectorAll('.flex.flex-col span, .flex-col span').forEach(el => {
      const t = (el.textContent || '').trim();
      if (/^[А-ЯІЇЄҐ][а-яіїєґ]+\s+[А-ЯІЇЄҐ][а-яіїєґ]+/.test(t)) el.textContent = 'Менеджер EMET';
    });
    // Контрагенти (ПІБ + компанії) у leaf-вузлах. Правило: 2+ слова з ВЕЛИКОЇ
    // кириличної літери → це назва контрагента (ловить «Прізвище Імʼя»,
    // «ТОВ Аптека Здоровʼя», «ФОП Прізвище …»). UI-лейбли — Слово+малими
    // (План активації / База клієнтів / Контактна активність) → 1 cap → не чіпає.
    document.querySelectorAll('p, span, div').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (t.length < 5 || t.length > 90) return;
      const words = t.split(/\s+/);
      const capCyr = words.filter(w => /^[А-ЯІЇЄҐ]/.test(w)).length;
      if (capCyr >= 2) el.textContent = (words[0][0] || '*') + '. ' + '*'.repeat(6);
    });
    // Емейли
    document.querySelectorAll('p, span, div, code').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) el.textContent = '***@emet.in.ua';
    });
    // Телефони
    document.querySelectorAll('p, span, div').forEach(el => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (/^\+?\d[\d\s()-]{7,}$/.test(t)) el.textContent = '+38 *** *** **';
    });
    // Аватар-ініціали
    document.querySelectorAll('[class*="Avatar"], [class*="avatar"]').forEach(el => {
      if (/^[А-ЯІЇЄҐ]{1,3}$/.test((el.textContent || '').trim())) el.textContent = 'EM';
    });
  });
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  await maskBeforeShot(page);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const page = await context.newPage();

try {
  console.log('Login...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').fill(LOGIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /увійти/i }).click();
  await page.waitForSelector('text=/Торгові марки|Огляд|Регіон|Менеджери/i', { timeout: 30000 });

  console.log('Go to /clients...');
  await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
  // Чекаємо поки список клієнтів завантажиться з 1С
  await page.waitForSelector('text=/База клієнтів/i', { timeout: 30000 });
  await page.waitForTimeout(3500); // hero-метрики + факт по чанках

  // 1. Hero-банд (4 картки) + пошук/фільтри
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'clients-01-hero');

  // 2. Список клієнтів по категоріях
  await page.evaluate(() => window.scrollTo(0, 560));
  await page.waitForTimeout(500);
  await shot(page, 'clients-02-list');

  // 3. Розгорнута картка клієнта (клік по рядку → План×Факт + історія + події)
  console.log('Expand a client...');
  await page.keyboard.press('Escape'); // закрити будь-який стрей-дропдаун шапки
  await page.evaluate(() => window.scrollTo(0, 560));
  await page.waitForTimeout(400);
  // Перший клієнтський рядок — ТІЛЬКИ в <main> (user-меню шапки теж aria-expanded)
  const firstRow = page.locator('main button[aria-expanded]').first();
  await firstRow.click();
  await page.waitForTimeout(3000); // lazy getClientReport (3-міс історія + події)
  // Підняти розгорнутий рядок до верху в'юпорта — щоб видно розгорнуту панель
  await firstRow.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await shot(page, 'clients-03-card');

  console.log(`\nDone → ${OUT_DIR}`);
} catch (err) {
  console.error('FAIL:', err.message);
  await page.screenshot({ path: join(OUT_DIR, 'clients-error.png') }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
