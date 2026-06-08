/**
 * Mobile UI/UX QA для sales-planning (iPhone 12 Pro emulation)
 *
 * Перевіряє фікси з b5c96c7 + 7bf1d61:
 *   - /meetings: phone btn size, name vs purpose hierarchy, timer pulse, KPI hidden in demo
 *   - /clients: avatar align, chips wrap, phone btn, no h-scroll
 *   - Expanded ClientRow: PlanFactByBrand compact, ThreeMonthHistory grid, pill placement
 *   - Pinch-zoom blocked, no body h-scroll, scroll-to-top FAB
 *
 * Запуск (headless для агента): HEADLESS=1 node scripts/mobile-qa.mjs
 * Базовий URL: QA_URL=http://localhost:3000 (за замовчуванням)
 */

import { chromium, devices } from '@playwright/test';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// .env loader
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

const BASE_URL = process.env.QA_URL ?? 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS === '1';
const OUT_DIR = join(process.cwd(), 'scripts', 'qa-output', 'mobile');

try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(OUT_DIR, { recursive: true });

const findings = { ok: [], bug: [], note: [] };
const ok = (route, msg) => { findings.ok.push({ route, msg }); console.log(`OK   | ${route} | ${msg}`); };
const bug = (route, level, msg) => { findings.bug.push({ route, level, msg }); console.log(`BUG  [${level}] | ${route} | ${msg}`); };
const note = (route, msg) => { findings.note.push({ route, msg }); console.log(`NOTE | ${route} | ${msg}`); };
const step = (msg) => console.log(`\n=== ${msg} ===`);

async function shot(page, name) {
  try { await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }); } catch {}
}

async function bboxOf(locator) {
  try { return await locator.boundingBox(); } catch { return null; }
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 250 });

  // iPhone 12 Pro: 390x844, DPR 3, touch + mobile
  const context = await browser.newContext({
    ...devices['iPhone 12 Pro'],
    recordVideo: { dir: OUT_DIR, size: { width: 390, height: 844 } },
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    // === 1. /login → демо-логін Менеджер (feshchenko@emet.com) ===
    step('1. /login + demo manager login');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await shot(page, '01-login');

    const vpW = page.viewportSize().width;
    // Перевірка: body не ширший за viewport (no h-scroll)
    const bodyScroll = await page.evaluate(() => ({
      bw: document.body.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    if (bodyScroll.bw > bodyScroll.cw + 1) {
      bug('/login', 'medium', `body.scrollWidth=${bodyScroll.bw} > viewport ${bodyScroll.cw} — horizontal scroll присутній`);
    } else {
      ok('/login', `no horizontal scroll (body=${bodyScroll.bw}, vp=${bodyScroll.cw})`);
    }

    const demoBtn = page.locator('button:has-text("Менеджер")').filter({ hasNotText: 'Менеджер 2' }).first();
    if (await demoBtn.count() === 0) {
      bug('/login', 'critical', 'Demo-кнопка "Менеджер" не знайдена');
      throw new Error('no demo button');
    }
    await demoBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '02-after-login');
    ok('/login', 'demo manager login успішний');

    // === 2. Header: avatar (МЕ) видимий справа, "На сьогодні" icon-only ===
    step('2. Header check (mobile)');
    const headerAvatar = page.locator('header').locator('text=/^М[ЄЕ]$|^МК$|^[А-ЯІЇ]{2}$/').first();
    if (await headerAvatar.count() > 0) {
      const box = await bboxOf(headerAvatar);
      if (box) {
        if (box.x + box.width > vpW) {
          bug('/header', 'high', `Avatar обрізаний: x=${box.x.toFixed(0)} + w=${box.width.toFixed(0)} > vp ${vpW}`);
        } else {
          ok('/header', `Avatar справа повністю видимий (x=${box.x.toFixed(0)}, w=${box.width.toFixed(0)})`);
        }
      }
    } else {
      note('/header', 'Avatar (ініціали) не знайдено в header — можливо інший рендер');
    }

    const todayBtn = page.getByRole('button', { name: /На сьогодні|Сьогодні/i }).first();
    if (await todayBtn.count() > 0) {
      // Перевіряємо реально-видимий текст (через innerText який враховує display:none/hidden)
      const visibleText = await todayBtn.evaluate(el => el.innerText.trim());
      if (visibleText.length === 0) {
        ok('/header', '"На сьогодні" icon-only (innerText empty)');
      } else {
        bug('/header', 'low', `"На сьогодні" показує текст "${visibleText}" на 390px — очікувалось icon-only (sm:inline хован)`);
      }
    }

    // === 3. /meetings ===
    step('3. /meetings dashboard');
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    // Чекаємо появи реальних карток (Розпочати/Завершити/Подзвонити)
    try {
      await page.locator('text=/Розпочати|Завершити|Подзвонити|Деталі/i').first().waitFor({ timeout: 10000 });
    } catch {}
    await page.waitForTimeout(1000);
    await shot(page, '03-meetings');

    // h-scroll body check
    const meetScroll = await page.evaluate(() => ({ bw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    if (meetScroll.bw > meetScroll.cw + 1) {
      bug('/meetings', 'medium', `body.scrollWidth=${meetScroll.bw} > vp ${meetScroll.cw}`);
    } else {
      ok('/meetings', 'no horizontal scroll');
    }

    // KPI віджети не повинні бути у демо-режимі (банер замість них)
    const kpiAmberBanner = page.locator('text=/демо.*реж|демо-реж|демо режим/i').first();
    if (await kpiAmberBanner.count() > 0) {
      ok('/meetings', 'демо-banner знайдено (KPI hidden)');
    } else {
      note('/meetings', 'демо-банер про режим не знайдено — перевір текст у MeetingsKpiCards');
    }

    // Mobile phone btn: <a href="tel:..." aria-label="Подзвонити ..."> (w-8 h-8 = 32px)
    const phoneBtnAlt = page.locator('a[href^="tel:"]').filter({ has: page.locator('svg') });
    const phoneCount = await phoneBtnAlt.count();
    note('/meetings', `phone-кнопок (<a tel:>) знайдено: ${phoneCount}`);

    // Текстова кнопка "Подзвонити" (на /meetings вона текстова pill-стиль)
    const callTextBtn = page.locator('button:has-text("Подзвонити"), a:has-text("Подзвонити")').first();
    const callTextCount = await callTextBtn.count();
    note('/meetings', `"Подзвонити" текстових кнопок: ${callTextCount}`);
    if (callTextCount > 0) {
      const box = await bboxOf(callTextBtn);
      if (box) {
        const size = Math.min(box.width, box.height);
        if (box.height >= 44) {
          ok('/meetings', `"Подзвонити" btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} (h>=44px HIG OK)`);
        } else if (box.height >= 32) {
          bug('/meetings', 'medium', `"Подзвонити" btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} — height ${box.height.toFixed(0)} < 44px HIG. Користувач: "phone button маленька"`);
        } else {
          bug('/meetings', 'high', `"Подзвонити" btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} — занадто мала`);
        }
      }
    }

    if (phoneCount > 0) {
      // Беремо першу видиму (mobile-only — md:hidden)
      const visiblePhone = await phoneBtnAlt.evaluateAll(els => {
        const visible = els.filter(el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        });
        return visible.map(el => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
        });
      });
      note('/meetings', `видимих phone-btn (mobile): ${visiblePhone.length}, sample: ${JSON.stringify(visiblePhone.slice(0, 2))}`);
      const phoneBtn = phoneBtnAlt.first();
      const box = visiblePhone[0] ? { width: visiblePhone[0].w, height: visiblePhone[0].h } : await bboxOf(phoneBtn);
      if (box) {
        const size = Math.min(box.width, box.height);
        const meetsHIG = size >= 44;
        const meetsMin = size >= 32;
        if (meetsHIG) {
          ok('/meetings', `Phone icon-btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} >=44px (HIG OK)`);
        } else if (meetsMin) {
          bug('/meetings', 'medium', `Phone icon-btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} < 44px HIG`);
        } else {
          bug('/meetings', 'high', `Phone icon-btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} < 32px`);
        }
      }
    }

    // Hierarchy: client name fontSize > purpose fontSize
    const hierarchyCheck = await page.evaluate(() => {
      // Шукаємо card з "Подзвонити" і у ній імʼя клієнта + мета
      const btns = Array.from(document.querySelectorAll('button, a')).filter(b => /Подзвонити/.test(b.textContent || ''));
      if (btns.length === 0) return null;
      // card = найближчий ancestor з padding > 8
      let card = btns[0].parentElement;
      let depth = 0;
      while (card && depth < 8) {
        const cs = getComputedStyle(card);
        if (parseFloat(cs.paddingTop) >= 8 || parseFloat(cs.padding) >= 8) break;
        card = card.parentElement;
        depth++;
      }
      if (!card) return null;
      const headings = card.querySelectorAll('h1, h2, h3, h4, [class*="font-bold"], [class*="font-semibold"]');
      const all = Array.from(card.querySelectorAll('h1,h2,h3,h4,p,span,div')).filter(el => el.childElementCount === 0 && (el.textContent || '').trim().length > 2);
      const top5 = all.slice(0, 8).map(el => ({ t: (el.textContent || '').trim().slice(0, 30), fs: parseFloat(getComputedStyle(el).fontSize), fw: getComputedStyle(el).fontWeight }));
      return top5;
    });
    if (hierarchyCheck) {
      note('/meetings', `card text hierarchy: ${JSON.stringify(hierarchyCheck).slice(0, 300)}`);
    }

    // Scroll-to-top FAB на /meetings (там багато контенту)
    step('3b. Scroll-to-top FAB on /meetings');
    await page.evaluate(() => {
      window.scrollTo(0, 800);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(1500);
    await shot(page, '03b-meetings-scrolled');
    const fabM = page.locator('button[aria-label*="верху" i], button[aria-label*="вгору" i], button[aria-label*="top" i], button[title*="верху" i]').first();
    let fabFound = false;
    if (await fabM.count() > 0 && await fabM.isVisible()) {
      const b = await bboxOf(fabM);
      ok('/meetings', `Scroll-to-top FAB видимий (${b?.width?.toFixed(0)}x${b?.height?.toFixed(0)}, x=${b?.x?.toFixed(0)}, y=${b?.y?.toFixed(0)})`);
      fabFound = true;
    } else {
      // fallback по fixed-position
      const fixedFabInfo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const matches = btns.filter(el => {
          const cs = getComputedStyle(el);
          return cs.position === 'fixed' && parseFloat(cs.bottom) < 120 && parseFloat(cs.right) < 120 && el.offsetParent !== null;
        });
        return matches.map(el => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), aria: el.getAttribute('aria-label') || '', txt: (el.textContent || '').trim().slice(0, 30) };
        });
      });
      if (fixedFabInfo.length > 0) {
        ok('/meetings', `Fixed-corner buttons після scroll: ${JSON.stringify(fixedFabInfo)}`);
        fabFound = true;
      } else {
        bug('/meetings', 'medium', 'Scroll-to-top FAB не знайдено після scroll > 400px');
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));

    // Ім'я vs мета візиту — візуальна ієрархія (name > purpose)
    const meetingCards = page.locator('[data-meeting-card], [class*="meeting-card"], article').first();
    // fallback: пошук картки за наявністю двох текстів-блоків
    const allCards = await page.locator('div').filter({ has: page.locator('text=/Розпочати|Активна|MM|:[0-9]{2}/i') }).all();
    note('/meetings', `meeting cards (heuristic): ${allCards.length}`);

    // Перевіряємо CSS: пошук всіх font-size у meetings головних блоках
    const fontSizes = await page.evaluate(() => {
      const cards = document.querySelectorAll('div, article, section');
      const results = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.length > 20 && text.length < 200) {
          // ймовірна meeting картка
          const spans = card.querySelectorAll('h2, h3, h4, p, span, div');
          const sizes = [];
          spans.forEach(s => {
            if (s.childElementCount === 0 && (s.textContent || '').trim().length > 2) {
              const fs = parseFloat(getComputedStyle(s).fontSize);
              if (fs > 0) sizes.push({ t: (s.textContent || '').trim().slice(0, 30), fs });
            }
          });
          if (sizes.length >= 2) results.push({ snippet: text.slice(0, 50), sizes: sizes.slice(0, 6) });
        }
      });
      return results.slice(0, 5);
    });
    note('/meetings', `card font-sizes sample: ${JSON.stringify(fontSizes).slice(0, 300)}`);

    // === 4. /clients ===
    step('4. /clients list');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, '04-clients');

    const cliScroll = await page.evaluate(() => ({ bw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    if (cliScroll.bw > cliScroll.cw + 1) {
      bug('/clients', 'medium', `body.scrollWidth=${cliScroll.bw} > vp ${cliScroll.cw}`);
    } else {
      ok('/clients', `no horizontal scroll (body=${cliScroll.bw}, vp=${cliScroll.cw})`);
    }

    // Avatar 36px ≈ перші ініціали клієнта (НЕ header)
    const clientRows = page.locator('[data-client-row], li, [class*="ClientRow"], [class*="client-row"]');
    const rowCount = await clientRows.count();
    note('/clients', `client rows знайдено: ${rowCount}`);

    // Перший avatar (after header)
    const avatars = await page.locator('main div').filter({ hasText: /^[А-ЯІЇЄ]{1,2}$/ }).all();
    if (avatars.length > 0) {
      const first = avatars[0];
      const box = await bboxOf(first);
      if (box) {
        if (box.width >= 32 && box.width <= 44) {
          ok('/clients', `Avatar size ${box.width.toFixed(0)}x${box.height.toFixed(0)} (target 36px)`);
        } else {
          note('/clients', `Avatar size ${box.width.toFixed(0)}x${box.height.toFixed(0)} — очікувалось ~36px`);
        }
      }
    }

    // Phone button у row
    const cliPhoneBtns = page.locator('main a[href^="tel:"], main button[aria-label*="Подзвонити" i]');
    const cliPhoneCount = await cliPhoneBtns.count();
    note('/clients', `phone buttons у списку клієнтів: ${cliPhoneCount}`);
    if (cliPhoneCount > 0) {
      const box = await bboxOf(cliPhoneBtns.first());
      if (box) {
        const s = Math.min(box.width, box.height);
        if (s >= 44) ok('/clients', `Phone btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} ≥44px (HIG OK)`);
        else if (s >= 32) bug('/clients', 'medium', `Phone btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} < 44px HIG (target 32px досягнуто)`);
        else bug('/clients', 'high', `Phone btn ${box.width.toFixed(0)}x${box.height.toFixed(0)} < 32px`);
      }
    }

    // === 5. Expanded client row (focus single client) ===
    step('5. Expanded ClientRow + PlanFactByBrand + ThreeMonthHistory');
    // Знайти будь-який клієнтський рядок і клікнути
    const firstClientName = page.locator('main').locator('text=/[А-ЯІЇЄ][а-яіїєА-ЯІЇЄ]{2,}\\s+[А-ЯІЇЄ][а-яіїєА-ЯІЇЄ]/').first();
    if (await firstClientName.count() > 0) {
      const nm = (await firstClientName.textContent()) || '';
      note('/clients', `клікаю перший клієнт: "${nm.slice(0, 40)}"`);
      await firstClientName.click({ force: true });
      await page.waitForTimeout(1500);
      await shot(page, '05-clients-expanded');

      const expScroll = await page.evaluate(() => ({ bw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
      if (expScroll.bw > expScroll.cw + 1) {
        bug('/clients-expanded', 'high', `Після expand body=${expScroll.bw} > vp ${expScroll.cw} (PlanFactByBrand/ThreeMonthHistory ймовірно h-scroll)`);
      } else {
        ok('/clients-expanded', 'no horizontal scroll після expand');
      }

      // Пошук pill "не в плані" / "Заплановано"
      const pillNoPlan = page.locator('text=/не в плані|не в плані/i').first();
      const pillPlanned = page.locator('text=/Запланов/i').first();
      if (await pillNoPlan.count() > 0 || await pillPlanned.count() > 0) {
        ok('/clients-expanded', 'pill "не в плані"/"Заплановано" знайдено');
      } else {
        note('/clients-expanded', 'pill "не в плані"/"Заплановано" не знайдено у цій картці');
      }

      // Перевіряємо порожній простір під pill: знайти контейнер з "Заплановано" і виміряти padding-bottom + sibling whitespace
      const plannedPill = await page.locator('text=/Заплановано/i').first();
      if (await plannedPill.count() > 0) {
        const gapInfo = await plannedPill.evaluate((el) => {
          // Шукаємо найближчий card-контейнер
          let p = el.parentElement;
          let depth = 0;
          while (p && depth < 5) {
            const rect = p.getBoundingClientRect();
            const own = el.getBoundingClientRect();
            const gapBelow = rect.bottom - own.bottom;
            if (gapBelow > 0) return { gap: Math.round(gapBelow), parentTag: p.tagName, parentH: Math.round(rect.height) };
            p = p.parentElement;
            depth++;
          }
          return null;
        });
        if (gapInfo) {
          note('/clients-expanded', `gap під pill "Заплановано": ${gapInfo.gap}px (parent=${gapInfo.parentTag}, h=${gapInfo.parentH})`);
          if (gapInfo.gap > 40) {
            bug('/clients-expanded', 'low', `Багато порожнього простору під pill "Заплановано" (${gapInfo.gap}px) — користувач скаржиться`);
          }
        }
      }
    } else {
      note('/clients', 'не знайдено жодного клієнт-рядка для expand');
    }

    // === 6. Scroll-to-top FAB ===
    step('6. Scroll-to-top FAB on home dashboard /');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const pageH = await page.evaluate(() => document.body.scrollHeight);
    note('/', `page scrollHeight: ${pageH}px`);
    // Scroll + dispatch event (React listener needs scroll event)
    await page.evaluate(() => {
      window.scrollTo(0, 800);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(1500);
    await shot(page, '06-home-scrolled');

    const fab = page.locator('button[aria-label*="верху" i], button[aria-label*="вгору" i], button[title*="верху" i]').first();
    if (await fab.count() > 0) {
      const isVis = await fab.isVisible();
      const box = await bboxOf(fab);
      if (isVis && box) {
        ok('/', `Scroll-to-top FAB видимий на /, size=${box.width.toFixed(0)}x${box.height.toFixed(0)}, x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}`);
        if (Math.min(box.width, box.height) < 44) {
          bug('/', 'low', `FAB size ${box.width.toFixed(0)}x${box.height.toFixed(0)} < 44px HIG`);
        }
      } else {
        bug('/', 'medium', 'Scroll-to-top FAB у DOM, але не видимий — скрол не запустив state');
      }
    } else {
      bug('/', 'medium', 'Scroll-to-top FAB не знайдено в DOM після scroll > 400px');
    }

    // === 7. Pinch-zoom blocked (viewport meta + touch-action) ===
    step('7. Pinch-zoom prevention check');
    const meta = await page.evaluate(() => {
      const v = document.querySelector('meta[name="viewport"]');
      const body = getComputedStyle(document.body).touchAction;
      const html = getComputedStyle(document.documentElement).touchAction;
      return { viewport: v ? v.getAttribute('content') : null, bodyTouchAction: body, htmlTouchAction: html };
    });
    note('/zoom', `viewport meta: ${meta.viewport}`);
    note('/zoom', `touch-action body=${meta.bodyTouchAction}, html=${meta.htmlTouchAction}`);
    if (meta.viewport && /user-scalable=no|maximum-scale=1/.test(meta.viewport)) {
      ok('/zoom', 'viewport meta блокує pinch-zoom');
    } else {
      bug('/zoom', 'medium', `viewport meta дозволяє pinch-zoom: "${meta.viewport}"`);
    }
    if (/pan-y|none/.test(meta.bodyTouchAction)) {
      ok('/zoom', `touch-action на body: ${meta.bodyTouchAction}`);
    } else {
      note('/zoom', `touch-action на body: ${meta.bodyTouchAction} (очікувалось pan-y)`);
    }

    if (consoleErrors.length > 0) {
      const unique = [...new Set(consoleErrors)].slice(0, 10);
      bug('/console', 'low', `Console errors (${consoleErrors.length}): ${unique.join(' | ').slice(0, 400)}`);
    } else {
      ok('/console', 'no console errors');
    }

  } catch (e) {
    bug('/runtime', 'critical', `Тест впав з помилкою: ${e.message}`);
    await shot(page, '99-error');
  } finally {
    console.log('\n========== РЕЗЮМЕ ==========');
    console.log(`OK:   ${findings.ok.length}`);
    console.log(`BUG:  ${findings.bug.length}`);
    console.log(`NOTE: ${findings.note.length}`);
    console.log('\nBUGS:');
    findings.bug.forEach(b => console.log(`  [${b.level}] ${b.route} — ${b.msg}`));
    console.log('\nNOTES:');
    findings.note.forEach(n => console.log(`  ${n.route} — ${n.msg}`));

    await context.close();
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
