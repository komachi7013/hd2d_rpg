import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fresh,
  beginBattle,
  resolveTurn,
  validState,
  healActor,
  type BattleTarget,
  type Command,
} from '../src/simulation/state';
import {
  beginChapter,
  depart,
  mark,
  relocate,
} from '../src/simulation/chapter';
import {
  beginSecondChapter,
  secondEvent,
  finishSecondEvent,
  secondRest,
  collectorVictory,
  departSecondChapter,
} from '../src/simulation/chapter-two';
import { learnSkill, learnedSkills } from '../src/simulation/abilities';
import {
  awardVictory,
  actorMP,
  actorMaxHP,
} from '../src/simulation/progression';
function seed() {
  const s = fresh();
  s.complete = s.starSword = s.sword = s.lilia = true;
  beginChapter(s);
  learnSkill(s, 'prayer');
  mark(s, 'ch01:emblem');
  depart(s);
  return s;
}
function prepared() {
  const s = seed();
  beginSecondChapter(s);
  mark(s, 'ch02:title');
  s.chapter!.titleShown = true;
  learnSkill(s, 'star-sever');
  mark(s, 'ch02:sever');
  s.herbs = 0;
  for (const flag of [
    'arrival',
    'manifest',
    'rest-entry',
    'office',
    'flow',
    'core',
  ])
    mark(s, `ch02:${flag}`);
  relocate(s, 'merca-core');
  return s;
}
test('second chapter entry preserves first chapter HP, MP, levels, XP, items and title flags', () => {
  const s = seed();
  mark(s, 'ch01:title');
  s.hp = 23;
  s.chapter!.liliaHP = 71;
  s.chapter!.party!.hero.mp = 5;
  s.chapter!.party!.hero.xp = 17;
  assert.equal(beginSecondChapter(s), true);
  assert.equal(s.hp, 23);
  assert.equal(s.chapter!.liliaHP, 71);
  assert.equal(actorMP(s, 'hero'), 5);
  assert.equal(s.chapter!.party!.hero.xp, 17);
  assert.equal(s.chapter!.titleShown, false);
  assert.ok(s.flags.includes('ch01:title'));
  assert.equal(s.map, 'merca');
  assert.ok(validState(s));
  assert.equal(beginSecondChapter(s), false);
});
test('mandatory sequence grants skill atomically, preserves conversations on reload and restores only once', () => {
  const s = seed();
  beginSecondChapter(s);
  for (const map of [
    'merca',
    'merca-depot',
    'merca-office',
    'merca-waterway',
    'merca-core',
  ] as const) {
    relocate(s, map);
    if (map === 'merca-waterway') s.z = -20;
    for (let i = 0; i < 5; i++) {
      const e = secondEvent(s);
      if (!e) break;
      assert.deepEqual(secondEvent(JSON.parse(JSON.stringify(s))), e);
      finishSecondEvent(s, e);
      assert.ok(validState(s));
    }
  }
  assert.ok(s.flags.includes('ch02:flow'));
  assert.ok(s.flags.includes('ch02:sever'));
  assert.deepEqual(
    learnedSkills(s)
      .map((k) => k.name)
      .sort(),
    ['一閃', '星断ち'].sort(),
  );
  s.hp = 20;
  s.chapter!.party!.hero.mp = 2;
  secondRest(s, 'ch02:rest-entry');
  assert.equal(s.hp, 20);
  assert.equal(actorMP(s, 'hero'), 2);
});
test('absorbers take individual damage; sever removes one connection without removing the barrier early', () => {
  const s = prepared();
  const b = beginBattle(s, 'ch02-collector');
  resolveTurn(s, b, 'skill:star-slash', 'body');
  assert.equal(b.hp, 328);
  resolveTurn(s, b, 'attack', 'connection:0');
  assert.deepEqual(b.connections, [42, 64]);
  b.forgotten.hero = 0;
  resolveTurn(s, b, 'skill:star-sever', 'connection:0');
  assert.deepEqual(b.connections, [0, 64]);
  resolveTurn(s, b, 'attack', 'body');
  assert.equal(b.hp, 317);
  const mp = actorMP(s, 'hero');
  assert.equal(
    resolveTurn(s, b, 'skill:star-sever', 'connection:0').used,
    false,
  );
  assert.equal(actorMP(s, 'hero'), mp);
  resolveTurn(s, b, 'skill:star-sever', 'connection:1');
  assert.deepEqual(b.connections, [0, 0]);
  resolveTurn(s, b, 'attack', 'body');
  assert.equal(b.hp, 295);
});
for (const route of ['sever', 'attack', 'ignore', 'empty-mp'] as const)
  test(`Lv1, zero herbs collector victory: ${route}`, () => {
    const s = prepared();
    const b = beginBattle(s, 'ch02-collector');
    if (route === 'empty-mp') s.chapter!.party!.hero.mp = 0;
    let won = false;
    for (let i = 0; i < 160; i++) {
      let cmd: Command = 'attack';
      let target: BattleTarget = 'body';
      if (b.actor === 'hero') {
        const active = b.connections!.findIndex((hp) => hp > 0);
        if (route !== 'ignore' && active >= 0) {
          target = `connection:${active}` as BattleTarget;
          if (route === 'sever' && !b.forgotten.hero && actorMP(s, 'hero') >= 6)
            cmd = 'skill:star-sever';
        } else if (!b.forgotten.hero && actorMP(s, 'hero') >= 6)
          cmd = 'skill:star-slash';
        if (b.telegraph && s.hp <= 36) cmd = 'guard';
      } else {
        if (s.hp <= 64 && s.hp > 0 && actorMP(s, 'lilia') >= 4) {
          cmd = 'skill:recovery';
          target = 'hero';
        } else if (s.chapter!.liliaHP <= 54 && actorMP(s, 'lilia') >= 4) {
          cmd = 'skill:recovery';
          target = 'lilia';
        } else if (
          b.forgotten.hero &&
          route === 'sever' &&
          actorMP(s, 'lilia') >= 3
        ) {
          cmd = 'skill:prayer';
          target = 'hero';
        } else if (b.telegraph) cmd = 'guard';
      }
      const r = resolveTurn(s, b, cmd, target);
      assert.ok(r.used, r.lines.join(' '));
      assert.equal(r.defeat, false);
      if (r.victory) {
        won = true;
        break;
      }
    }
    assert.ok(won);
    assert.equal(b.hp, 0);
  });
test('collector acts once per round, telegraphs area damage, guards and naturally expires forgetfulness', () => {
  const s = prepared();
  const b = beginBattle(s, 'ch02-collector');
  resolveTurn(s, b, 'guard');
  assert.equal(s.hp, 100);
  resolveTurn(s, b, 'guard');
  assert.equal(s.hp, 95);
  assert.equal(b.forgotten.hero, 3);
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'guard');
  assert.equal(b.telegraph, true);
  assert.equal(s.hp, 88);
  resolveTurn(s, b, 'guard');
  const r = resolveTurn(s, b, 'guard');
  assert.equal(s.hp, 76);
  assert.equal(s.chapter!.liliaHP, 88);
  assert.equal(r.hpChanges.length, 2);
  b.connections = [0, 0];
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'guard');
  assert.equal(b.forgotten.hero, 0);
});
test('post-victory saves resume rescue, shutdown and records with no duplicate XP and no healing resurrection', () => {
  const s = prepared();
  s.hp = 0;
  s.chapter!.liliaHP = 23;
  assert.equal(healActor(s, 'hero', 42), 0);
  awardVictory(s, 'ch02-collector');
  collectorVictory(s);
  assert.ok(validState(s));
  assert.equal(awardVictory(s, 'ch02-collector').length, 0);
  const xp = structuredClone(s.chapter!.party);
  for (const flag of [
    'ch02:rescue',
    'ch02:shutdown',
    'ch02:records',
    'ch02:return',
  ]) {
    if (flag === 'ch02:records') {
      relocate(s, 'merca-core');
      mark(s, 'ch02:core');
    }
    const e = secondEvent(s)!;
    assert.equal(e.flag, flag);
    const loaded = JSON.parse(JSON.stringify(s));
    assert.ok(validState(loaded));
    assert.deepEqual(secondEvent(loaded), e);
    finishSecondEvent(s, e);
  }
  assert.equal(s.hp, 1);
  assert.deepEqual(s.chapter!.party, xp);
  relocate(s, 'merca-depot');
  finishSecondEvent(s, secondEvent(s)!);
  assert.equal(s.hp, actorMaxHP(s, 'hero'));
  assert.equal(departSecondChapter(s), true);
  assert.equal(s.map, 'north-road');
  assert.equal(s.chapter!.number, 3);
  assert.ok(validState(s));
});
test('retry snapshot retains learned sever, initial HP, progression and herbs, and refills MP', () => {
  const s = prepared();
  s.hp = 53;
  s.herbs = 2;
  const b = beginBattle(s, 'ch02-collector');
  resolveTurn(s, b, 'skill:star-sever', 'connection:0');
  const retry = structuredClone(b.before);
  const rb = beginBattle(retry, b.id);
  assert.equal(retry.hp, 53);
  assert.equal(retry.herbs, 2);
  assert.equal(actorMP(retry, 'hero'), 24);
  assert.ok(retry.flags.includes('skill:star-sever'));
  assert.deepEqual(rb.connections, [64, 64]);
});
