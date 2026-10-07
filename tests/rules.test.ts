import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fresh,
  liliaHeal,
  useHerb,
  beginBattle,
  resolveTurn,
  validState,
} from '../src/simulation/state';
test('Lilia heals exactly once at <=50, never revives or heals before joining', () => {
  const s = fresh();
  s.hp = 50;
  assert.equal(liliaHeal(s), 0);
  s.lilia = true;
  assert.equal(liliaHeal(s), 30);
  s.hp = 51;
  assert.equal(liliaHeal(s), 0);
  s.hp = 1;
  assert.equal(liliaHeal(s), 30);
  assert.equal(s.hp, 31);
  s.hp = 0;
  assert.equal(liliaHeal(s), 0);
});
test('herb inventory and cap', () => {
  const s = fresh();
  assert.equal(useHerb(s), 0);
  assert.equal(s.herbs, 3);
  s.hp = 80;
  assert.equal(useHerb(s), 20);
  assert.equal(s.herbs, 2);
  s.hp = 20;
  s.herbs = 0;
  assert.equal(useHerb(s), 0);
});
test('complete turn based: only explicit commands advance', () => {
  const s = fresh();
  const b = beginBattle(s, 'wolf1');
  assert.equal(b.turn, 0);
  assert.equal(s.hp, 100);
  resolveTurn(s, b, 'guard');
  assert.equal(s.hp, 90);
  assert.equal(b.turn, 1);
});
test('faster enemy goes first and lethal attack prevents item action', () => {
  const s = fresh();
  s.hp = 1;
  const b = beginBattle(s, 'moth1');
  const r = resolveTurn(s, b, 'item:herb');
  assert.equal(r.defeat, true);
  assert.equal(s.herbs, 3);
  assert.equal(s.hp, 0);
});
test('Lilia keeps healing beyond three turns without duplication on victory', () => {
  const s = fresh();
  s.lilia = true;
  s.hp = 40;
  const b = beginBattle(s, 'boss');
  for (let i = 0; i < 6; i++) resolveTurn(s, b, 'guard');
  assert.ok(s.hp > 0);
  const s2 = fresh();
  s2.lilia = true;
  s2.hp = 20;
  const b2 = beginBattle(s2, 'rescue');
  b2.hp = 1;
  const r = resolveTurn(s2, b2, 'attack');
  assert.equal(r.victory, true);
  assert.equal(s2.hp, 50);
  assert.equal(r.lines.filter((l) => l.includes('手当て')).length, 1);
});
test('boss cannot die before awakening, even with zero herbs, three turns triggers awakening', () => {
  const s = fresh();
  s.lilia = true;
  s.herbs = 0;
  const b = beginBattle(s, 'boss');
  b.hp = 1;
  for (let i = 0; i < 3; i++) {
    const r = resolveTurn(s, b, 'attack');
    assert.equal(r.victory, false);
    assert.equal(r.awakening, i === 2);
  }
  b.awakened = true;
  s.starSword = true;
  const r = resolveTurn(s, b, 'skill:star-slash');
  assert.equal(r.victory, true);
});
test('retry snapshot restores inventory, HP, and awakening state', () => {
  const s = fresh();
  s.hp = 60;
  const b = beginBattle(s, 'boss');
  resolveTurn(s, b, 'item:herb');
  s.starSword = true;
  const restored = structuredClone(b.before);
  const retried = beginBattle(restored, b.id);
  assert.equal(restored.hp, 60);
  assert.equal(restored.herbs, 3);
  assert.equal(restored.starSword, false);
  assert.equal(retried.awakened, false);
  assert.equal(retried.turn, 0);
});
test('invalid saved states rejected; complete save requires star sword', () => {
  const s = fresh();
  assert.equal(validState(s), true);
  assert.equal(validState({ ...s, hp: NaN }), false);
  assert.equal(validState({ ...s, map: 'village' }), false);
  assert.equal(validState({ ...s, herbs: -1 }), false);
  assert.equal(validState({ ...s, complete: true }), false);
  assert.equal(validState({ ...s, complete: true, starSword: true }), true);
});
