import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.AudioContext = class {
    constructor() {
      throw new Error('Audio unavailable in this browser');
    }
  };
});
await p.goto('http://127.0.0.1:5173');
await p.locator('[data-action=new]').waitFor();
await p.keyboard.press('z');
for (let i = 0; i < 4; i++) await p.keyboard.press('z');
assert.ok(await p.locator('.status').count());
assert.equal(await p.locator('.dialogue').count(), 0);
assert.deepEqual(errors, []);
console.log(JSON.stringify({ gameWorksWithoutAudio: true, errors }));
await b.close();
