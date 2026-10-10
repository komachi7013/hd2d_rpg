import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'docs/screenshots/chapter-02';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const key = 'hoshiken.prologue.v1';
const seed = {
  version: 1,
  map: 'road',
  x: 0,
  z: -13,
  hp: 37,
  herbs: 0,
  lilia: true,
  sword: true,
  starSword: true,
  complete: true,
  defeated: ['boss', 'bellkeeper'],
  flags: [
    'ch01:complete',
    'ch01:title',
    'ch01:emblem',
    'ch01:restored',
    'ch01:return',
    'skill:star-slash',
    'skill:recovery',
    'skill:prayer',
  ],
  chapter: {
    number: 2,
    stage: 'complete',
    titleShown: true,
    liliaHP: 58,
    party: {
      hero: { level: 2, xp: 60, mp: 5 },
      lilia: { level: 2, xp: 60, mp: 7 },
    },
  },
};
const saved = () =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const press = () => page.keyboard.press('z');
async function load(s) {
  await page.evaluate(
    ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
    [key, s],
  );
  await page.reload();
  await page.locator('[data-action=continue]').click();
}
async function dialogue() {
  for (let i = 0; i < 80 && (await page.locator('.dialogue').count()); i++) {
    await press();
    await page.waitForTimeout(30);
  }
}
async function move(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function crossTo(map) {
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(
      ([key, map]) => JSON.parse(localStorage.getItem(key)).map === map,
      [key, map],
      { timeout: 30000 },
    );
  } finally {
    await page.keyboard.up('w');
  }
}
async function walkUntil(selector) {
  await page.keyboard.down('w');
  try {
    await page.locator(selector).waitFor({ timeout: 30000 });
  } finally {
    await page.keyboard.up('w');
  }
}
const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` });
async function position(map, x, z) {
  const s = await saved();
  Object.assign(s, { map, x, z });
  await load(s);
}
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5174');
  await page.locator('[data-action=new]').waitFor();
  await load(seed);
  await move('w', 1600);
  await page.locator('.chapter-title').waitFor();
  let s = await saved();
  assert.equal(s.hp, 37);
  assert.equal(s.chapter.party.hero.mp, 5);
  assert.equal(s.chapter.titleShown, false);
  await shot('01-title');
  await page.reload();
  await page.locator('[data-action=continue]').click();
  await page.locator('.chapter-title').waitFor();
  await page.waitForTimeout(600);
  await press();
  await dialogue();
  await shot('02-market');
  s = await saved();
  assert.ok(s.flags.includes('ch02:arrival'));
  assert.ok(s.flags.includes('ch02:title'));
  assert.equal(s.hp, 37);
  await position('merca', -3, 3);
  await press();
  await dialogue();
  s = await saved();
  assert.equal(s.map, 'merca-depot');
  assert.equal(s.hp, 112);
  assert.equal(s.chapter.liliaHP, 110);
  assert.ok(s.flags.includes('ch02:rest-entry'));
  await shot('03-depot');
  await position('merca', 0, -14);
  await press();
  await dialogue();
  assert.ok((await saved()).flags.includes('ch02:office'));
  await shot('04-office');
  await position('merca-office', 0, -11);
  await crossTo('merca-waterway');
  assert.equal((await saved()).map, 'merca-waterway');
  // Walk off center to bypass both optional encounters.
  await position('merca-waterway', -4, 25);
  await page.keyboard.down('w');
  await page.locator('.dialogue').waitFor({ timeout: 60000 });
  await page.keyboard.up('w');
  await dialogue();
  assert.ok((await saved()).flags.includes('ch02:flow'));
  await shot('05-waterway');
  await page.keyboard.down('w');
  await page.locator('.dialogue').waitFor({ timeout: 60000 });
  await page.keyboard.up('w');
  await dialogue();
  assert.ok((await saved()).flags.includes('skill:star-sever'));
  await shot('06-sever');
  s = await saved();
  assert.ok(!s.defeated.includes('ch02-work-machine'));
  assert.ok(!s.defeated.includes('ch02-memory-moth'));
  assert.equal(s.herbs, 0);
  await position('merca-waterway', -4, -25);
  await crossTo('merca-core');
  await dialogue();
  assert.equal((await saved()).map, 'merca-core');
  await position('merca-core', 0, -4);
  await walkUntil('[data-action=attack]');
  await page.locator('[data-action=attack]').waitFor();
  await shot('07-collector');
  await page.locator('[data-action=skills]').click();
  assert.equal(
    await page.locator('[data-action="skill:star-slash"]').count(),
    1,
  );
  assert.equal(
    await page.locator('[data-action="skill:star-sever"]').count(),
    1,
  );
  await page.locator('[data-action="skill:star-sever"]').click();
  const before = await saved();
  await shot('08-targets');
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  assert.deepEqual(await saved(), before);
  let severed = 0;
  let prayed = false;
  for (let i = 0; i < 100; i++) {
    if (await page.locator('.dialogue').count()) break;
    assert.equal(await page.locator('[data-action=retry]').count(), 0);
    if (await page.locator('.next').count()) {
      if (await page.locator('.next[data-animating=true]').count())
        await page.locator('.next[data-animating=false]').waitFor();
      await press();
      await page.waitForTimeout(30);
      continue;
    }
    const log = await page.locator('.battle-log small').innerText();
    if (log.includes('リリアの行動')) {
      const current = await page
        .locator('[data-member=hero] .hp-value')
        .innerText();
      const hp = Number(current.match(/HP (\d+)/)[1]);
      if (log.includes('ユウ：忘却')) {
        await page.locator('[data-action=skills]').click();
        await page.locator('[data-action="skill:prayer"]').click();
        await page.locator('[data-action="target:hero"]').click();
        prayed = true;
      } else if (
        hp < 65 &&
        !(
          await page.locator('[data-member=lilia] .mp-value').innerText()
        ).startsWith('MP 0 ')
      ) {
        await page.locator('[data-action=skills]').click();
        const heal = page.locator('[data-action="skill:recovery"]');
        if (await heal.isEnabled()) {
          await heal.click();
          await page.locator('[data-action="target:hero"]').click();
        } else {
          await page.keyboard.press('x');
          await page.locator('[data-action=attack]').click();
          await page.locator('[data-action="enemy:body"]').click();
        }
      } else {
        await page.locator('[data-action=attack]').click();
        await page.locator('[data-action="enemy:body"]').click();
      }
    } else {
      if (severed < 2 && !log.includes('ユウ：忘却')) {
        await page.locator('[data-action=skills]').click();
        await page.locator('[data-action="skill:star-sever"]').click();
        await page
          .locator(`[data-action="enemy:connection:${severed}"]`)
          .click();
        severed++;
      } else {
        await page.locator('[data-action=attack]').click();
        await page.locator('[data-action="enemy:body"]').click();
      }
    }
    await page.waitForTimeout(30);
    if ((await saved()).flags.includes('ch02:boss')) break;
  }
  s = await saved();
  assert.ok(s.flags.includes('ch02:boss'));
  assert.ok(s.defeated.includes('ch02-collector'));
  const xp = structuredClone(s.chapter.party);
  await shot('09-victory');
  // Reload without acknowledging the final turn; saved victory must resume rescue, not combat.
  await page.reload();
  await page.locator('[data-action=continue]').click();
  await page.locator('.dialogue').waitFor();
  assert.equal(await page.locator('[data-action=attack]').count(), 0);
  // Interrupt the records dialogue and confirm it is presented again.
  while (
    !(await page.locator('.dialogue').innerText()).includes(
      '輸送記録と北方任務',
    )
  ) {
    await press();
    await page.waitForTimeout(30);
  }
  await press();
  await page.reload();
  await page.locator('[data-action=continue]').click();
  assert.ok(
    (await page.locator('.dialogue').innerText()).includes(
      '輸送記録と北方任務',
    ),
  );
  await shot('10-records');
  await dialogue();
  s = await saved();
  assert.ok(s.flags.includes('ch02:return'));
  assert.deepEqual(s.chapter.party, xp);
  await position('merca', -3, 3);
  await press();
  await dialogue();
  assert.ok((await saved()).flags.includes('ch02:rest-exit'));
  await position('merca', 0, -21);
  await walkUntil('.dialogue');
  await dialogue();
  s = await saved();
  assert.equal(s.map, 'north-road');
  assert.equal(s.chapter.number, 3);
  assert.ok(s.flags.includes('ch02:complete'));
  await shot('11-complete');
  await page.reload();
  await page.locator('[data-action=continue]').click();
  assert.equal(await page.locator('.chapter-title').count(), 0);
  assert.equal(await page.locator('.dialogue').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    'docs/chapter-02-checks.json',
    JSON.stringify(
      {
        passed: true,
        severed,
        prayed,
        optionalBattlesSkipped: true,
        herbs: s.herbs,
        finalState: s,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Chapter 02: title interruption, maps, optional-content bypass, target cancel, boss victory reload, records replay, departure and resume passed.',
  );
} finally {
  await browser.close();
}
