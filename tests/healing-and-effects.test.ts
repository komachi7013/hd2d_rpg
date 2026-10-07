import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, beginBattle, resolveTurn } from '../src/simulation/state';
import { AwakeningEffects } from '../src/render/awakening-effects';

test('healing rests exactly the following turn, then resumes checking without a count limit', () => {
  const s = fresh();
  s.lilia = true;
  const b = beginBattle(s, 'wolf1');
  for (let turn = 1; turn <= 7; turn++) {
    s.hp = 20;
    const result = resolveTurn(s, b, 'guard');
    assert.equal(
      result.lines.some((line) => line.includes('HP が 30 回復')),
      turn % 2 === 1,
    );
    assert.equal(s.hp, turn % 2 === 1 ? 40 : 10);
    assert.equal(b.liliaRestTurns, turn % 2 === 1 ? 1 : 0);
  }
});
test('invalid actions do not spend the rest turn; winning during rest does not heal twice', () => {
  const s = fresh();
  s.lilia = true;
  s.hp = 20;
  const b = beginBattle(s, 'wolf1');
  resolveTurn(s, b, 'guard');
  assert.equal(b.liliaRestTurns, 1);
  s.herbs = 0;
  assert.equal(resolveTurn(s, b, 'item:herb').used, false);
  assert.equal(b.turn, 1);
  assert.equal(b.liliaRestTurns, 1);
  b.hp = 1;
  const result = resolveTurn(s, b, 'attack');
  assert.equal(result.victory, true);
  assert.equal(s.hp, 40);
  assert.equal(
    result.lines.some((line) => line.includes('手当て。')),
    false,
  );
});
test('a new battle or retry starts eligible regardless of the previous battle rest state', () => {
  const s = fresh();
  s.lilia = true;
  s.hp = 20;
  const b = beginBattle(s, 'wolf1');
  resolveTurn(s, b, 'guard');
  assert.equal(b.liliaRestTurns, 1);
  const next = beginBattle(s, 'wolf2');
  assert.equal(next.liliaRestTurns, 0);
  s.hp = 20;
  assert.ok(
    resolveTurn(s, next, 'guard').lines.some((line) =>
      line.includes('手当て。'),
    ),
  );
  const restored = structuredClone(b.before);
  const retry = beginBattle(restored, b.id);
  assert.equal(retry.liliaRestTurns, 0);
  assert.ok(
    resolveTurn(restored, retry, 'guard').lines.some((line) =>
      line.includes('手当て。'),
    ),
  );
});
test('pendant and awakening each last 1500ms and expire without dialogue input', () => {
  const effects = new AwakeningEffects();
  assert.equal(effects.sample(0).phase, null);
  effects.start(100);
  assert.equal(effects.sample(100).phase, 'pendant');
  assert.equal(effects.sample(1599).phase, 'pendant');
  assert.equal(effects.sample(1600).phase, 'awakening');
  assert.equal(effects.sample(3099).phase, 'awakening');
  assert.equal(effects.sample(3100).phase, null);
  assert.equal(effects.sample(10000).phase, null);
});
test('presentation reset removes pending light and a new awakening uses a fresh clock', () => {
  const effects = new AwakeningEffects();
  effects.start(0);
  effects.reset();
  assert.equal(effects.sample(1600).phase, null);
  effects.start(5000);
  assert.equal(effects.sample(6000).phase, 'pendant');
  assert.equal(effects.sample(7000).phase, 'awakening');
  assert.equal(effects.sample(8000).phase, null);
});
