import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await mkdir('docs/screenshots/chapter-01/revision', { recursive: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const base = {
  version: 1,
  map: 'undercroft',
  x: 0,
  z: 14,
  hp: 50,
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
  defeated: ['rescue', 'boss'],
  chapter: { number: 1, stage: 'boss', titleShown: true, liliaHP: 100 },
};
const snapshot = () => page.evaluate(() => window.__mpFrame);
const shot = (name) =>
  page.screenshot({ path: `docs/screenshots/chapter-01/revision/${name}.png` });
async function resume(overrides = {}) {
  await page.goto(url);
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(
    (s) => localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(s)),
    { ...base, ...overrides },
  );
  await page.reload();
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(async () => {
    const entry = performance
      .getEntriesByType('resource')
      .find((r) => r.name.includes('/src/render/world.ts'));
    const { World } = await import(entry.name);
    const original = World.prototype.render;
    World.prototype.render = function (s, b, dt, mode) {
      original.call(this, s, b, dt, mode);
      window.__mpFrame = {
        state: structuredClone(s),
        battle: b ? structuredClone(b) : null,
        mode,
        heroAsset: this.player.userData.current,
        liliaAsset: this.companion.userData.current,
        npcs: this.environment.children
          .filter((o) => o.userData.npcRole)
          .map((o) => ({
            role: o.userData.npcRole,
            asset: o.userData.current,
          })),
      };
    };
  });
  await page.locator('[data-action=continue]').click();
  await page.waitForFunction(() => window.__mpFrame?.mode === 'explore');
}
async function encounter() {
  for (
    let i = 0;
    i < 30 &&
    !(await page.locator('.dialogue').count()) &&
    !(await page.locator('.battle-ui').count());
    i++
  ) {
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
  }
  for (let i = 0; i < 20 && (await page.locator('.dialogue').count()); i++)
    await page.keyboard.press('z');
  await page.locator('[data-action=attack]:not(:disabled)').waitFor();
  await page.waitForFunction(() => window.__mpFrame?.mode === 'battle');
}
async function advance() {
  await page.keyboard.press('z');
  await page.locator('[data-action=attack]:not(:disabled)').waitFor();
}
async function cast(skill, target) {
  await page.locator('[data-action=skills]').click();
  await page.locator(`[data-action="skill:${skill}"]`).click();
  if (target) await page.locator(`[data-action="target:${target}"]`).click();
}
await resume({ map: 'village', z: 0, hp: 100 });
const npcs = (await snapshot()).npcs;
assert.deepEqual(Object.fromEntries(npcs.map((n) => [n.role, n.asset])), {
  baker: 'villagerAdult',
  child: 'villagerChild',
  elder: 'keeper',
  keeper: 'bellKeeper',
});
await page.keyboard.press('-');
await page.keyboard.press('-');
await shot('01-village-npcs');
await resume({ map: 'village', z: -14, hp: 100 });
await shot('02-bell-keeper');

await resume();
await encounter();
assert.equal((await snapshot()).state.chapter.party.hero.mp, 24);
await page.locator('[data-action=guard]').click();
await page.waitForFunction(() => window.__mpFrame.heroAsset === 'heroGuard');
await shot('03-hero-guard');
await advance();
await cast('recovery', 'hero');
await page.locator('.combat-number.healing[data-target=hero]').waitFor();
await page.locator('.combat-number.damage[data-target=hero]').waitFor();
const changes = await page.locator('.combat-number').evaluateAll((nodes) =>
  nodes.map((n) => ({
    text: n.textContent,
    color: getComputedStyle(n).color,
    target: n.dataset.target,
  })),
);
assert.ok(
  changes.some((c) => c.text === '+42' && c.color === 'rgb(115, 184, 255)'),
);
assert.ok(
  changes.some((c) => c.text === '-7' && c.color === 'rgb(255, 104, 99)'),
);
assert.equal((await snapshot()).state.chapter.party.lilia.mp, 20);
await shot('04-damage-and-heal');
await advance();
await page.locator('[data-action=attack]').click();
await page.waitForFunction(() => window.__mpFrame.heroAsset === 'attack');
await advance();
await page.locator('[data-action=guard]').click();
await page.waitForFunction(() => window.__mpFrame.liliaAsset === 'liliaGuard');
await shot('05-lilia-guard');
await resume({ hp: 50, chapter: { ...base.chapter, liliaHP: 50 } });
await encounter();
await page.locator('[data-action=guard]').click();
await advance();
await cast('recovery', 'lilia');
await page.locator('[data-member=lilia] .hp-healing').waitFor();
await page.locator('[data-member=hero] .hp-damage').waitFor();
await shot('09-blue-hp-red-hp');

await resume({ map: 'sanctum', z: -5, hp: 80 });
await encounter();
for (let round = 0; round < 6; round++) {
  await page.locator('[data-action=guard]').click();
  await advance();
  await cast('recovery', 'hero');
  await advance();
}
await page.locator('[data-action=guard]').click();
await advance();
assert.equal((await snapshot()).state.chapter.party.lilia.mp, 0);
const before = (await snapshot()).battle;
await page.locator('[data-action=skills]').click();
assert.equal(
  await page.locator('[data-action="skill:recovery"]').isDisabled(),
  true,
);
assert.equal(
  await page.locator('[data-action="skill:prayer"]').isDisabled(),
  true,
);
assert.ok((await page.locator('.commands').innerText()).includes('MP 4'));
await shot('06-insufficient-mp');
await page.keyboard.press('Escape');
assert.equal((await snapshot()).battle.turn, before.turn);

const growth = {
  hero: { level: 1, xp: 30, mp: 0 },
  lilia: { level: 1, xp: 30, mp: 0 },
};
await resume({ hp: 80, chapter: { ...base.chapter, party: growth } });
await page.keyboard.press('Escape');
assert.equal(
  await page.locator('[data-action="fieldHeal:hero"]').isDisabled(),
  true,
);
await page.keyboard.press('Escape');
await encounter();
assert.equal((await snapshot()).state.chapter.party.hero.mp, 24);
for (let i = 0; i < 12 && (await page.locator('.battle-ui').count()); i++) {
  if (await page.locator('[data-action=attack]:disabled').count()) {
    await page.keyboard.press('z');
    await page.waitForTimeout(60);
    continue;
  }
  if ((await snapshot()).battle.actor === 'hero') await cast('star-slash');
  else await page.locator('[data-action=attack]').click();
}
await page.locator('.help').waitFor();
const grown = (await snapshot()).state;
assert.equal(grown.chapter.party.hero.level, 2);
assert.equal(grown.chapter.party.lilia.level, 2);
assert.ok(
  (await page.locator('[data-member=hero]').innerText()).includes('/ 112'),
);
assert.ok(
  (await page.locator('[data-member=lilia]').innerText()).includes('/ 110'),
);
await shot('07-level-up');
await page.reload();
await page.locator('[data-action=continue]').click();
await page.locator('.help').waitFor();
assert.ok(
  (await page.locator('[data-member=hero]').innerText()).includes('Lv.2'),
);
await resume({ ...grown, z: -7 });
await encounter();
assert.equal((await snapshot()).state.chapter.party.hero.mp, 28);
assert.equal((await snapshot()).state.chapter.party.lilia.mp, 29);
await shot('08-next-battle-full-mp');
assert.deepEqual(errors, []);
await writeFile(
  'docs/mp-growth-visual-checks.json',
  JSON.stringify(
    {
      npcs,
      changes,
      mpShortageDisabled: true,
      cancelDoesNotConsume: true,
      eachEncounterRefillsMP: true,
      nextAttackClearsGuard: true,
      hudHPChangesColored: true,
      fieldMPShortageDisabled: true,
      guardAssets: ['heroGuard', 'liliaGuard'],
      growthSaved: grown.chapter.party,
      errors,
    },
    null,
    2,
  ),
);
console.log(
  'NPC replacement, MP consumption/refill, level growth, colored HP feedback, guard poses: passed',
);
await browser.close();
