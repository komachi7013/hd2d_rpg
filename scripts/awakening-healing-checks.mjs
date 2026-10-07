import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const seed = {
  version: 1,
  map: 'temple',
  x: 0,
  z: -19,
  hp: 30,
  herbs: 3,
  lilia: true,
  sword: true,
  starSword: false,
  complete: false,
  flags: ['heardCry'],
  defeated: ['rescue', 'guardian'],
};
async function boss() {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(
    (state) =>
      localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(state)),
    seed,
  );
  await page.reload();
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .find((entry) => entry.name.includes('/src/render/world.ts')).name;
    const { World } = await import(url);
    const render = World.prototype.render;
    World.prototype.render = function (...args) {
      render.apply(this, args);
      window.__glow = {
        intensity: this.pendantLight.intensity,
        color: this.pendantLight.color.getHex(),
        range: this.pendantLight.distance,
        fx: this.fx.visible,
      };
    };
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await page.keyboard.down('w');
  await page.locator('.dialogue').waitFor({ timeout: 15000 });
  await page.keyboard.up('w');
  for (let i = 0; i < 3; i++) await page.keyboard.press('z');
  await page.locator('[data-action=attack]').waitFor();
}
async function guard(expectedHP, heals) {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  assert.ok(
    (await page.locator('.status').innerText()).includes(
      `HP ${expectedHP} / 100`,
    ),
  );
  const text = await page.locator('.battle-log').innerText();
  assert.equal(text.includes('HP が 30 回復'), heals);
  if (!heals) assert.ok(text.includes('休んでいる'));
  await page.keyboard.press('z');
}
await boss();
await guard(48, true);
await guard(36, false);
await guard(54, true);
for (let i = 0; i < 3; i++) await page.keyboard.press('z');
await page.locator('#awakening-overlay[data-phase=pendant]').waitFor();
assert.equal(await page.locator('.surprise-mark').isVisible(), true);
assert.equal(
  await page
    .locator('.surprise-mark')
    .evaluate((el) => getComputedStyle(el).color),
  'rgb(255, 53, 53)',
);
assert.equal(await page.evaluate(() => window.__glow.color), 0x66ff77);
assert.equal(await page.evaluate(() => window.__glow.range), 3);
await page.screenshot({ path: 'docs/screenshots/pendant-green-surprise.png' });
await page.locator('#awakening-overlay[data-phase=awakening]').waitFor();
assert.equal(await page.locator('.surprise-mark').isVisible(), false);
await page.screenshot({ path: 'docs/screenshots/awakening-timed-light.png' });
// Deliberately stay on the pendant dialogue page: both glow layers must expire anyway.
await page.waitForFunction(
  () => document.querySelector('#awakening-overlay').dataset.phase === '',
);
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.__glow.intensity), 0);
assert.equal(await page.evaluate(() => window.__glow.fx), false);
assert.equal(
  await page
    .locator('.awakening-flash')
    .evaluate((el) => getComputedStyle(el).opacity),
  '0',
);
await page.screenshot({ path: 'docs/screenshots/awakening-light-expired.png' });
for (let i = 0; i < 3; i++) await page.keyboard.press('z');
await page.locator('[data-action=skills]').waitFor();
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.__glow.intensity), 0);
assert.equal(await page.evaluate(() => window.__glow.fx), false);
await guard(42, false);
await guard(60, true);
await boss();
await guard(48, true); // a new battle resets the recovery rest turn
assert.deepEqual(errors, []);
const result = {
  greenPendantAndRedSurprise: true,
  twoTimed1500msPhases: true,
  expiresWithoutAdvancingDialogue: true,
  noGlowRestartAtCommandMenu: true,
  healTurns: [1, 3, 5],
  restTurns: [2, 4],
  newBattleResetsRest: true,
  errors,
};
await writeFile(
  'docs/awakening-healing-checks.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
await browser.close();
