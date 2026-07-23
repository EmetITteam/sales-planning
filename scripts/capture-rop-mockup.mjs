// Скріншот макета Звіту РОП (docs/mockups/rop-report.html) → docs/mockups/*.png
// Разовий: node scripts/capture-rop-mockup.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const file = pathToFileURL(resolve('docs/mockups/rop-report.html')).href;
const browser = await chromium.launch();
try {
  for (const [name, width] of [['desktop', 1280], ['tablet', 820]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(file, { waitUntil: 'networkidle' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: `docs/mockups/rop-report-${name}.png`, fullPage: true });
    await page.close();
    console.log(`✅ docs/mockups/rop-report-${name}.png (${width}px)`);
  }
} finally {
  await browser.close();
}
