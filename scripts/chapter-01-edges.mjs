import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const url = process.env.GAME_URL || 'http://127.0.0.1:5174';
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = {
  version: 1,
  map: 'sanctum',
  x: 0,
  z: -5,
  hp: 100,
  herbs: 3,
  lilia: true,
  sword: true,
  starSword: true,
  complete: true,
  flags: [
    'skill:star-slash',
    'skill:recovery',
    'skill:prayer',
    'ch01:title',
    'ch01:keeper',
    'ch01:belfry',
    'ch01:ward',
    'ch01:prayer',
  ],
  defeated: ['rescue', 'boss', 'mist1', 'mist2'],
  chapter: { number: 1, stage: 'boss', titleShown: true, liliaHP: 100 },
};
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('hoshiken.prologue.v1')));
async function resume(overrides = {}) {
  await page.goto(url);
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(
    (state) =>
      localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(state)),
    { ...base, ...overrides },
  );
  await page.reload();
  await page.locator('[data-action=continue]').click();
  await page.waitForTimeout(100);
}
async function dialogue() {
  for (let n = 0; n < 50 && (await page.locator('.dialogue').count()); n++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}
const shot = (name) =>
  page.screenshot({ path: `docs/screenshots/chapter-01/${name}.png` });
await resume({
  map: 'belfry',
  z: 13,
  flags: base.flags.filter((flag) => flag !== 'ch01:belfry'),
});
await page.locator('.dialogue').waitFor();
assert.ok((await page.locator('.text').innerText()).includes('青い石'));
await dialogue();
assert.ok((await saved()).flags.includes('ch01:belfry'));
await resume({
  hp: 50,
  map: 'belfry',
  z: 9,
  chapter: { ...base.chapter, liliaHP: 40 },
});
await shot('03-belfry');
await page.keyboard.press('Escape');
await page.locator('[data-action="fieldPrayer:hero"]').click();
assert.equal((await saved()).hp, 80);
assert.equal((await saved()).chapter.liliaHP, 40);
await page.locator('[data-action="fieldHeal:lilia"]').click();
assert.equal((await saved()).chapter.liliaHP, 82);
await page.keyboard.press('Escape');

await resume({ hp: 3, chapter: { ...base.chapter, liliaHP: 3 } });
await page.keyboard.down('w');
await page.waitForTimeout(1100);
await page.keyboard.up('w');
await dialogue();
await page.locator('[data-action=attack]').waitFor();
for (
  let n = 0;
  n < 10 && !(await page.locator('[data-action=retry]').count());
  n++
) {
  if (await page.locator('[data-action=attack]:disabled').count())
    await page.keyboard.press('z');
  else await page.locator('[data-action=attack]').click();
  await page.waitForTimeout(70);
}
await page.locator('[data-action=retry]').waitFor();
await page.locator('[data-action=retry]').click();
assert.ok(
  (await page.locator('[data-member=hero]').innerText()).includes('HP 3 / 100'),
);
assert.ok(
  (await page.locator('[data-member=lilia]').innerText()).includes(
    'HP 3 / 100',
  ),
);
await page.locator('[data-action=items]').click();
assert.ok((await page.locator('.commands').innerText()).includes('薬草 ×3'));
await page.keyboard.press('Escape');
await shot('10-retry');

await resume({
  hp: 64,
  chapter: { ...base.chapter, stage: 'restoration', liliaHP: 71 },
  flags: [...base.flags, 'ch01:boss'],
  defeated: [...base.defeated, 'bellkeeper'],
});
assert.equal(await page.locator('.battle-ui').count(), 0);
await dialogue();
await page.locator('.help').waitFor();
const restored = await saved();
assert.equal(restored.map, 'village');
assert.equal(restored.chapter.stage, 'departure');
assert.ok(restored.flags.includes('ch01:restored'));
assert.ok(restored.flags.includes('ch01:return'));
assert.equal(restored.hp, 64);
assert.equal(restored.chapter.liliaHP, 71);
await shot('11-restoration-resume');
assert.deepEqual(errors, []);
const results = {
  interruptedBelfryArrivalResumes: true,
  fieldPrayerSingleTarget: true,
  fieldRecoverySingleTarget: true,
  retryRestoresBothHPAndHerbs: true,
  postBossReloadResumesRestorationWithoutRematch: true,
  restored,
  errors,
};
await writeFile('docs/chapter-01-edges.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
