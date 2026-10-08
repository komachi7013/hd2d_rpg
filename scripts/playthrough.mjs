import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [],
  seen = new Set();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
await page.locator('[data-action=new]').waitFor({ timeout: 30000 });
await page.screenshot({ path: 'docs/screenshots/01-title.png' });
await page.keyboard.press('Enter');
const started = Date.now();
let sword = false;
let battleCount = 0;
let lastBattle = false;
while (Date.now() - started < 600000) {
  const text = await page.locator('#ui').innerText();
  if (await page.locator('.ending').count()) {
    await page.screenshot({ path: 'docs/screenshots/06-complete.png' });
    break;
  }
  if (await page.locator('.dialogue').count()) {
    await page.keyboard.press('z');
    await page.waitForTimeout(80);
    continue;
  }
  if (await page.locator('[data-action=retry]').count())
    throw Error('Unexpected defeat');
  if (await page.locator('.battle-ui').count()) {
    if (!lastBattle) {
      battleCount++;
      lastBattle = true;
      const enemy = await page.locator('.battle-label').innerText();
      seen.add(enemy.split('\n')[0]);
      console.log('Battle', battleCount, enemy);
      await page.screenshot({
        path: `docs/screenshots/battle-${battleCount}.png`,
      });
    }
    if (await page.locator('[data-action=attack]:disabled').count()) {
      await page.waitForTimeout(120);
      await page.keyboard.press('z');
    } else {
      if (await page.locator('[data-action=skills]').count()) {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('z');
        await page.locator('[data-action="skill:star-slash"]').waitFor();
        await page.screenshot({ path: 'docs/screenshots/05-awakened.png' });
        await page.keyboard.press('z');
      } else {
        const hp = Number(
          (await page.locator('.status').innerText()).match(/HP (\d+)/)[1],
        );
        if (hp <= 30) {
          await page.keyboard.press('ArrowUp');
          await page.keyboard.press('z');
          const herb = page.locator('[data-action="item:herb"]:not(:disabled)');
          if (await herb.count()) await page.keyboard.press('z');
          else {
            await page.keyboard.press('Escape');
            await page.keyboard.press('ArrowUp');
            await page.keyboard.press('z');
          }
        } else await page.keyboard.press('z');
      }
    }
    await page.waitForTimeout(100);
    continue;
  }
  lastBattle = false;
  if (!sword && text.includes('落ちている剣')) {
    await page.keyboard.press('z');
    sword = true;
    continue;
  }
  if (!(await page.locator('.status').count()))
    throw Error('Lost exploration ' + text);
  if (
    !(await page.locator('.area').innerText()).includes('入口') &&
    !seen.has('宵羽の魔蛾')
  ) {
    // Move into the right side of the path to ensure the visible moth encounter is exercised.
    const save = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hoshiken.prologue.v1')),
    );
    if (
      save.map === 'depths' &&
      save.defeated.includes('wolf1') &&
      !seen.has('宵羽の魔蛾') &&
      !seen.has('shifted')
    ) {
      await page.keyboard.down('d');
      await page.waitForTimeout(600);
      await page.keyboard.up('d');
      seen.add('shifted');
    }
  }
  if (battleCount === 0 && !seen.has('forestShot')) {
    await page.screenshot({ path: 'docs/screenshots/02-forest.png' });
    seen.add('forestShot');
  }
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
}
if (!(await page.locator('.ending').count())) {
  await page.screenshot({ path: 'docs/screenshots/failure.png' });
  console.log(await page.locator('#ui').innerText());
}
assert.ok(await page.locator('.ending').count(), 'Prologue did not complete');
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('hoshiken.prologue.v1')),
);
assert.equal(saved.complete, true);
assert.equal(saved.starSword, true);
assert.ok(saved.lilia);
assert.ok(seen.has('宵羽の魔蛾'));
await page.locator('[data-action=chapter]').click();
await page.locator('.chapter-title').waitFor();
await page.waitForTimeout(600);
await page.keyboard.press('z');
await page.locator('.dialogue').waitFor();
assert.ok((await page.locator('.text').innerText()).includes('翌朝'));
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.dialogue').waitFor();
assert.equal(await page.locator('.chapter-title').count(), 0);
assert.deepEqual(errors, []);
const result = {
  completed: true,
  battleCount,
  seen: [...seen],
  saved,
  errors,
  elapsedSeconds: (Date.now() - started) / 1000,
};
await writeFile(
  'docs/playthrough-result.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
await browser.close();
