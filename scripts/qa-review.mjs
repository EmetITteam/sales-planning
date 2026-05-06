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
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Підтягуємо .env (без dotenv-dep — простий парсер).
// Не перевизначаємо те що вже задано через `$env:VAR=...`.
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

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
  const isPlaceholder = LOGIN === 'manager@emet.com' || PASSWORD === 'твій_пароль_тут';
  if (!LOGIN || !PASSWORD || isPlaceholder) {
    console.log('⚠️  QA_LOGIN/QA_PASSWORD не заповнені (або стоять плейсхолдери з .env).');
    console.log('    Тест буде використовувати DEMO кнопку — реальні 1С-фікси не перевіряться.');
    console.log('    Заповни QA_LOGIN/QA_PASSWORD у .env реальними кредами менеджера і запусти `npm run qa` знов.\n');
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

  // Логуємо всі неуспішні fetch запити до наших API — для діагностики 401/500
  const failedRequests = [];
  page.on('response', async (resp) => {
    if (resp.ok()) return;
    const url = resp.url();
    if (!url.includes('/api/')) return;
    const req = resp.request();
    let reqBody = '';
    let respBody = '';
    try { reqBody = (req.postData() || '').slice(0, 500); } catch {}
    try { respBody = (await resp.text()).slice(0, 400); } catch {}
    failedRequests.push({
      url: url.replace(/^https?:\/\/[^/]+/, ''),
      status: resp.status(),
      method: req.method(),
      reqBody,
      respBody,
    });
  });

  try {
    // === 1. Відкриваємо сайт ===
    log.step('1. Відкриваємо сайт + логін');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await shot(page, '01-login-page');

    if (LOGIN && PASSWORD && !isPlaceholder) {
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

    // Чекаємо будь-яку ознаку що ми на дашборді (підходить для Manager / RM / Director)
    await page.waitForSelector('text=/Менеджери|Торгові марки|Моє планування|Регіон\\s|Бренди/i', { timeout: 30000 });
    log.ok('Дашборд завантажився');
    await shot(page, '02-dashboard');

    // Визначаємо роль за наявністю секцій
    const isRM = (await page.locator('text=/Менеджери|Моє планування|Регіон\\s/i').count()) > 0;
    log.note(isRM ? 'Виявлено РМ/Директор-дашборд' : 'Виявлено менеджер-дашборд');

    // === 2. Перевіряємо що нема $NaN / NaN% ніде на дашборді (NaN-баг) ===
    log.step('2. Перевіряємо відсутність NaN на дашборді');
    const bodyText = await page.locator('body').innerText();
    if (/\$NaN|NaN\s*%/.test(bodyText)) {
      log.bug('critical', 'На дашборді є $NaN або NaN% — баг конвертації числових полів з 1С');
    } else {
      log.ok('NaN відсутній — фікс toNumber() працює');
    }

    // === 3. Перевіряємо банер помилки 1С ===
    log.step('3. Перевіряємо банер помилки 1С');
    const errorBanner = page.locator('text=/Не вдалось.*1С|показано mock/i').first();
    if (await errorBanner.count() > 0) {
      const text = await errorBanner.textContent();
      log.bug('medium', `Банер 1С-помилки: "${text?.slice(0, 100)}"`);
    } else {
      log.ok('Помилки 1С немає');
    }

    // === Якщо РМ — відкриваємо "Моє планування" щоб перейти у Manager-форму ===
    if (isRM) {
      log.step('РМ-режим: відкриваємо "Моє планування" щоб перевірити Manager-форму');
      // Шукаємо саме <button> з текстом — інакше тригериться текст у банері/підказках
      const mineBtn = page.locator('button:has-text("Моє планування")').first();
      if (await mineBtn.count() > 0) {
        await mineBtn.click();
        await page.waitForSelector('text=/Торгові марки|Petaran|Ellanse/i', { timeout: 15000 });
        log.ok('"Моє планування" відкрилось');
      } else {
        log.note('Кнопка "Моє планування" не знайдена — пропускаємо Manager-тести');
        await shot(page, '99-final-rm');
        return;
      }
    }

    // === 4. Відкриваємо ELLANSE — основний тест бага ===
    log.step('4. Відкриваємо ELLANSE — перевіряємо фільтр клієнтів і auto-populate прогнозу');
    const ellanseRow = page.locator('text=/Ellanse/i').first();
    if (await ellanseRow.count() === 0) {
      log.bug('high', 'Бренд Ellanse не знайдено на дашборді');
    } else {
      await ellanseRow.click();
      await page.waitForSelector('text=/Дані по клієнтах по ТМ|Прогноз по активних/i', { timeout: 15000 });
      log.ok('Форма ELLANSE відкрилась');

      // Чекаємо поки 1С відповість — індикатор «завантажуємо клієнтів з 1С...» має зникнути.
      // Якщо індикатора не з'явилось взагалі — або кеш, або помилка; daleko не чекаємо.
      try {
        await page.waitForSelector('text=/завантажуємо клієнтів з 1С/i', { state: 'detached', timeout: 10000 });
      } catch {
        // ignore — індикатора могло не бути
      }
      // Маленька додаткова пауза для переконатись що setForecasts() відпрацював
      await page.waitForTimeout(500);
      await shot(page, '03-ellanse-form');

      // Перевіряємо кількість Активних клієнтів
      let activeCount = null;
      const activeRow = page.locator('text="Активні клієнти"').first();
      if (await activeRow.count() > 0) {
        const containerText = await activeRow.locator('xpath=ancestor::*[1]').textContent();
        const matches = containerText?.match(/Активні клієнти[\s\S]*?(\d+)/);
        activeCount = matches ? parseInt(matches[1], 10) : null;
        if (activeCount === null) {
          log.note(`Не зміг розпарсити кількість активних клієнтів. Текст: "${containerText?.slice(0, 200)}"`);
        } else if (activeCount > 100) {
          log.bug('high', `Активних клієнтів ${activeCount} — занадто багато для Ellanse (баг фільтру по сегменту)`);
        } else if (activeCount === 0) {
          log.note(`Активних клієнтів 0 — або у менеджера справді нема в Ellanse, або 1С не відповів`);
        } else {
          log.ok(`Активних клієнтів ${activeCount} — реалістично для Ellanse (фільтр по сегменту працює)`);
        }
      } else {
        log.bug('medium', 'Рядок "Активні клієнти" не знайдено');
      }

      // Перевіряємо що блок «Прогноз» НЕ містить старих mock-клієнтів
      const mockNames = ['Сидоренко', 'Єфіменко', 'Мачтакова'];
      let foundMock = [];
      for (const name of mockNames) {
        const cnt = await page.locator(`text=${name}`).count();
        if (cnt > 0) foundMock.push(name);
      }
      if (foundMock.length > 0) {
        log.bug('high', `Mock-прогноз все ще передзаповнений: ${foundMock.join(', ')}`);
      } else {
        log.ok('Блок «Прогноз» не містить старих mock-клієнтів (Сидоренко/Єфіменко/Мачтакова)');
      }

      // Перевіряємо AUTO-POPULATE: у блоці «Прогноз по активних» має бути N рядків
      // що дорівнює activeCount. Шукаємо input[type="number"] (поле Прогноз).
      // Альтернатива: шукаємо хоча б один не-mock клієнт у списку прогнозу.
      if (activeCount !== null && activeCount > 0) {
        const forecastInputs = await page.locator('input[type="number"]').count();
        // Inputs у прогнозі + inputs у gap-closure + інші. Просто перевіряємо що є хоча б N
        if (forecastInputs >= activeCount) {
          log.ok(`Auto-populate працює: знайдено ${forecastInputs} input-ів (мінімум ${activeCount} очікувалось)`);
        } else {
          log.bug('high', `Auto-populate не спрацював: input-ів ${forecastInputs}, активних клієнтів ${activeCount}`);
        }
      } else if (activeCount === 0) {
        log.note('Auto-populate не перевірений — активних клієнтів 0');
      }

      const addBtn = page.getByRole('button', { name: /додати клієнт/i }).first();
      if (await addBtn.count() > 0) {
        log.ok('Кнопка "Додати клієнта" присутня');
      } else {
        log.bug('medium', 'Кнопка "Додати клієнта" не знайдена');
      }

      // === 4b. Save+restore: вписуємо унікальне число → зберігаємо → закриваємо → відкриваємо знов ===
      log.step('4b. Перевіряємо save→restore через Supabase');
      if (activeCount !== null && activeCount > 0) {
        const uniqueValue = Math.floor(Math.random() * 9000) + 1000;
        const firstInput = page.locator('input[type="number"]').first();
        await firstInput.fill(String(uniqueValue));
        log.note(`Вписали ${uniqueValue} у перший рядок прогнозу`);

        const saveBtn = page.getByRole('button', { name: /^зберегти$/i }).first();
        if (await saveBtn.count() === 0) {
          log.bug('high', 'Кнопка "Зберегти" не знайдена');
        } else {
          await saveBtn.click();
          // Чекаємо БУДЬ-ЯКИЙ результат — успіх або помилка
          try {
            await page.waitForSelector('text=/Збережено|Помилка|HTTP \\d+/i', { timeout: 10000 });
            const successText = await page.locator('text=/Збережено/i').count();
            if (successText > 0) {
              log.ok('Збереження пройшло (баннер "Збережено!")');
            } else {
              const errorBanner = page.locator('text=/Помилка|HTTP \\d+/i').first();
              const errText = await errorBanner.textContent();
              log.bug('high', `Save повернув помилку: "${errText?.slice(0, 200)}"`);
            }
          } catch {
            log.bug('high', 'Не дочекались жодної відповіді від Save (10с)');
          }

          // Назад на дашборд (РМ → manager-view → ELLANSE-form, отже back веде у manager-view)
          const backToDash = page.getByRole('button', { name: /дашборд/i }).first();
          if (await backToDash.count() > 0) {
            await backToDash.click();
            await page.waitForSelector('text=/Торгові марки|Менеджери/i', { timeout: 15000 });

            // Зміряємо час повторного відкриття ELLANSE — має бути миттєво (кеш Zustand)
            const reopenStart = Date.now();
            await page.locator('text=/Ellanse/i').first().click();
            await page.waitForSelector('text=/Дані по клієнтах по ТМ/i', { timeout: 15000 });
            // Чекаємо на можливий індикатор завантаження (якщо кеш прохолов — буде)
            const hadLoadingIndicator = await page.locator('text=/завантажуємо клієнтів з 1С/i').count() > 0;
            const reopenMs = Date.now() - reopenStart;
            if (!hadLoadingIndicator && reopenMs < 1500) {
              log.ok(`Кеш працює: повторне відкриття ELLANSE за ${reopenMs}мс без fetch'у з 1С`);
            } else if (hadLoadingIndicator) {
              log.bug('medium', `Кеш не спрацював: видно індикатор "завантажуємо клієнтів з 1С"`);
            } else {
              log.note(`Повторне відкриття ELLANSE за ${reopenMs}мс — повільнувато для кешу`);
            }
            await page.waitForTimeout(500);

            // Шукаємо унікальне значення в input-ах
            const inputs = page.locator('input[type="number"]');
            const count = await inputs.count();
            const values = [];
            for (let i = 0; i < Math.min(count, 25); i++) {
              values.push(await inputs.nth(i).inputValue());
            }
            if (values.includes(String(uniqueValue))) {
              log.ok(`Restore з Supabase працює: знайдено ${uniqueValue} серед прогнозів`);
            } else {
              log.bug('high', `Restore не спрацював: ${uniqueValue} не знайдено. Перші значення: ${values.slice(0, 5).join(', ')}`);
            }
            await shot(page, '05-ellanse-restored');
          }
        }
      } else {
        log.note('Save/restore не тестуємо — activeCount=0');
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
    // 401 від /api/onec — 1С відмовив запиту. App обробляє через error-banner;
    // якщо банера немає на сторінці — це не блокер для UX, лише note.
    const is401 = (e) => /401|Unauthorized/i.test(e);
    const real401s = consoleErrors.filter(is401);
    const realErrors = consoleErrors.filter(e => !is401(e));
    if (real401s.length > 0) {
      log.note(`${real401s.length} 401-х від 1С (app не падає, але варто розібратись чому 1С відмовив)`);
    }
    if (failedRequests.length > 0) {
      log.note(`Неуспішні API-запити (для діагностики):`);
      failedRequests.forEach(r => {
        console.log(`     ${r.method} ${r.status} ${r.url}`);
        if (r.reqBody) console.log(`       req:  ${r.reqBody}`);
        if (r.respBody) console.log(`       resp: ${r.respBody}`);
      });
    }
    if (realErrors.length === 0) {
      log.ok(`Інших помилок в консолі немає`);
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
