import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.GAME_URL || 'http://127.0.0.1:5174';
await mkdir('docs/screenshots/chapter-01', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const seed = {
  version: 1,
  map: 'temple',
  x: 0,
  z: -20,
  hp: 100,
  herbs: 3,
  lilia: true,
  sword: true,
  starSword: true,
  complete: true,
  flags: [],
  defeated: ['rescue', 'boss'],
};
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('hoshiken.prologue.v1')));
const shot = (name) =>
  page.screenshot({ path: `docs/screenshots/chapter-01/${name}.png` });
const press = (key = 'z') => page.keyboard.press(key);
const move = async (key, ms = 700) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
async function dialogue() {
  for (let n = 0; n < 30 && (await page.locator('.dialogue').count()); n++) {
    await press();
    await page.waitForTimeout(60);
  }
}
await page.goto(base);
await page.locator('[data-action=new]').waitFor();
await page.evaluate(
  (s) => localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(s)),
  seed,
);
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.chapter-title').waitFor();
assert.equal((await saved()).chapter.titleShown, false);
await move('w', 700);
await shot('01-title');
assert.equal((await saved()).z, 19);
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.chapter-title').waitFor();
await page.waitForTimeout(600);
await press();
await page.locator('.dialogue').waitFor();
await dialogue();
assert.equal((await saved()).chapter.titleShown, true);
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.help').waitFor();
assert.equal(await page.locator('.chapter-title').count(), 0);
await shot('02-village');
let previousMap = '';
let encounters = new Set(),
  checkedMenus = false,
  prayed = false,
  healed = false,
  sawWarning = false;
const started = Date.now();
while (Date.now() - started < 240000) {
  if (errors.length) {
    await shot('failure');
    throw new Error(errors.join('\n'));
  }
  if (await page.locator('.dialogue').count()) {
    const text = await page.locator('.dialogue').innerText();
    if (text.includes('祈り') && text.includes('覚えた'))
      await shot('04-prayer');
    if (text.includes('本来の姿を取り戻した')) await shot('07-spirit-rescued');
    await press();
    await page.waitForTimeout(70);
    continue;
  }
  assert.equal(
    await page.locator('[data-action=retry]').count(),
    0,
    'Unexpected defeat',
  );
  if (await page.locator('.battle-ui').count()) {
    const label = await page.locator('.battle-label').innerText();
    encounters.add(label.split('\n')[0]);
    if (await page.locator('[data-action=attack]:disabled').count()) {
      const text = await page.locator('.battle-log').innerText();
      if (text.includes('予兆：')) {
        sawWarning = true;
        await shot('06-warning');
      }
      await press();
      await page.waitForTimeout(80);
      continue;
    }
    const log = await page.locator('.battle-log').innerText();
    const lilia = log.startsWith('TURN') && log.includes('リリアの行動');
    const hp = [
      ...(await page.locator('.status').innerText()).matchAll(/HP (\d+) /g),
    ].map((m) => +m[1]);
    if (!checkedMenus && !lilia) {
      await page.locator('[data-action=skills]').click();
      assert.ok(await page.locator('[data-action="skill:star-slash"]').count());
      await press('Escape');
      assert.equal(await page.locator('.battle-label').innerText(), label);
      checkedMenus = true;
    }
    if (lilia) {
      assert.equal(
        await page.locator('[data-action=skills]').innerText(),
        '魔法',
      );
      if (label.includes('霧憑きの鐘守')) await shot('05-lilia-commands');
      const forget = log.includes('ユウ：忘却');
      const target = hp[0] <= 75 ? 'hero' : hp[1] <= 75 ? 'lilia' : null;
      if (forget || target) {
        await page.locator('[data-action=skills]').click();
        const skill = forget ? 'prayer' : 'recovery';
        await page.locator(`[data-action="skill:${skill}"]`).click();
        assert.equal(
          await page.locator('.commands').getAttribute('data-menu'),
          'targets',
        );
        await press('Escape');
        assert.equal(
          await page.locator('.commands').getAttribute('data-menu'),
          'skills',
        );
        await page.locator(`[data-action="skill:${skill}"]`).click();
        await page
          .locator(`[data-action="target:${forget ? 'hero' : target}"]`)
          .click();
        if (forget) prayed = true;
        else healed = true;
      } else
        await page
          .locator(
            `[data-action=${log.includes('予兆：') ? 'guard' : 'attack'}]`,
          )
          .click();
    } else {
      if (!log.includes('ユウ：忘却')) {
        await page.locator('[data-action=skills]').click();
        const slash = page.locator('[data-action="skill:star-slash"]');
        if (await slash.isDisabled()) {
          await page.keyboard.press('Escape');
          await page.locator('[data-action=attack]').click();
        } else await slash.click();
      } else await page.locator('[data-action=attack]').click();
    }
    await page.waitForTimeout(100);
    continue;
  }
  const progress = await saved();
  if (previousMap !== progress.map) {
    previousMap = progress.map;
    console.log('Map:', progress.map, progress.chapter.stage);
  }
  if (progress.chapter.stage === 'complete') break;
  const prompt = (await page.locator('.prompt').count())
    ? await page.locator('.prompt').innerText()
    : '';
  if (
    progress.map === 'village' &&
    !progress.flags.includes('ch01:keeper') &&
    prompt.includes('鐘守')
  ) {
    await press();
    continue;
  }
  if (progress.map === 'village' && progress.flags.includes('ch01:restored')) {
    if (!progress.flags.includes('ch01:emblem')) {
      if (prompt.includes('長老')) {
        await press();
        continue;
      }
      if (!globalThis.shiftedElder) {
        await move('a', 960);
        globalThis.shiftedElder = true;
      }
      await move('w');
    } else await move('s');
  } else await move('w');
}
const final = await saved();
if (final.chapter.stage !== 'complete') {
  console.log('Incomplete:', final, await page.locator('#ui').innerText());
  await shot('failure');
}
assert.equal(final.chapter.stage, 'complete');
assert.equal(final.map, 'road');
assert.equal(final.chapter.number, 2);
assert.ok(final.flags.includes('skill:prayer'));
assert.ok(prayed && healed && sawWarning && checkedMenus);
assert.equal(final.flags.filter((f) => f === 'ch01:title').length, 1);
await shot('08-departure');
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.help').waitFor();
assert.equal(await page.locator('.chapter-title').count(), 0);
assert.equal(await page.locator('.dialogue').count(), 0);
await move('s', 4500);
await page.locator('.area').filter({ hasText: 'アルネ村' }).waitFor();
assert.equal(await page.locator('.chapter-title').count(), 0);
assert.equal(await page.locator('.dialogue').count(), 0);
await page.setViewportSize({ width: 800, height: 600 });
await shot('09-resize');
assert.deepEqual(errors, []);
const result = {
  completed: true,
  encounters: [...encounters],
  prayed,
  healed,
  sawWarning,
  checkedMenus,
  final,
  errors,
  elapsedSeconds: (Date.now() - started) / 1000,
};
await writeFile('docs/chapter-01-checks.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
