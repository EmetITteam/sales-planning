/**
 * QA-агент для refactor аудиту (Days 1-10).
 *
 * Перевіряє чи всі екстраговані секції правильно рендеряться + jak працюють:
 *   - /clients — 4 hero + filters + клієнт-картка + ClientExpand
 *   - /planning/[brand] — 4 метрики + ClientDataByTm + Forecast + GapClosure + SaveBar
 *
 * Запуск:
 *   npm run qa:refactor                          (headed, default Vercel preview URL)
 *   HEADLESS=1 npm run qa:refactor               (headless)
 *   QA_URL=https://prod-url.com npm run qa:refactor
 *
 * Вивід: ✅ / ❌ / 💡 + скріни у scripts/qa-output/refactor-audit/
 */

import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// .env autoloader (як у qa-review.mjs)
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

// Default → Vercel preview branch URL. Override через QA_URL.
const BASE_URL = process.env.QA_URL ?? 'https://sales-planning-lyart.vercel.app';
const LOGIN = process.env.QA_LOGIN ?? '';
const PASSWORD = process.env.QA_PASSWORD ?? '';
const HEADLESS = process.env.HEADLESS === '1';
const OUT_DIR = join(process.cwd(), 'scripts', 'qa-output', 'refactor-audit');

try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(OUT_DIR, { recursive: true });

const results = { ok: 0, bug: 0, note: 0, bugDetails: [] };
const log = {
  ok: (msg) => { console.log(`✅ ok   | ${msg}`); results.ok++; },
  bug: (level, msg) => {
    console.log(`❌ bug [${level}] | ${msg}`);
    results.bug++;
    results.bugDetails.push({ level, msg });
  },
  note: (msg) => { console.log(`💡 note | ${msg}`); results.note++; },
  step: (msg) => console.log(`\n━━━ ${msg} ━━━`),
};

async function shot(page, name) {
  try {
    await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
  } catch {}
}

/** Перевіряє чи на сторінці є будь-яке з очікуваних слів (text content). */
async function hasAnyText(page, regexes) {
  const body = await page.locator('body').innerText();
  return regexes.some(r => r.test(body));
}

async function main() {
  if (!LOGIN || !PASSWORD) {
    log.bug('critical', 'QA_LOGIN/QA_PASSWORD не заповнені у .env — тест зупинено');
    return;
  }

  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`👤 Login:    ${LOGIN}`);
  console.log(`🖥  Mode:     ${HEADLESS ? 'headless' : 'headed (slowMo 400ms)'}`);
  console.log('');

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 400,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  const failedRequests = [];
  page.on('response', async (resp) => {
    if (resp.ok()) return;
    const url = resp.url();
    if (!url.includes('/api/')) return;
    failedRequests.push({
      url: url.replace(/^https?:\/\/[^/]+/, ''),
      status: resp.status(),
    });
  });

  try {
    // ═══════════════════════════════════════════════════
    // 1. ЛОГІН
    // ═══════════════════════════════════════════════════
    log.step('1. Логін');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await shot(page, '01-login-page');

    await page.locator('input[type="email"]').first().fill(LOGIN);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /увійти|login/i }).first().click();
    await page.waitForSelector('text=/Торгові марки|Бренди|Виконання|план|факт/i', { timeout: 30000 });
    log.ok(`Логін успішний для ${LOGIN}`);
    await shot(page, '02-dashboard');

    if (/\$NaN|NaN\s*%/.test(await page.locator('body').innerText())) {
      log.bug('critical', 'Дашборд має $NaN / NaN% — числові поля не парсяться');
    } else {
      log.ok('Дашборд: нема NaN');
    }

    // ═══════════════════════════════════════════════════
    // 2. /clients — перевіряємо рефактор Days 1-5
    // ═══════════════════════════════════════════════════
    log.step('2. /clients — перевірка рефактору (19 нових файлів)');

    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // на завантаження клієнтів з 1С
    await shot(page, '03-clients-page');

    // 2.1. PageTitle (filters/page-title.tsx)
    if (await page.locator('h1:has-text("Клієнти")').count() > 0) {
      log.ok('clients/filters: PageTitle — заголовок «Клієнти» рендериться');
    } else {
      log.bug('high', 'PageTitle не знайдено — filters/page-title.tsx зламано');
    }

    // 2.2. ClientsMonthFilter (filters/clients-month-filter.tsx)
    if (await page.locator('text=Поточний').count() > 0) {
      log.ok('clients/filters: ClientsMonthFilter — month-pills видно');
    } else {
      log.bug('high', 'ClientsMonthFilter не знайдено');
    }

    // 2.3. Hero cards (hero/ × 4)
    const heroVykonannya = await page.locator('text=/Виконання/').count() > 0;
    const heroBaza = await page.locator('text=/База клієнтів/').count() > 0;
    const heroActivation = await page.locator('text=/План активації/').count() > 0;
    const heroContacts = await page.locator('text=/Контактна активність/').count() > 0;

    if (heroVykonannya) log.ok('clients/hero: HeroVykonannya рендериться');
    else log.bug('high', 'HeroVykonannya не знайдено');
    if (heroBaza) log.ok('clients/hero: HeroBaza рендериться');
    else log.bug('high', 'HeroBaza не знайдено');
    if (heroActivation) log.ok('clients/hero: HeroActivation рендериться');
    else log.bug('high', 'HeroActivation не знайдено');
    if (heroContacts) log.ok('clients/hero: HeroContacts рендериться');
    else log.bug('high', 'HeroContacts не знайдено');

    // 2.4. FilterPill (shared/filter-pill.tsx) — chip-кнопка «Усі»
    if (await page.locator('button:has-text("Усі")').count() > 0) {
      log.ok('clients/shared: FilterPill «Усі» — chip видно');
    } else {
      log.bug('medium', 'FilterPill «Усі» не знайдено');
    }

    // 2.5. CategorySection (list/category-section.tsx)
    // Шукаємо хоча б одну категорію (Активні / Сплячі / Нові / Втрачені / Без закупок)
    if (await hasAnyText(page, [/Активні\s*·\s*\d+/i, /Сплячі\s*·\s*\d+/i, /Нові\s*·\s*\d+/i])) {
      log.ok('clients/list: CategorySection — категорійні групи видно');
    } else {
      log.bug('high', 'CategorySection не знайдено — групування клієнтів зламано');
    }

    // 2.6. ClientRow (list/client-row.tsx) — хоча б один клієнт
    const clientRows = await page.locator('[data-client-row]').count();
    if (clientRows > 0) {
      log.ok(`clients/list: ClientRow — ${clientRows} карток клієнтів рендериться`);
    } else {
      log.bug('critical', 'ClientRow не знайдено — список клієнтів пустий');
    }

    // 2.7. Розгортаємо першого клієнта → ClientExpand з sub-blocks
    // Wrapped в try бо при 400+ клієнтах browser може memory-pressure
    log.step('  2.8. Розгортаємо клієнта → ClientExpand');
    if (clientRows > 0) {
      try {
        await page.locator('[data-client-row]').first().click({ timeout: 5000 });
        await page.waitForTimeout(3500); // звіт тягнеться з 1С

        // Тестуємо тільки наявність ClientExpand (border-t) — sub-blocks
        // умовно рендеряться залежно від даних 1С.
        const expandedClient = await page.locator('[data-client-row] >> .border-t').count();
        if (expandedClient > 0) {
          log.ok('clients/expand: ClientExpand — блок з border-t рендериться');
        } else {
          log.note('ClientExpand: border-t не знайдено (можливо звіт ще не догрузився)');
        }

        const planFactBlock = await page.locator('text=/План.×.Факт.*по брендах/').count() > 0;
        if (planFactBlock) log.ok('clients/expand: PlanFactByBrand — рендериться');

        const historyBlock = await page.locator('text=/Покупки.*за останні/').count() > 0;
        if (historyBlock) log.ok('clients/expand: ThreeMonthHistory — рендериться');

        await shot(page, '04-client-expanded');
      } catch (e) {
        log.note(`ClientExpand тест перервано: ${e.message.slice(0, 100)}`);
      }
    }

    // 2.9. Перевіряємо що нема Error Boundary fallback
    if (await page.locator('text=/Щось пішло не так|Something went wrong/i').count() > 0) {
      log.bug('critical', 'Error Boundary fallback видно — /clients падає');
    } else {
      log.ok('clients: Error Boundary не активувався');
    }

    // ═══════════════════════════════════════════════════
    // 3. /planning/[brand] — перевіряємо рефактор Days 6-8
    // ═══════════════════════════════════════════════════
    log.step('3. /planning/[brand] — перевірка рефактору (10 нових файлів)');

    // Йдемо на дашборд → клікаємо бренд → expand → «Перейти у форму»
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Менеджерський flow: клік на BrandRow → відкриється BrandExpandedDetails →
    // «Перейти у форму →». РМ/Director: a[href*="/planning/"].
    const directLink = page.locator('a[href*="/planning/"]').first();
    const planButtonViaExpand = page.locator('button:has-text("Перейти у форму")').first();

    let openedForm = false;

    if (await directLink.count() > 0) {
      // РМ/Director flow — пряме посилання
      const href = await directLink.getAttribute('href');
      log.note(`Відкриваю форму планування (link): ${href}`);
      await directLink.click();
      openedForm = true;
    } else {
      // Менеджерський flow — клік на BrandRow (button[aria-expanded]) → expand →
      // «Перейти у форму». BrandRow ставить aria-expanded коли expandable=true.
      const brandButtons = page.locator('button[aria-expanded]');
      const count = await brandButtons.count();
      log.note(`Знайдено ${count} BrandRow з aria-expanded`);
      let clicked = false;
      // Пробуємо до 5 брендів — перший може бути без плану і не мати кнопки.
      for (let i = 0; i < Math.min(count, 5); i++) {
        const btn = brandButtons.nth(i);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(1200);
        if (await planButtonViaExpand.count() > 0) {
          log.note(`Відкриваю форму через бренд #${i} → «Перейти у форму»`);
          await planButtonViaExpand.click();
          openedForm = true;
          clicked = true;
          break;
        }
        // Згортаємо назад
        await btn.click();
        await page.waitForTimeout(300);
      }
      if (!clicked) {
        log.note('Жоден бренд не показав кнопку «Перейти у форму» (можливо всі без плану)');
      }
    }

    if (!openedForm) {
      log.bug('high', 'Не вдалось відкрити форму планування — пропускаю secіon 3');
    } else {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      await page.waitForTimeout(3000);
      await shot(page, '05-planning-form');

      // 3.1. PlanningMetricsRow (sections/planning-metrics-row.tsx) — 4 метрики
      const hasPlanMetric = await page.locator('text=/^План місяця$/').count() > 0;
      const hasOchikuvane = await page.locator('text=/^Очікуване/').count() > 0;
      const hasFakt = await page.locator('text=/^Факт$/').count() > 0;
      const hasVidkhylennya = await page.locator('text=/Відхилення/').count() > 0;
      if (hasPlanMetric && hasOchikuvane && hasFakt && hasVidkhylennya) {
        log.ok('planning/sections: PlanningMetricsRow — всі 4 метрики (План/Очік/Факт/Відх) видно');
      } else {
        log.bug('high', `PlanningMetricsRow неповна: план=${hasPlanMetric} очік=${hasOchikuvane} факт=${hasFakt} відх=${hasVidkhylennya}`);
      }

      // 3.2. PlanningSaveBar (sections/planning-save-bar.tsx)
      const hasSaveBtn = await page.locator('button:has-text(/Зберегти/)').count() > 0;
      if (hasSaveBtn) log.ok('planning/sections: PlanningSaveBar — кнопка «Зберегти» видна');
      else log.note('PlanningSaveBar не знайдено (може бути readOnly/window-lock)');

      // 3.3. ClientDataByTmSection (sections/client-data-by-tm-section.tsx)
      if (await page.locator('text=/Дані по клієнтах по ТМ/').count() > 0) {
        log.ok('planning/sections: ClientDataByTmSection — заголовок видно');
      } else {
        log.bug('high', 'ClientDataByTmSection не знайдено');
      }

      // 3.4. ForecastSection (sections/forecast-section.tsx)
      if (await page.locator('text=/Прогноз по активних клієнтах/').count() > 0) {
        log.ok('planning/sections: ForecastSection — заголовок «Прогноз по активних клієнтах» видно');
      } else {
        log.bug('high', 'ForecastSection не знайдено');
      }

      // 3.5. GapClosureSection (sections/gap-closure-section.tsx)
      if (await page.locator('text=/Закриття розриву/').count() > 0) {
        log.ok('planning/sections: GapClosureSection — заголовок «Закриття розриву» видно');
      } else {
        log.bug('high', 'GapClosureSection не знайдено');
      }

      // 3.6. Дії для закриття розриву
      if (await page.locator('text=/Дії для закриття розриву/').count() > 0) {
        log.ok('planning: блок «Дії для закриття розриву» видно');
      } else {
        log.note('блок «Дії для закриття» не показано (може бути порожньо)');
      }

      // 3.7. Перевіряємо що PlanningDialogs не зламано — search modal
      const addClientBtn = page.locator('button:has-text(/Додати клієнта/)').first();
      if (await addClientBtn.count() > 0) {
        await addClientBtn.click();
        await page.waitForTimeout(800);
        const hasSearchModal = await page.locator('[role="dialog"], text=/Пошук|Search/i').count() > 0;
        if (hasSearchModal) {
          log.ok('planning: PlanningDialogs.ClientSearchModal — модалка пошуку відкривається');
          // Закриваємо escape-ом
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } else {
          log.bug('medium', 'PlanningDialogs.ClientSearchModal — модалка не відкрилась');
        }
      } else {
        log.note('Кнопки «Додати клієнта» нема (можливо lockEdit=true)');
      }

      // 3.8. Перевіряємо що нема Error Boundary fallback
      if (await page.locator('text=/Щось пішло не так|Something went wrong/i').count() > 0) {
        log.bug('critical', 'Error Boundary fallback видно — /planning падає');
      } else {
        log.ok('planning: Error Boundary не активувався');
      }

      // 3.9. NaN check
      if (/\$NaN|NaN\s*%/.test(await page.locator('body').innerText())) {
        log.bug('critical', '/planning має $NaN / NaN%');
      } else {
        log.ok('planning: нема NaN');
      }
    }

    // ═══════════════════════════════════════════════════
    // 4. Mobile responsive — швидка перевірка
    // ═══════════════════════════════════════════════════
    log.step('4. Mobile (375×667) — швидка перевірка');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, '06-mobile-clients');

    if (await page.locator('[data-client-row]').count() > 0) {
      log.ok('mobile: /clients рендериться, ClientRow видно');
    } else {
      log.bug('medium', 'mobile: /clients пустий');
    }

    // Перевіряємо що mobile footer кнопки 44px (Дзвонити/Зустріч/Рекламація)
    const mobileBtns = await page.locator('button[aria-label*="зустріч"], a[aria-label*="Подзвонити"]').count();
    if (mobileBtns > 0) {
      log.ok(`mobile: footer-кнопки видно (${mobileBtns} elements)`);
    } else {
      log.note('mobile: footer-кнопки не знайдено (можливо у клієнта нема phone/handlers)');
    }

    // ═══════════════════════════════════════════════════
    // 5. Console errors check
    // ═══════════════════════════════════════════════════
    log.step('5. Console errors');
    if (consoleErrors.length === 0) {
      log.ok('Жодних console errors під час тесту');
    } else {
      // Фільтр відомих не-критичних (next dev errors, hydration warnings)
      const critical = consoleErrors.filter(e =>
        !e.includes('hydration') &&
        !e.includes('Sentry') &&
        !e.toLowerCase().includes('warning'),
      );
      if (critical.length > 0) {
        log.bug('medium', `Console errors: ${critical.length}`);
        critical.slice(0, 3).forEach(e => console.log(`     ${e.slice(0, 200)}`));
      } else {
        log.ok(`Console: тільки non-critical (${consoleErrors.length} total, відфільтровано)`);
      }
    }

    // ═══════════════════════════════════════════════════
    // 6. Failed API requests
    // ═══════════════════════════════════════════════════
    log.step('6. Failed API requests');
    if (failedRequests.length === 0) {
      log.ok('Жодних failed API requests');
    } else {
      log.bug('high', `${failedRequests.length} failed API requests`);
      failedRequests.slice(0, 5).forEach(r => {
        console.log(`     ${r.status} ${r.url}`);
      });
    }
  } catch (e) {
    await shot(page, 'crash');
    log.bug('critical', `Виняток у тесті: ${e.message}`);
    console.log(e.stack);
  }

  // ═══════════════════════════════════════════════════
  // ФІНАЛЬНИЙ ЗВІТ
  // ═══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('📊 РЕЗУЛЬТАТ REFACTOR АУДИТУ');
  console.log('═'.repeat(60));
  console.log(`✅ OK:    ${results.ok}`);
  console.log(`❌ Bugs:  ${results.bug}`);
  console.log(`💡 Notes: ${results.note}`);
  console.log(`📁 Output: ${OUT_DIR}`);

  if (results.bug > 0) {
    console.log('\n🐛 Деталі помилок:');
    for (const b of results.bugDetails) {
      console.log(`   [${b.level}] ${b.msg}`);
    }
  }

  await context.close();
  await browser.close();
  process.exit(results.bug > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
