import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://127.0.0.1:5173');
await p.locator('[data-action=new]').waitFor();
await p.evaluate(() =>
  localStorage.setItem(
    'hoshiken.prologue.v1',
    JSON.stringify({
      version: 1,
      map: 'temple',
      x: 0,
      z: -19,
      hp: 100,
      herbs: 3,
      lilia: true,
      sword: true,
      starSword: false,
      complete: false,
      flags: ['heardCry'],
      defeated: ['rescue', 'wolf1', 'moth1', 'guardian'],
    }),
  ),
);
await p.reload();
await p.locator('[data-action=continue]').waitFor();
await p.keyboard.press('ArrowDown');
await p.keyboard.press('z');
await p.keyboard.down('w');
await p.waitForTimeout(1200);
await p.keyboard.up('w');
for (let i = 0; i < 3; i++) await p.keyboard.press('z');
await p.locator('[data-action=attack]').waitFor();
await p.screenshot({ path: 'docs/screenshots/09-boss-final.png' });
await p.waitForTimeout(1100);
const before = await p.locator('.battle-label').innerText();
await p.keyboard.down('w');
await p.waitForTimeout(600);
await p.keyboard.up('w');
assert.equal(await p.locator('.battle-label').innerText(), before);
assert.ok((await p.locator('.status').innerText()).includes('HP 100 / 100'));
assert.deepEqual(errors, []);
console.log(
  JSON.stringify({
    battleCameraCaptured: true,
    waitingDoesNotAdvanceTurn: true,
    errors,
  }),
);
await b.close();
