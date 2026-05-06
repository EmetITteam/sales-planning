/**
 * QA-сценарій для перевірки виправлень фільтру клієнтів по сегменту
 * та видалення передзаповнених mock-прогнозів.
 *
 * Запуск:
 *   QA_LOGIN=email QA_PASSWORD=пароль npm run qa
 *
 * За замовчуванням headed mode (видно вікно браузера).
 * Headless: HEADLESS=1 npm run qa
 *
 * Вивід: ✅ ok / ❌ bug / 💡 note + скріни/відео в scripts/qa-output/
 */

import { chromium } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.QA_URL ?? 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.QA_LOGIN ?? '';
const PASSWORD = process.env.QA_PASSWORD ?? '';
const HEADLESS = process.env.HEADLESS === '1';
const OUT_DIR = join(process.cwd(), 'scripts', 'qa-output');

// Чисто почати
try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(OUT_DIR, { recursive: true });

const results = { ok: 0, bug: 0, note: 0 };
const log = {
  ok: (msg) => { console.log(`✅ ok   | ${msg}`); results.ok++; },
  bug: (level, msg) => { console.log(`❌ bug [${level}] | ${msg}`); results.bug++; },
  note: (msg) => { console.log(`💡 note | ${msg}`); results.note++; },
  step: (msg) => console.log(`\n━━━ ${msg} ━━━`),
};

async function shot(page, name) {
  try {
    await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
  } catch {}
}

async function main() {
  if (!LOGIN || !PASSWORD) {
    console.log('⚠️  QA_LOGIN/QA_PASSWORD не задані. Тест буде використовувати DEMO кнопку якщо вона є.');
    console.log('    Для повного тесту запусти: QA_LOGIN=email QA_PASSWORD=пароль npm run qa\n');
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 400,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  // Збираємо помилки консолі (тільки error, ігноруємо warn/info/debug)
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    // === 1. Відкриваємо сайт ===
    log.step('1. Відкриваємо сайт + логін');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await shot(page, '01-login-page');

    if (LOGIN && PASSWORD) {
      // Реальний логін
      const emailInput = page.locator('input[type="email"], input[placeholder*="mail" i]').first();
      const passInput = page.locator('input[type="password"]').first();
      await emailInput.fill(LOGIN);
      await passInput.fill(PASSWORD);
      const loginBtn = page.getByRole('button', { name: /увійти|login/i }).first();
      await loginBtn.click();
      log.note(`Логін реальним користувачем: ${LOGIN}`);
    } else {
      // Спробуємо демо-кнопку
      const demoBtn = page.getByRole('button', { name: /менеджер/i }).first();
      if (await demoBtn.count() > 0) {
        await demoBtn.click();
        log.note('Логін через демо-кнопку (Менеджер)');
      } else {
        log.bug('critical', 'Нема кредів і нема демо-кнопок — тест зупинено');
        return;
      }
    }

    // Чекаємо дашборд (може мати "Торгові марки" або "План місяця")
    await page.waitForSelector('text=/План місяця|Торгові марки/i', { timeout: 30000 });
    log.ok('Дашборд завантажився');
    await shot(page, '02-dashboard');

    // === 2. Перевіряємо що картка "Факт" не пуста / показує число ===
    log.step('2. Перевіряємо MetricCard "Факт"');
    const factCard = page.locator('text="Факт"').first();
    if (await factCard.count() > 0) {
      log.ok('Картка "Факт" присутня');
    } else {
      log.bug('high', 'Картка "Факт" не знайдена на дашборді');
    }

    // === 3. Перевіряємо банер помилки 1С ===
    log.step('3. Перевіряємо чи є помилка 1С (показав би якщо API недоступний)');
    const errorBanner = page.locator('text=/Не вдалось.*1С|показано mock/i').first();
    if (await errorBanner.count() > 0) {
      const text = await errorBanner.textContent();
      log.note(`Банер 1С-помилки видно: "${text?.slice(0, 100)}"`);
    } else {
      log.ok('Помилки 1С немає (або з реальним логіном дані прийшли)');
    }

    // === 4. Відкриваємо ELLANSE — основний тест бага ===
    log.step('4. Відкриваємо ELLANSE — перевіряємо фільтр клієнтів і пустий прогноз');
    const ellanseRow = page.locator('text=/Ellanse/i').first();
    if (await ellanseRow.count() === 0) {
      log.bug('high', 'Бренд Ellanse не знайдено на дашборді');
    } else {
      await ellanseRow.click();
      await page.waitForSelector('text=/Дані по клієнтах по ТМ|Прогноз по активних/i', { timeout: 15000 });
      await shot(page, '03-ellanse-form');
      log.ok('Форма ELLANSE відкрилась');

      // Перевіряємо кількість Активних клієнтів
      const activeRow = page.locator('text="Активні клієнти"').first();
      if (await activeRow.count() > 0) {
        // Шукаємо число поряд з "Активні клієнти" — може бути в наступних колонках
        const containerText = await activeRow.locator('xpath=ancestor::*[1]').textContent();
        const matches = containerText?.match(/Активні клієнти[\s\S]*?(\d+)/);
        const activeCount = matches ? parseInt(matches[1], 10) : null;
        if (activeCount === null) {
          log.note(`Не зміг розпарсити кількість активних клієнтів. Текст: "${containerText?.slice(0, 200)}"`);
        } else if (activeCount > 100) {
          log.bug('high', `Активних клієнтів ${activeCount} — занадто багато для Ellanse (баг фільтру по сегменту)`);
        } else if (activeCount === 0) {
          log.note(`Активних клієнтів 0 — або у менеджера справді нема, або 1С не відповів`);
        } else {
          log.ok(`Активних клієнтів ${activeCount} — реалістично для Ellanse`);
        }
      } else {
        log.bug('medium', 'Рядок "Активні клієнти" не знайдено');
      }

      // Перевіряємо що блок "Прогноз по активних" пустий (нема передзаповнених мок-рядків)
      // Шукаємо клієнтів типу "Сидоренко", "Єфіменко", "Мачтакова" — це були mock
      const mockNames = ['Сидоренко', 'Єфіменко', 'Мачтакова'];
      let foundMock = [];
      for (const name of mockNames) {
        const cnt = await page.locator(`text=${name}`).count();
        if (cnt > 0) foundMock.push(name);
      }
      if (foundMock.length > 0) {
        log.bug('high', `Mock-прогноз все ще передзаповнений: ${foundMock.join(', ')}`);
      } else {
        log.ok('Блок "Прогноз" чистий — mock-клієнтів нема');
      }

      // Шукаємо кнопку "Додати клієнта" в прогнозі — має бути
      const addBtn = page.getByRole('button', { name: /додати клієнт/i }).first();
      if (await addBtn.count() > 0) {
        log.ok('Кнопка "Додати клієнта" присутня (можна додавати реальних)');
      } else {
        log.bug('medium', 'Кнопка "Додати клієнта" не знайдена');
      }
    }

    // === 5. Повертаємось → відкриваємо PETARAN — має бути showcase з mock ===
    log.step('5. Перевіряємо PETARAN — showcase з mock-даними має лишитись');
    const backBtn = page.getByRole('button', { name: /дашборд/i }).first();
    if (await backBtn.count() > 0) {
      await backBtn.click();
      await page.waitForSelector('text=/План місяця|Торгові марки/i', { timeout: 15000 });
    }
    const petaranRow = page.locator('text=/Petaran/i').first();
    if (await petaranRow.count() === 0) {
      log.bug('medium', 'Бренд Petaran не знайдено');
    } else {
      await petaranRow.click();
      await page.waitForSelector('text=/Дані по клієнтах по ТМ|Прогноз по активних/i', { timeout: 15000 });
      await shot(page, '04-petaran-form');

      // У PETARAN мають бути прогнози (mock)
      const forecastRows = await page.locator('text=/Сидоренко|Єфіменко|Мачтакова|Бліндовська|Главацька/i').count();
      if (forecastRows > 0) {
        log.ok(`PETARAN містить showcase-mock прогнози (${forecastRows} згадок)`);
      } else {
        log.note('PETARAN не показує mock-прогнози — можливо Supabase повернув порожньо');
      }
    }

    // === 6. Помилки в консолі ===
    log.step('6. Помилки в браузерній консолі');
    // 401 від /api/onec при демо-логіні — очікувано (1С не знає демо-юзера)
    const isUsingDemo = !LOGIN || !PASSWORD;
    const expected401 = (e) => isUsingDemo && /401|Unauthorized/i.test(e);
    const realErrors = consoleErrors.filter(e => !expected401(e));
    if (realErrors.length === 0) {
      log.ok(`Немає помилок (${consoleErrors.length - realErrors.length} 401-х від 1С при демо-логіні очікувані)`);
    } else {
      log.bug('medium', `${realErrors.length} помилок в консолі`);
      realErrors.slice(0, 5).forEach(e => console.log(`     - ${e.slice(0, 200)}`));
    }

    await shot(page, '99-final');

  } catch (err) {
    log.bug('critical', `Виключення під час тесту: ${err.message}`);
    await shot(page, 'crash');
  } finally {
    await context.close();
    await browser.close();
  }

  // === Підсумок ===
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`ПІДСУМОК: ✅ ${results.ok} ok | ❌ ${results.bug} bugs | 💡 ${results.note} notes`);
  console.log(`Скріни/відео: ${OUT_DIR}`);
  process.exit(results.bug > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
