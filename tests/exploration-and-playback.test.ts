import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartyPlacement } from '../src/render/party-placement';
import {
  CombatPlayback,
  IMPACT_MS,
  ACTION_MS,
  BETWEEN_ACTIONS_MS,
} from '../src/render/combat-playback';
import {
  EncounterMovement,
  npcPatrol,
  intersects,
} from '../src/simulation/exploration';
import { riverBlocked, townBuildings } from '../src/render/town-layout';
import {
  fresh,
  beginBattle,
  resolveTurn,
  validState,
} from '../src/simulation/state';
import { beginChapter } from '../src/simulation/chapter';
import { battleStatuses } from '../src/ui/status-icons';
test('follower stays on the actual route around a right-angle corner, with a distance gap', () => {
  const s = fresh();
  s.sword = s.lilia = true;
  s.x = 0;
  s.z = 0;
  const p = new PartyPlacement();
  p.update(s, false, 0.1);
  for (let i = 0; i < 20; i++) {
    s.z -= 0.1;
    p.update(s, false, 0.1);
  }
  assert.ok(Math.abs(p.companion.z - (s.z + 1.6)) < 1e-8);
  assert.equal(p.companion.x, 0);
  for (let i = 0; i < 10; i++) {
    s.x += 0.1;
    p.update(s, false, 0.1);
  }
  assert.equal(p.companion.x, 0);
  assert.ok(Math.abs(p.companion.z + 1.4) < 1e-8);
  for (let i = 0; i < 20; i++) {
    s.x += 0.1;
    p.update(s, false, 0.1);
  }
  assert.ok(Math.abs(p.companion.x - 1.4) < 1e-8);
  assert.ok(Math.abs(p.companion.z + 2) < 1e-8);
  assert.equal(p.companionDirection, 2);
  const still = { ...p.companion };
  p.update(s, false, 1);
  assert.deepEqual(p.companion, still);
});
test('combat snapshots separate ally damage from enemy damage; playback cannot impact both simultaneously', () => {
  const s = fresh();
  s.sword = true;
  const b = beginBattle(s, 'wolf1');
  const r = resolveTurn(s, b, 'attack');
  assert.deepEqual(
    r.phases!.map((p) => p.kind),
    ['ally', 'enemy'],
  );
  assert.equal(r.phases![0].state.hp, 100);
  assert.equal(r.phases![0].battle.hp, 61);
  assert.equal(r.phases![1].state.hp, 81);
  const events: string[] = [];
  const playback = new CombatPlayback(
    r.phases!,
    (p) => events.push('start:' + p.kind),
    (p) => events.push('impact:' + p.kind),
    () => events.push('done'),
  );
  playback.update(0);
  playback.update(IMPACT_MS - 1);
  assert.deepEqual(events, ['start:ally']);
  playback.update(IMPACT_MS);
  assert.deepEqual(events, ['start:ally', 'impact:ally']);
  playback.update(ACTION_MS);
  assert.equal(events.length, 2);
  playback.update(ACTION_MS + BETWEEN_ACTIONS_MS);
  playback.update(ACTION_MS + BETWEEN_ACTIONS_MS + 1);
  assert.equal(events.at(-1), 'start:enemy');
  playback.update(ACTION_MS + BETWEEN_ACTIONS_MS + IMPACT_MS + 1);
  assert.equal(events.at(-1), 'impact:enemy');
});
test('fast enemies retain first strike, while killing an enemy removes its response phase', () => {
  const s = fresh();
  s.sword = true;
  let b = beginBattle(s, 'moth1');
  assert.deepEqual(
    resolveTurn(s, b, 'attack').phases!.map((p) => p.kind),
    ['enemy', 'ally'],
  );
  b = beginBattle(s, 'wolf1');
  b.hp = 10;
  assert.deepEqual(
    resolveTurn(s, b, 'attack').phases!.map((p) => p.kind),
    ['ally'],
  );
});
test('party enemy response only follows both alive allies, and its phase is separate', () => {
  const s = fresh();
  s.complete = s.starSword = s.sword = s.lilia = true;
  beginChapter(s);
  const b = beginBattle(s, 'mist1');
  assert.deepEqual(
    resolveTurn(s, b, 'attack').phases!.map((p) => p.kind),
    ['ally'],
  );
  assert.deepEqual(
    resolveTurn(s, b, 'attack').phases!.map((p) => p.kind),
    ['ally', 'enemy'],
  );
});
test('patrol stops facing front between right and left directional movement', () => {
  assert.deepEqual(npcPatrol(0), { offset: 0, direction: 0, moving: false });
  assert.equal(npcPatrol(4).direction, 2);
  assert.equal(npcPatrol(4).moving, true);
  assert.deepEqual(npcPatrol(6), { offset: 1.4, direction: 0, moving: false });
  assert.equal(npcPatrol(9).direction, 1);
  assert.equal(npcPatrol(11).direction, 0);
});
test('forest monsters approach nearby heroes, obey props, and story rescue enemy stays put', () => {
  const movement = new EncounterMovement();
  movement.reset('depths');
  movement.update('depths', 0, 26, 1, [], () => true);
  assert.equal(movement.positions.get('wolf1')!.z, 24.25);
  movement.update('depths', 0, 26, 1, [], () => false);
  assert.equal(movement.positions.get('wolf1')!.z, 24.25);
  movement.reset('entrance');
  movement.update('entrance', 1, -8, 1, [], () => true);
  assert.deepEqual(movement.positions.get('rescue'), { x: 1, z: -12 });
});
test('town houses have different silhouettes and footprints; river admits only bridge crossings', () => {
  assert.ok(new Set(townBuildings('merca').map((h) => h.asset)).size >= 4);
  assert.equal(intersects(9, 20, townBuildings('merca')[0]), true);
  assert.equal(intersects(0, 20, townBuildings('merca')[0]), false);
  assert.equal(riverBlocked('merca', -7, 3), true);
  assert.equal(riverBlocked('merca', -7, 14), false);
  assert.equal(riverBlocked('village', -7, 3), false);
  const s = fresh();
  s.complete = s.starSword = s.sword = s.lilia = true;
  beginChapter(s);
  s.x = 17;
  assert.equal(validState(s), true);
});
test('status icons follow actual guard, forgetfulness, armor and warning rather than inventing effects', () => {
  const s = fresh();
  const b = beginBattle(s, 'bellkeeper');
  b.guards = ['hero'];
  b.forgotten.lilia = 3;
  b.telegraph = true;
  const icons = battleStatuses(s, b);
  assert.equal(icons.hero[0].id, 'guard');
  assert.equal(icons.lilia[0].count, 3);
  assert.deepEqual(
    icons.enemy.map((i) => i.id),
    ['armor', 'warning'],
  );
  b.guards = [];
  b.forgotten.lilia = 0;
  b.armor = false;
  b.telegraph = false;
  assert.deepEqual(battleStatuses(s, b), { hero: [], lilia: [], enemy: [] });
});

test('world collision blocks prop and NPC feet, while an old save inside a new prop can escape', async () => {
  const { World } = await import('../src/render/world');
  const collisionWorld = {
    map: 'merca',
    obstacles: [{ x: 3, z: 3, r: 0.5 }],
    npcs: new Map([['courier', { position: { x: 0, z: 7 } }]]),
  };
  const walk = (x: number, z: number, fromX?: number, fromZ?: number) =>
    World.prototype.walkable.call(
      collisionWorld as unknown as World,
      x,
      z,
      fromX,
      fromZ,
    );
  assert.equal(walk(3, 3), false);
  assert.equal(walk(0, 7), false);
  assert.equal(walk(1.5, 7), true);
  assert.equal(walk(3.2, 3, 3, 3), true);
  assert.equal(walk(3, 3, 3.2, 3), false);
  assert.equal(walk(-7, 3), false);
  assert.equal(walk(-7, 14), true);
});
