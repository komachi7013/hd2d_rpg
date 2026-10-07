import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = {
  version: 1,
  map: 'temple',
  x: 0,
  z: 28,
  hp: 100,
  herbs: 3,
  lilia: true,
  sword: true,
  starSword: false,
  complete: false,
  flags: ['heardCry'],
  defeated: ['rescue', 'guardian'],
};
async function resume(overrides = {}) {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(
    (state) =>
      localStorage.setItem('hoshiken.prologue.v1', JSON.stringify(state)),
    { ...base, ...overrides },
  );
  await page.reload();
  await page.locator('[data-action=new]').waitFor();
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .find((entry) => entry.name.includes('/src/render/world.ts')).name;
    const { World } = await import(url);
    const render = World.prototype.render;
    window.__partyFrames = [];
    World.prototype.render = function (state, battle, dt, mode) {
      render.call(this, state, battle, dt, mode);
      window.__partyFrames.push({
        mode,
        map: state.map,
        x: state.x,
        z: state.z,
        lilia: state.lilia,
        battle: !!battle,
        player: this.player.position.toArray(),
        npc: this.companion.position.toArray(),
        camera: this.cameraTarget.toArray(),
      });
      if (window.__partyFrames.length > 4000) window.__partyFrames.shift();
    };
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await page.waitForTimeout(120);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function assertExplorationPose(frame) {
  assert.ok(frame);
  near(frame.npc[0], frame.x - 1.2);
  near(frame.npc[1], 0.05);
  near(frame.npc[2], frame.z + 1.6);
  near(frame.player[0], frame.x);
  near(frame.player[1], 0.05);
  near(frame.player[2], frame.z);
  near(frame.camera[0], frame.x);
  near(frame.camera[2], frame.z - 2);
}
await resume({ x: 2, z: 20 });
let frames = await page.evaluate(() => window.__partyFrames);
assertExplorationPose(frames.find((frame) => frame.mode === 'explore'));
await page.screenshot({ path: 'docs/screenshots/revision-resume.png' });
await page.keyboard.down('d');
await page.waitForTimeout(250);
await page.keyboard.up('d');
frames = await page.evaluate(() => window.__partyFrames);
assert.ok(
  frames.some(
    (frame, index) =>
      index &&
      frame.mode === 'explore' &&
      frame.x > frames[index - 1].x + 0.0001 &&
      frame.npc[0] > frames[index - 1].npc[0] &&
      frame.npc[0] < frame.x - 1.2 - 0.0001,
  ),
  'walking must interpolate',
);

// A movement key held across a modal must require a fresh press afterward.
await page.keyboard.down('w');
await page.waitForTimeout(100);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
const beforeRepeat = await page.evaluate(() => window.__partyFrames.at(-1).z);
await page.keyboard.down('w'); // repeat of the still-held key
await page.waitForTimeout(180);
await page.keyboard.up('w');
assert.equal(
  await page.evaluate(() => window.__partyFrames.at(-1).z),
  beforeRepeat,
);
await page.keyboard.down('w');
await page.waitForTimeout(150);
await page.keyboard.up('w');
assert.ok(
  (await page.evaluate(() => window.__partyFrames.at(-1).z)) < beforeRepeat,
);

await resume({ map: 'entrance', x: 0, z: -28.5 });
await page.keyboard.down('w');
await page.waitForTimeout(600);
await page.keyboard.up('w');
frames = await page.evaluate(() => window.__partyFrames);
assertExplorationPose(frames.find((frame) => frame.map === 'depths'));
await page.screenshot({ path: 'docs/screenshots/revision-map-transition.png' });

await resume({ map: 'depths', z: 24.8 });
await page.keyboard.down('w');
await page.waitForTimeout(500);
await page.keyboard.up('w');
await page.locator('[data-action=attack]').waitFor();
for (let turn = 0; turn < 4; turn++) {
  await page.keyboard.press('z');
  await page.keyboard.press('z');
}
await page.waitForTimeout(150);
frames = await page.evaluate(() => window.__partyFrames);
const returned = frames.find(
  (frame, index) => index && frames[index - 1].battle && !frame.battle,
);
assertExplorationPose(returned);
await page.screenshot({ path: 'docs/screenshots/revision-battle-return.png' });

await resume({ z: -19, hp: 60 });
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
for (let i = 0; i < 3; i++) await page.keyboard.press('z');
await page.locator('[data-action=attack]').waitFor();
assert.equal(await page.locator('[data-action=skills]').count(), 0);
const initial = await page.locator('.status').innerText();
await page.keyboard.press('ArrowUp'); // 道具
await page.keyboard.down('z');
await page.keyboard.down('Enter'); // simultaneous confirm must not leak into the submenu
await page.keyboard.up('Enter');
await page.keyboard.up('z');
assert.equal(
  await page.locator('.commands').getAttribute('data-menu'),
  'items',
);
assert.ok((await page.locator('.commands').innerText()).includes('薬草 ×3'));
assert.equal(await page.locator('.status').innerText(), initial);
await page.keyboard.press('x');
assert.equal(await page.locator('.commands').getAttribute('data-menu'), 'root');
assert.equal(
  await page.evaluate(() => document.activeElement.dataset.action),
  'items',
);
await page.keyboard.press('z');
await page.screenshot({ path: 'docs/screenshots/revision-items.png' });
await page.keyboard.down('z');
await page.keyboard.down('z');
await page.keyboard.down('Enter');
await page.keyboard.up('Enter');
await page.keyboard.up('z');
assert.equal(await page.locator('[data-action=attack]:disabled').count(), 1);
assert.ok((await page.locator('.status').innerText()).includes('HP 76 / 100'));
await page.keyboard.press('z');
for (let i = 0; i < 2; i++) {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await page.keyboard.press('z');
}
await page.locator('.dialogue').waitFor();
for (let i = 0; i < 6; i++) await page.keyboard.press('z');
await page.locator('[data-action=skills]').waitFor();
assert.deepEqual(await page.locator('.commands button').allTextContents(), [
  '攻撃',
  '防御',
  '星剣',
  '道具',
]);
const awakened = await page.locator('.status').innerText();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('z');
assert.equal(await page.locator('[data-action="skill:star-slash"]').count(), 1);
await page.keyboard.press('Escape');
assert.equal(
  await page.evaluate(() => document.activeElement.dataset.action),
  'skills',
);
assert.equal(await page.locator('.status').innerText(), awakened);
assert.ok((await page.locator('.battle-log').innerText()).includes('TURN 4'));
await page.keyboard.press('z');
await page.waitForTimeout(1600);
await page.screenshot({ path: 'docs/screenshots/revision-skills.png' });
await page.keyboard.press('z');
await page.keyboard.press('z');
for (let i = 0; i < 9; i++) await page.keyboard.press('z');
await page.locator('.ending').waitFor();
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('hoshiken.prologue.v1')),
);
assert.equal(saved.complete, true);
assert.equal(saved.version, 1);
assert.ok(saved.flags.includes('skill:star-slash'));
assert.deepEqual(Object.keys(saved).sort(), Object.keys(base).sort());

await resume({ z: -19, herbs: 0 });
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
for (let i = 0; i < 3; i++) await page.keyboard.press('z');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('z');
assert.equal(await page.locator('[data-action="item:herb"]').count(), 0);
assert.ok(
  (await page.locator('.battle-log').innerText()).includes(
    '所持している道具はありません',
  ),
);
await page.keyboard.press('Escape');
assert.ok((await page.locator('.battle-log').innerText()).includes('TURN 1'));
assert.deepEqual(errors, []);
const result = {
  nestedSkills: true,
  nestedItems: true,
  cancelDoesNotConsumeTurns: true,
  heldConfirmDoesNotLeak: true,
  heldMovementDoesNotLeak: true,
  learnedSkillsSavedInV1Flags: true,
  emptyInventory: true,
  partyFirstFrame: { battleEnd: true, mapChange: true, resume: true },
  smoothWalking: true,
  errors,
};
await writeFile('docs/revision-checks.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
