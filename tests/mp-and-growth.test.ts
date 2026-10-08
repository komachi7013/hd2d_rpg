import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fresh,
  beginBattle,
  resolveTurn,
  healActor,
  useHerb,
  validState,
  readSave,
  SAVE_KEY,
} from '../src/simulation/state';
import { beginChapter, learnPrayer } from '../src/simulation/chapter';
import {
  actorMaxHP,
  actorMaxMP,
  actorMP,
  awardVictory,
  ensureParty,
  spendMP,
} from '../src/simulation/progression';
import { skills, canUseSkill } from '../src/simulation/abilities';
const chapter = () => {
  const s = fresh();
  s.complete = s.sword = s.starSword = s.lilia = true;
  beginChapter(s);
  learnPrayer(s);
  return s;
};

test('each encounter and retry refill MP to the character maximum; HP and level stay intact', () => {
  const s = chapter();
  const party = ensureParty(s)!;
  party.hero.level = 2;
  party.lilia.level = 3;
  party.hero.mp = party.lilia.mp = 0;
  s.hp = 30;
  const b = beginBattle(s, 'mist1');
  assert.equal(actorMP(s, 'hero'), 28);
  assert.equal(actorMP(s, 'lilia'), 34);
  assert.equal(s.hp, 30);
  assert.equal(b.before.chapter?.party?.hero.mp, 28);
  resolveTurn(s, b, 'skill:star-slash');
  assert.equal(actorMP(s, 'hero'), 22);
  const retry = structuredClone(b.before);
  beginBattle(retry, 'mist1');
  assert.equal(actorMP(retry, 'hero'), 28);
  assert.equal(retry.hp, 30);
  beginBattle(s, 'mist2');
  assert.equal(actorMP(s, 'hero'), 28);
});
test('all three skills spend their own actor MP exactly once; items and guard spend none', () => {
  const s = chapter();
  s.hp = 40;
  const b = beginBattle(s, 'bellkeeper');
  resolveTurn(s, b, 'skill:star-slash');
  assert.equal(actorMP(s, 'hero'), 18);
  resolveTurn(s, b, 'skill:recovery', 'hero');
  assert.equal(actorMP(s, 'lilia'), 20);
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'skill:prayer', 'hero');
  assert.equal(actorMP(s, 'lilia'), 17);
  assert.equal(actorMP(s, 'hero'), 18);
});
test('MP shortages, invalid targets and cancellations cannot spend MP, HP, items or turns', () => {
  const s = chapter();
  const b = beginBattle(s, 'bellkeeper');
  ensureParty(s)!.hero.mp = 5;
  const before = JSON.stringify({ s, b });
  assert.equal(canUseSkill(s, b, skills[0]), false);
  const result = resolveTurn(s, b, 'skill:star-slash');
  assert.equal(result.used, false);
  assert.ok(result.lines[0].includes('MP'));
  assert.equal(JSON.stringify({ s, b }), before);
  resolveTurn(s, b, 'guard');
  assert.equal(resolveTurn(s, b, 'skill:recovery', 'hero').used, false);
  assert.equal(actorMP(s, 'lilia'), 24);
  ensureParty(s)!.lilia.mp = 2;
  b.forgotten.hero = 3;
  assert.equal(resolveTurn(s, b, 'skill:prayer', 'hero').used, false);
  assert.equal(b.forgotten.hero, 3);
});
test('faster enemy KO cancels the selected skill without charging MP', () => {
  const s = chapter();
  s.hp = 1;
  const b = beginBattle(s, 'mist2');
  const r = resolveTurn(s, b, 'skill:star-slash');
  assert.equal(s.hp, 0);
  assert.equal(actorMP(s, 'hero'), 24);
  assert.equal(b.hp, 145);
  assert.deepEqual(r.hpChanges, [
    { target: 'hero', amount: -1, guarded: false },
  ]);
});
test('XP is granted once per defeated encounter; both maximum HP and MP grow and caps follow levels', () => {
  const s = chapter();
  s.hp = 80;
  s.chapter!.liliaHP = 70;
  awardVictory(s, 'mist1');
  awardVictory(s, 'mist1');
  assert.equal(s.chapter?.party?.hero.xp, 30);
  const lines = awardVictory(s, 'mist2');
  assert.ok(lines.some((line) => line.includes('レベル 2')));
  assert.equal(actorMaxHP(s, 'hero'), 112);
  assert.equal(actorMaxHP(s, 'lilia'), 110);
  assert.equal(actorMaxMP(s, 'hero'), 28);
  assert.equal(actorMaxMP(s, 'lilia'), 29);
  assert.equal(s.hp, 92);
  assert.equal(s.chapter?.liliaHP, 80);
  s.hp = 106;
  assert.equal(useHerb(s), 6);
  assert.equal(s.hp, 112);
  assert.equal(healActor(s, 'lilia', 42), 30);
  assert.equal(s.chapter?.liliaHP, 110);
  assert.equal(validState(JSON.parse(JSON.stringify(s))), true);
  awardVictory(s, 'bellkeeper');
  assert.equal(s.chapter?.party?.hero.level, 3);
});
test('old chapter saves receive level-one full MP without losing HP or learned skills', () => {
  const s = chapter();
  delete s.chapter!.party;
  s.hp = 54;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (key === SAVE_KEY ? JSON.stringify(s) : null),
    },
  });
  try {
    const loaded = readSave();
    assert.equal(loaded.error, null);
    assert.equal(loaded.state?.hp, 54);
    assert.equal(loaded.state?.chapter?.party?.lilia.mp, 24);
    assert.ok(loaded.state?.flags.includes('skill:prayer'));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
  assert.equal(spendMP(s, 'lilia', 3), true);
  assert.equal(actorMP(s, 'lilia'), 21);
});
test('corrupt progression and MP cannot enter save data', () => {
  const s = chapter();
  for (const invalid of [
    null,
    {},
    { level: 0, xp: 0, mp: 24 },
    { level: 1, xp: 40, mp: 24 },
    { level: 1, xp: 0, mp: 25 },
    { level: 1, xp: 0, mp: -1 },
  ]) {
    const copy = structuredClone(s);
    copy.chapter!.party!.hero = invalid as never;
    assert.equal(validState(copy), false);
  }
});
test('HP feedback records individual damage and recovery, even in the same round', () => {
  const s = chapter();
  s.hp = 40;
  const b = beginBattle(s, 'mist1');
  resolveTurn(s, b, 'guard');
  const result = resolveTurn(s, b, 'skill:recovery', 'hero');
  assert.deepEqual(result.hpChanges, [
    { target: 'hero', amount: 42 },
    { target: 'hero', amount: -7, guarded: true },
  ]);
  assert.equal(s.hp, 75);
  const next = resolveTurn(s, b, 'attack');
  assert.deepEqual(next.hpChanges, [{ target: 'enemy', amount: -42 }]);
});
