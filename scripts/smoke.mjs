import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
await page.locator('[data-action=new]').waitFor({ timeout: 30000 });
await page.screenshot({ path: 'docs/screenshots/01-title.png' });
await page.keyboard.press('Enter');
for (let i = 0; i < 4; i++) await page.keyboard.press('z');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'docs/screenshots/02-forest.png' });
console.log(
  JSON.stringify({ errors, text: await page.locator('#ui').innerText() }),
);
await browser.close();
