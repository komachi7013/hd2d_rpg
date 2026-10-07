import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const issues = [];
page.on('pageerror', (e) => issues.push(e.message));
await page.goto('http://127.0.0.1:5173');
await page.locator('[data-action=new]').waitFor();
// Keyboard-only settings: Tab reaches slider and checkbox, zero volume persists.
await page.keyboard.press('ArrowDown');
await page.keyboard.press('z');
await page.locator('#volume').waitFor();
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Tab');
  if (await page.evaluate(() => document.activeElement?.id === 'volume')) break;
}
await page.keyboard.press('Home');
assert.equal(await page.locator('#volume').inputValue(), '0');
await page.keyboard.press('Tab');
await page.keyboard.press('Space');
assert.equal(await page.locator('#mute').isChecked(), true);
await page.keyboard.press('Tab');
await page.keyboard.press('z');
await page.reload();
await page.locator('[data-action=new]').waitFor();
const settings = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('hoshiken.settings')),
);
assert.equal(settings.volume, 0);
assert.equal(settings.muted, true);
// A malformed save remains present until explicit overwrite approval.
await page.evaluate(() =>
  localStorage.setItem('hoshiken.prologue.v1', 'broken-save'),
);
await page.reload();
await page.locator('[data-action=new]').waitFor();
assert.ok((await page.locator('#ui').innerText()).includes('読み込めません'));
await page.keyboard.press('z');
await page.locator('[data-action=start]').waitFor();
assert.equal(
  await page.evaluate(() => localStorage.getItem('hoshiken.prologue.v1')),
  'broken-save',
);
await page.keyboard.press('z');
await page.locator('[data-action=new]').waitFor();
// Replay a legitimate saved state near the rescue encounter with low HP.
const seed = {
  version: 1,
  map: 'entrance',
  x: 0,
  z: -10,
  hp: 1,
  herbs: 3,
  lilia: false,
  sword: true,
  starSword: false,
  complete: false,
  flags: [],
  defeated: [],
};
await page.evaluate(
  (s) => localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(s)),
  seed,
);
await page.reload();
await page.locator('[data-action=new]').waitFor();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('z');
await page.keyboard.down('w');
await page.waitForTimeout(700);
await page.keyboard.up('w');
await page.locator('[data-action=attack]').waitFor();
await page.keyboard.press('z');
await page.keyboard.press('z');
await page.locator('[data-action=retry]').waitFor();
await page.screenshot({ path: 'docs/screenshots/07-defeat.png' });
await page.keyboard.press('z');
await page.locator('[data-action=attack]').waitFor();
assert.ok((await page.locator('.status').innerText()).includes('HP 1 / 100'));
await page.keyboard.press('ArrowUp');
await page.keyboard.press('z');
assert.ok((await page.locator('.commands').innerText()).includes('薬草 ×3'));
// Failure remains recoverable after narrow desktop resize.
await page.setViewportSize({ width: 960, height: 640 });
await page.screenshot({ path: 'docs/screenshots/08-resize.png' });
assert.deepEqual(issues, []);
const result = {
  keyboardSettings: true,
  zeroVolumePersistence: true,
  corruptSavePreserved: true,
  overwriteConfirmation: true,
  retryRestoresHPAndHerbs: true,
  resize: [960, 640],
  errors: issues,
};
await writeFile('docs/edge-test-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
