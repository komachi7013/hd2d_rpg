import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fresh,
  beginBattle,
  resolveTurn,
  validState,
} from '../src/simulation/state';
import {
  skills,
  learnSkill,
  learnedSkills,
  ownedItems,
} from '../src/simulation/abilities';
import { PartyPlacement } from '../src/render/party-placement';

test('skills are data, awakening acquisition persists in version-1 flags', () => {
  const s = fresh();
  assert.deepEqual(learnedSkills(s), []);
  assert.ok(skills[0].description);
  learnSkill(s, 'star-slash');
  learnSkill(s, 'star-slash');
  assert.deepEqual(s.flags, ['skill:star-slash']);
  s.starSword = true;
  assert.deepEqual(
    learnedSkills(JSON.parse(JSON.stringify(s))).map((skill) => skill.id),
    ['star-slash'],
  );
  assert.equal(validState(s), true);
  assert.equal(s.version, 1);
  assert.throws(() => learnSkill(s, 'not-defined'));
});
test('legacy acquired star sword retains its learned skill without mutating the save', () => {
  const s = fresh();
  s.starSword = true;
  const before = JSON.stringify(s);
  assert.equal(learnedSkills(s)[0].name, '一閃');
  assert.equal(JSON.stringify(s), before);
});
test('unlearned or unavailable skill and unknown item do not consume turns', () => {
  const s = fresh();
  const b = beginBattle(s, 'boss');
  for (const cmd of [
    'skill:star-slash',
    'skill:unknown',
    'item:unknown',
  ] as const) {
    assert.equal(resolveTurn(s, b, cmd).used, false);
    assert.equal(b.turn, 0);
    assert.equal(s.hp, 100);
    assert.equal(b.hp, 480);
  }
  s.starSword = true;
  assert.equal(resolveTurn(s, b, 'skill:star-slash').used, false);
  b.awakened = true;
  assert.equal(resolveTurn(s, b, 'skill:star-slash').victory, true);
  assert.equal(b.turn, 1);
});
test('inventory only lists owned items; empty or full-HP use consumes nothing', () => {
  const s = fresh();
  const b = beginBattle(s, 'wolf1');
  assert.deepEqual(
    ownedItems(s).map((item) => item.id),
    ['herb'],
  );
  assert.equal(resolveTurn(s, b, 'item:herb').used, false);
  assert.equal(s.herbs, 3);
  assert.equal(b.turn, 0);
  s.herbs = 0;
  s.hp = 10;
  assert.deepEqual(ownedItems(s), []);
  assert.equal(resolveTurn(s, b, 'item:herb').used, false);
  assert.equal(b.turn, 0);
});
for (const scenario of [
  'battle-end',
  'map-change',
  'save-resume',
  'teleport',
] as const) {
  test(`party snaps on first frame of ${scenario}, then resumes smooth following`, () => {
    const s = fresh();
    s.lilia = true;
    s.sword = true;
    const placement = new PartyPlacement();
    placement.update(s, scenario === 'battle-end', 0.016);
    if (scenario === 'map-change') {
      s.map = 'depths';
      s.z = 42;
    }
    if (scenario === 'save-resume') {
      s.x = 3;
      s.z = -12;
      placement.reset();
    }
    if (scenario === 'teleport') {
      s.z = -20;
    }
    const first = placement.update(s, false, 0.016);
    assert.equal(first.snap, true);
    assert.deepEqual(first.companion, { x: s.x - 1.2, y: 0.05, z: s.z + 1.6 });
    assert.deepEqual(first.camera, { x: s.x, y: 0, z: s.z - 2 });
    s.x += 0.1;
    const walking = placement.update(s, false, 0.016);
    assert.equal(walking.snap, false);
    assert.ok(walking.companion.x > first.companion.x);
    assert.ok(walking.companion.x < s.x - 1.2);
    assert.equal(walking.companion.y, 0.05);
  });
}
test('joining resets the rescue position before the next draw', () => {
  const s = fresh();
  const p = new PartyPlacement();
  assert.deepEqual(p.update(s, false, 0.016).companion, { x: 2, y: 0, z: -13 });
  s.lilia = true;
  assert.equal(p.update(s, false, 0.016).snap, true);
  assert.deepEqual(p.companion, { x: -1.2, y: 0.05, z: 28.6 });
});
