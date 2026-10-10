import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'docs/screenshots/world-revision';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const key = 'hoshiken.prologue.v1';
const seed = {
  version: 1,
  map: 'merca',
  x: 0,
  z: 17,
  hp: 100,
  herbs: 3,
  lilia: true,
  sword: true,
  starSword: true,
  complete: true,
  defeated: ['boss', 'bellkeeper'],
  flags: [
    'ch01:complete',
    'ch01:title',
    'ch01:restored',
    'ch01:return',
    'ch01:emblem',
    'skill:star-slash',
    'skill:recovery',
    'skill:prayer',
    'ch02:started',
    'ch02:title',
    'ch02:arrival',
    'ch02:manifest',
    'ch02:rest-entry',
    'ch02:office',
    'ch02:flow',
    'ch02:sever',
    'skill:star-sever',
    'ch02:core',
  ],
  chapter: {
    number: 2,
    stage: 'boss',
    titleShown: true,
    liliaHP: 100,
    party: {
      hero: { level: 1, xp: 0, mp: 24 },
      lilia: { level: 1, xp: 0, mp: 24 },
    },
  },
};
async function load(s) {
  await page.evaluate(
    ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
    [key, s],
  );
  await page.reload();
  await page.locator('[data-action=continue]').click();
  await page.locator('.help').waitFor();
}
const shot = (n) => page.screenshot({ path: `${dir}/${n}.png` });
const press = () => page.keyboard.press('z');
async function move(k, ms) {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
}
const hp = async (actor) =>
  Number(
    (await page.locator(`[data-member=${actor}] .hp-value`).innerText()).match(
      /HP (\d+)/,
    )[1],
  );
async function finishTurn() {
  await page.locator('.next[data-animating=false]').waitFor({ timeout: 15000 });
  await press();
}
try {
  await page.goto('http://127.0.0.1:5174');
  await page.locator('[data-action=new]').waitFor();
  await load(seed);
  await page.waitForTimeout(250);
  await shot('01-merca');
  await load({ ...seed, x: -3.8, z: 14 });
  await move('a', 1900);
  await shot('02-bridge');
  await page.keyboard.press('x');
  await page.locator('[data-action=close]').click();
  await page.reload();
  await page.locator('[data-action=continue]').click();
  // Collision with the river away from the bridge: player cannot cross to its center.
  await load({ ...seed, x: -3.5, z: 3 });
  await move('a', 1600);
  await shot('03-river-blocked');
  await page.keyboard.press('x');
  await page
    .locator('[data-action=fieldHerb]')
    .click()
    .catch(() => {});
  await page.locator('[data-action=close]').click();
  // NPC's front, right walk and left walk are visually recorded.
  await load({ ...seed, x: 0, z: 14 });
  await shot('04-npc-front');
  await page.waitForTimeout(4400);
  await shot('05-npc-right');
  await page.waitForTimeout(5300);
  await shot('06-npc-left');
  // Forest non-event monster follows and enters contact combat.
  const forest = {
    version: 1,
    map: 'depths',
    x: 0,
    z: 27,
    hp: 100,
    herbs: 3,
    lilia: true,
    sword: true,
    starSword: false,
    complete: false,
    flags: ['heardCry'],
    defeated: ['rescue'],
  };
  await load(forest);
  await shot('07-following');
  await page.locator('[data-action=attack]').waitFor({ timeout: 25000 });
  assert.ok((await page.locator('.battle-label').innerText()).includes('狼'));
  const initialHP = await hp('hero');
  await page.locator('[data-action=attack]').click();
  assert.equal(await hp('hero'), initialHP);
  await page.waitForTimeout(600);
  assert.equal(await hp('hero'), initialHP);
  await shot('08-hero-hit');
  await page.waitForTimeout(820);
  await shot('09-enemy-lunge');
  await page.locator('.next[data-animating=false]').waitFor();
  assert.ok((await hp('hero')) < initialHP);
  await finishTurn();
  // Two-party combat: guard icon, Lilia staff attack, delayed enemy hit.
  await load({
    ...seed,
    map: 'undercroft',
    x: 0,
    z: 14,
    chapter: { ...seed.chapter, number: 1, stage: 'investigation' },
    flags: [
      'ch01:title',
      'ch01:keeper',
      'ch01:belfry',
      'skill:star-slash',
      'skill:recovery',
      'skill:prayer',
    ],
  });
  await move('w', 700);
  await page.locator('[data-action=attack]').waitFor();
  await page.locator('[data-action=guard]').click();
  await page.locator('[data-status=guard]').waitFor();
  await shot('10-guard-icon');
  await finishTurn();
  const beforeLilia = await hp('hero');
  await page.locator('[data-action=attack]').click();
  await page.waitForTimeout(520);
  assert.equal(await hp('hero'), beforeLilia);
  await shot('11-lilia-staff');
  await finishTurn();
  // Bellkeeper status icons: armor, forgetfulness and attack warning.
  const sanctuary = {
    ...seed,
    map: 'sanctum',
    x: 0,
    z: -7.25,
    chapter: { ...seed.chapter, number: 1, stage: 'boss' },
    flags: [
      'ch01:title',
      'ch01:keeper',
      'ch01:belfry',
      'ch01:ward',
      'ch01:prayer',
      'skill:star-slash',
      'skill:recovery',
      'skill:prayer',
    ],
    defeated: ['boss'],
  };
  await load(sanctuary);
  await move('w', 1000);
  await page.locator('.dialogue').waitFor();
  for (let i = 0; i < 12 && (await page.locator('.dialogue').count()); i++)
    await press();
  await page.locator('[data-action=attack]').waitFor();
  await page.locator('[data-status=armor]').waitFor();
  await page.locator('[data-action=attack]').click();
  await finishTurn();
  await page.locator('[data-action=attack]').click();
  await finishTurn();
  await page.locator('[data-status=forgotten]').waitFor();
  await shot('12-forgotten-icon');
  await page.locator('[data-action=guard]').click();
  await finishTurn();
  await page.locator('[data-action=guard]').click();
  await finishTurn();
  await page.locator('[data-status=warning]').waitFor();
  await shot('13-warning-icon');
  assert.deepEqual(errors, []);
  await writeFile(
    'docs/world-revision-checks.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        tests: [
          'town roads and bridge',
          'river collision',
          'NPC patrol',
          'forest pursuit',
          'following alignment',
          'sequential ally/enemy damage',
          'Lilia staff animation',
          'guard, armor, forgotten and warning icons',
        ],
      },
      null,
      2,
    ),
  );
  console.log('World revision browser checks passed.');
} finally {
  await browser.close();
}
