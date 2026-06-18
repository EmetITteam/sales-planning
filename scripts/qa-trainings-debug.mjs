/**
 * Debug-сценарій: чому getTrainings повертає [] у тренінг-Select.
 *
 * Запуск:
 *   QA_URL=https://sales-planning-XXX.vercel.app node scripts/qa-trainings-debug.mjs
 *
 * Скрипт:
 *  1. Логиниться як sm.kiev4 (звичайний менеджер) — у нього СВОЯ форма з тренінгами
 *  2. Перехоплює всі /api/onec запити
 *  3. Відкриває першу доступну форму планування
 *  4. Знаходить запит getTrainings → виводить payload + response
 *  5. Виводить trainings.length у фінальному state
 *
 * Headless = за замовч.
 */
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  }
}

const BASE_URL = process.env.QA_URL ?? 'http://localhost:3000';
const LOGIN = process.env.QA_LOGIN ?? '';
const PASSWORD = process.env.QA_PASSWORD ?? '';

console.log(`🌐 URL:   ${BASE_URL}`);
console.log(`👤 Login: ${LOGIN}`);

const trainingsCalls = []; // зберігаємо всі getTrainings request/response

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Перехоплюємо POST /api/onec
page.on('request', async (req) => {
  if (req.url().endsWith('/api/onec') && req.method() === 'POST') {
    try {
      const body = req.postDataJSON();
      if (body?.action === 'getTrainings') {
        trainingsCalls.push({ phase: 'REQUEST', payload: body.payload });
        console.log('📤 getTrainings REQUEST payload:', JSON.stringify(body.payload));
      }
    } catch {}
  }
});

page.on('response', async (resp) => {
  if (resp.url().endsWith('/api/onec') && resp.request().method() === 'POST') {
    try {
      const reqBody = resp.request().postDataJSON();
      if (reqBody?.action === 'getTrainings') {
        const body = await resp.json().catch(() => null);
        const status = resp.status();
        const trainingsCount = body?.data?.trainings?.length ?? body?.trainings?.length ?? '?';
        const first3 = (body?.data?.trainings ?? body?.trainings ?? []).slice(0, 3);
        trainingsCalls.push({ phase: 'RESPONSE', status, trainingsCount, first3, raw: body });
        console.log(`📥 getTrainings RESPONSE status=${status} trainings.length=${trainingsCount}`);
        if (first3.length > 0) {
          console.log('   First 3 trainings:', JSON.stringify(first3, null, 2));
        }
      }
    } catch {}
  }
});

try {
  console.log('\n━━━ Логін ━━━');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(LOGIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /увійти|login/i }).first().click();
  await page.waitForSelector('text=/Торгові марки|Бренди/i', { timeout: 30000 });
  console.log('✅ Залогінились');

  console.log('\n━━━ Відкриваємо форму планування ━━━');
  await page.waitForTimeout(3000); // wait for plans/clients to load

  // Шукаємо BrandRow з кнопкою «Перейти у форму» — клікаємо перший
  const brandBtns = page.locator('button[aria-expanded]');
  const n = await brandBtns.count();
  console.log(`   BrandRow buttons: ${n}`);

  let opened = false;
  for (let i = 0; i < Math.min(n, 6); i++) {
    await brandBtns.nth(i).scrollIntoViewIfNeeded();
    await brandBtns.nth(i).click();
    await page.waitForTimeout(800);
    const planBtn = page.locator('button:has-text("Перейти у форму")').first();
    if (await planBtn.count() > 0) {
      console.log(`   Бренд #${i}: знайдено «Перейти у форму»`);
      await planBtn.click();
      opened = true;
      break;
    }
    await brandBtns.nth(i).click(); // collapse back
    await page.waitForTimeout(200);
  }

  if (!opened) {
    console.log('❌ Не вдалось знайти бренд з кнопкою «Перейти у форму»');
  } else {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForTimeout(5000); // wait for getTrainings to fire on mount

    console.log('\n━━━ Перевіряємо DOM ━━━');
    const trainingOptions = await page.evaluate(() => {
      const selects = [...document.querySelectorAll('select')].filter(s =>
        /Обрати навчання/.test(s.options?.[0]?.textContent || '')
      );
      return selects.map(s => ({
        optionsTotal: s.options.length,
        sample: [...s.options].slice(0, 3).map(o => o.textContent?.slice(0, 60)),
      }));
    });
    console.log('Training selects у DOM:', JSON.stringify(trainingOptions, null, 2));

    console.log('\n━━━ Шукаємо клієнта зі stage="Навчання" ━━━');
    // Спробуємо встановити stage='Навчання' для першого клієнта якщо ще нема
    const stageSelects = page.locator('button[data-slot="select-trigger"]').filter({ hasText: /Обрати|Дзвінок|Зустріч|Мессенджер|Навчання/i });
    const stageCount = await stageSelects.count();
    console.log(`   Stage selects: ${stageCount}`);

    // Чекаємо ще щоб усі fetch завершились
    await page.waitForTimeout(3000);
  }

  console.log('\n━━━ ПІДСУМОК getTrainings ━━━');
  if (trainingsCalls.length === 0) {
    console.log('❌ getTrainings ЖОДНОГО разу не викликалось — effectiveRegionCode пустий?');
  } else {
    for (const c of trainingsCalls) {
      console.log(`   ${c.phase}:`, JSON.stringify(c.phase === 'REQUEST' ? c.payload : { status: c.status, trainingsCount: c.trainingsCount }));
    }
  }
} catch (e) {
  console.log('💥 ВИНЯТОК:', e.message);
}

await ctx.close();
await browser.close();
