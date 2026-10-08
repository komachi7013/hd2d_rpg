import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fresh,
  beginBattle,
  resolveTurn,
  validState,
  liliaHeal,
} from '../src/simulation/state';
import {
  learnedSkills,
  skills,
  canUseSkill,
} from '../src/simulation/abilities';
import {
  beginChapter,
  finishChapterTitle,
  learnPrayer,
  rescueSpirit,
  restoreBarrier,
  identifyEmblem,
  depart,
} from '../src/simulation/chapter';

function chapter() {
  const s = fresh();
  s.complete = s.starSword = s.sword = s.lilia = true;
  s.defeated = ['boss'];
  beginChapter(s);
  return s;
}
test('legacy completed prologue migrates once; title completion and playable party persist', () => {
  const s = chapter();
  assert.equal(s.map, 'village');
  assert.equal(s.chapter?.titleShown, false);
  assert.equal(validState(s), true);
  s.chapter!.liliaHP = 64;
  beginChapter(s);
  assert.equal(s.chapter?.liliaHP, 64);
  finishChapterTitle(s);
  finishChapterTitle(s);
  assert.equal(s.flags.filter((f) => f === 'ch01:title').length, 1);
  const saved = JSON.parse(JSON.stringify(s));
  assert.equal(validState(saved), true);
  assert.equal(saved.chapter.titleShown, true);
  assert.deepEqual(
    learnedSkills(saved, 'lilia').map((skill) => skill.name),
    ['回復'],
  );
  assert.equal(liliaHeal(s), 0);
});
test('party chooses both actions; healing targets one ally and invalid choices consume nothing', () => {
  const s = chapter();
  s.hp = 40;
  s.chapter!.liliaHP = 50;
  const b = beginBattle(s, 'mist1');
  resolveTurn(s, b, 'guard');
  assert.equal(b.actor, 'lilia');
  assert.equal(b.turn, 0);
  assert.equal(resolveTurn(s, b, 'skill:star-slash').used, false);
  assert.equal(resolveTurn(s, b, 'skill:recovery').used, false);
  const r = resolveTurn(s, b, 'skill:recovery', 'hero');
  assert.equal(r.used, true);
  assert.equal(s.hp, 75); // 42 recovery, then guarded 14/2 enemy damage
  assert.equal(s.chapter?.liliaHP, 50);
  assert.equal(b.turn, 1);
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'skill:recovery', 'lilia');
  assert.equal(s.chapter?.liliaHP, 78); // 50+42-14, no extra NPC heal
  assert.equal(s.hp, 75);
});
test('prayer is learned once; mist armor breaks without one-shot; forgetting is curable', () => {
  const s = chapter();
  learnPrayer(s);
  learnPrayer(s);
  assert.equal(s.flags.filter((f) => f === 'skill:prayer').length, 1);
  const b = beginBattle(s, 'bellkeeper');
  assert.equal(b.armor, true);
  const r = resolveTurn(s, b, 'skill:star-slash');
  assert.equal(r.victory, false);
  assert.equal(b.hp, 296);
  assert.equal(b.armor, false);
  resolveTurn(s, b, 'attack');
  assert.equal(b.forgotten.hero, 3);
  assert.equal(canUseSkill(s, b, skills[0]), false);
  assert.equal(resolveTurn(s, b, 'skill:star-slash').used, false);
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'skill:prayer', 'hero');
  assert.equal(b.forgotten.hero, 0);
  assert.equal(b.armor, true);
  assert.equal(b.telegraph, true);
});
test('telegraphed area attack honors each guard and retry restores both HP and items', () => {
  const s = chapter();
  learnPrayer(s);
  const b = beginBattle(s, 'bellkeeper');
  b.telegraph = true;
  resolveTurn(s, b, 'guard');
  resolveTurn(s, b, 'guard');
  assert.equal(s.hp, 87);
  assert.equal(s.chapter?.liliaHP, 87);
  assert.equal(b.telegraph, false);
  assert.equal(b.before.hp, 100);
  assert.equal(b.before.chapter?.liliaHP, 100);
  assert.equal(b.before.herbs, 3);
});
test('zero-resource boss can be won through attack, prayer, recovery and guard', () => {
  const s = chapter();
  learnPrayer(s);
  s.herbs = 0;
  const b = beginBattle(s, 'bellkeeper');
  let win = false;
  for (let i = 0; i < 80; i++) {
    const cmd =
      b.actor === 'hero'
        ? b.forgotten.hero
          ? 'attack'
          : b.armor
            ? 'skill:star-slash'
            : 'attack'
        : b.forgotten.hero
          ? 'skill:prayer'
          : s.hp <= 65
            ? 'skill:recovery'
            : s.chapter!.liliaHP <= 65
              ? 'skill:recovery'
              : b.telegraph
                ? 'guard'
                : 'attack';
    const target =
      cmd === 'skill:prayer'
        ? 'hero'
        : cmd === 'skill:recovery'
          ? s.hp <= 65
            ? 'hero'
            : 'lilia'
          : undefined;
    const r = resolveTurn(s, b, cmd, target);
    assert.equal(r.used, true);
    assert.equal(r.defeat, false);
    if (r.victory) {
      win = true;
      break;
    }
  }
  assert.equal(win, true);
  assert.ok(b.turn > 3);
});
test('prayer remains available on a forgotten Lilia; KO never revives and surviving ally acts', () => {
  const s = chapter();
  learnPrayer(s);
  const b = beginBattle(s, 'mist1');
  s.hp = 0;
  b.actor = 'lilia';
  b.forgotten.lilia = 2;
  assert.equal(resolveTurn(s, b, 'skill:recovery', 'hero').used, false);
  assert.equal(resolveTurn(s, b, 'skill:prayer', 'lilia').used, true);
  assert.equal(b.forgotten.lilia, 0);
  assert.equal(s.hp, 0);
  assert.equal(b.actor, 'lilia');
  assert.equal(validState(s), true);
});
test('restoration and departure survive reloads and carry HP, skills and inventory to chapter two', () => {
  const s = chapter();
  finishChapterTitle(s);
  learnPrayer(s);
  s.map = 'sanctum';
  s.z = -5;
  s.herbs = 2;
  s.chapter!.liliaHP = 77;
  rescueSpirit(s);
  rescueSpirit(s);
  assert.equal(s.defeated.filter((id) => id === 'bellkeeper').length, 1);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(validState(restored), true);
  assert.equal(restored.chapter.stage, 'restoration');
  restoreBarrier(restored);
  assert.equal(restored.map, 'village');
  identifyEmblem(restored);
  depart(restored);
  depart(restored);
  assert.equal(restored.chapter.number, 2);
  assert.equal(restored.chapter.stage, 'complete');
  assert.equal(restored.chapter.liliaHP, 77);
  assert.equal(restored.herbs, 2);
  assert.equal(restored.map, 'road');
  assert.equal(validState(restored), true);
  assert.equal(
    restored.flags.filter((f: string) => f === 'ch01:complete').length,
    1,
  );
  assert.deepEqual(
    learnedSkills(restored, 'lilia').map((skill) => skill.name),
    ['回復', '祈り'],
  );
  assert.deepEqual(
    learnedSkills(restored).map((skill) => skill.name),
    ['一閃'],
  );
});
test('malformed chapter payloads do not silently drop party state', () => {
  const s = chapter();
  for (const bad of [
    null,
    {},
    { ...s.chapter, liliaHP: 101 },
    { ...s.chapter, stage: 'other' },
    { ...s.chapter, number: 2 },
  ]) {
    assert.equal(validState({ ...s, chapter: bad }), false);
  }
});

test('faster chapter enemies act first once per round and KO prevents the chosen action', () => {
  const s = chapter();
  s.hp = 10;
  const b = beginBattle(s, 'mist2');
  const first = resolveTurn(s, b, 'attack');
  assert.equal(first.used, true);
  assert.equal(first.defeat, false);
  assert.equal(s.hp, 0);
  assert.equal(b.hp, 145);
  assert.equal(b.actor, 'lilia');
  resolveTurn(s, b, 'guard');
  assert.equal(s.chapter?.liliaHP, 100);
  assert.equal(b.turn, 1);
  assert.equal(b.enemyActed, false);
  resolveTurn(s, b, 'guard');
  assert.equal(s.chapter?.liliaHP, 92);
  assert.equal(b.turn, 2);
});
