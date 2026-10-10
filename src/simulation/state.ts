import { mapHalfWidth } from './exploration';
import { enemies, herb, maps, type EnemyId, type MapId } from './data';
import { canUseSkill, skills, ownedItems } from './abilities';
import type { ChapterProgress } from './chapter';
import {
  actorMaxHP,
  ensureParty,
  resetBattleMP,
  validParty,
} from './progression';
import { resolvePartyTurn } from './party-battle';
export interface State {
  version: 1;
  chapter?: ChapterProgress;
  map: MapId;
  x: number;
  z: number;
  hp: number;
  herbs: number;
  lilia: boolean;
  sword: boolean;
  starSword: boolean;
  complete: boolean;
  flags: string[];
  defeated: EnemyId[];
}
export const fresh = (): State => ({
  version: 1,
  map: 'entrance',
  x: 0,
  z: 27,
  hp: 100,
  herbs: 3,
  lilia: false,
  sword: false,
  starSword: false,
  complete: false,
  flags: [],
  defeated: [],
});
export function liliaHeal(s: State): number {
  if (s.chapter || !s.lilia || s.hp <= 0 || s.hp > 50) return 0;
  const n = Math.min(30, 100 - s.hp);
  s.hp += n;
  return n;
}
export function useHerb(s: State): number {
  if (s.herbs <= 0 || s.hp <= 0 || s.hp >= actorMaxHP(s, 'hero')) return 0;
  s.herbs--;
  const n = Math.min(herb.heal, actorMaxHP(s, 'hero') - s.hp);
  s.hp += n;
  return n;
}
export type Actor = 'hero' | 'lilia';
export type BattleTarget = Actor | 'body' | 'connection:0' | 'connection:1';
export interface Battle {
  connections?: number[];
  enemyActed: boolean;
  actor: Actor;
  acted: Actor[];
  guards: Actor[];
  forgotten: Record<Actor, number>;
  armor: boolean;
  armorAge: number;
  telegraph: boolean;
  id: EnemyId;
  hp: number;
  turn: number;
  awakened: boolean;
  liliaRestTurns: number;
  before: State;
}
export type Command = 'attack' | 'guard' | `item:${string}` | `skill:${string}`;
export interface HPChange {
  target: Actor | 'enemy' | 'connection:0' | 'connection:1';
  amount: number;
  guarded?: boolean;
}
export interface BattlePhase {
  kind: 'ally' | 'enemy' | 'support';
  state: State;
  battle: Battle;
  hpChanges: HPChange[];
  lines: string[];
}
export interface TurnResult {
  phases?: BattlePhase[];
  hpChanges: HPChange[];
  lines: string[];
  victory: boolean;
  defeat: boolean;
  awakening: boolean;
  used: boolean;
}
export function beginBattle(s: State, id: EnemyId): Battle {
  resetBattleMP(s);
  return {
    id,
    connections: enemies[id].connections?.map((c) => c.hp),
    enemyActed: false,
    actor: s.hp > 0 ? 'hero' : 'lilia',
    acted: [],
    guards: [],
    forgotten: { hero: 0, lilia: 0 },
    armor: id === 'bellkeeper',
    armorAge: 0,
    telegraph: false,
    hp: enemies[id].hp,
    turn: 0,
    awakened: false,
    liliaRestTurns: 0,
    before: structuredClone(s),
  };
}
export function resolveTurn(
  s: State,
  b: Battle,
  cmd: Command,
  target?: BattleTarget,
): TurnResult {
  if (s.chapter) return resolvePartyTurn(s, b, cmd, target);
  const e = enemies[b.id];
  const r: TurnResult = {
    lines: [],
    hpChanges: [],
    victory: false,
    defeat: false,
    awakening: false,
    used: true,
  };
  const item = cmd.startsWith('item:')
    ? ownedItems(s).find((item) => `item:${item.id}` === cmd)
    : undefined;
  const skill = cmd.startsWith('skill:')
    ? skills.find((skill) => `skill:${skill.id}` === cmd)
    : undefined;
  if (
    cmd.startsWith('item:') &&
    (!item || (item.conditions.missingHP && s.hp === 100))
  ) {
    r.lines.push(s.herbs === 0 ? '薬草を持っていない。' : 'HP は満タンだ。');
    r.used = false;
    return r;
  }
  if (cmd.startsWith('skill:') && (!skill || !canUseSkill(s, b, skill))) {
    r.used = false;
    return r;
  }
  b.guards = cmd === 'guard' ? ['hero'] : [];
  const capture = (
    kind: BattlePhase['kind'],
    fromHP: number,
    fromLine: number,
  ) => {
    (r.phases ??= []).push({
      kind,
      state: structuredClone(s),
      battle: structuredClone(b),
      hpChanges: r.hpChanges.slice(fromHP),
      lines: r.lines.slice(fromLine),
    });
  };
  const hit = () => {
    const fromHP = r.hpChanges.length,
      fromLine = r.lines.length;
    const damage = cmd === 'guard' ? Math.ceil(e.attack / 2) : e.attack;
    const before = s.hp;
    s.hp = Math.max(0, s.hp - damage);
    r.hpChanges.push({
      target: 'hero',
      amount: s.hp - before,
      guarded: cmd === 'guard',
    });
    r.lines.push(`${e.name}の攻撃。ユウに ${damage} ダメージ。`);
    capture('enemy', fromHP, fromLine);
  };
  const act = () => {
    const fromHP = r.hpChanges.length,
      fromLine = r.lines.length;
    if (cmd === 'attack') {
      const damage = s.starSword ? 42 : 24;
      const before = b.hp;
      b.hp = Math.max(e.boss && !b.awakened ? 1 : 0, b.hp - damage);
      r.hpChanges.push({ target: 'enemy', amount: b.hp - before });
      r.lines.push(`ユウの攻撃。${e.name}に ${damage} ダメージ。`);
    }
    if (cmd === 'guard') r.lines.push('ユウは身を守っている。');
    if (item?.effect.type === 'restore-hp') {
      const n = useHerb(s);
      r.hpChanges.push({ target: 'hero', amount: n });
      r.lines.push(`薬草を使った。HP が ${n} 回復。`);
    }
    if (skill?.effect.type === 'defeat-target') {
      r.hpChanges.push({ target: 'enemy', amount: -b.hp });
      b.hp = 0;
      r.lines.push(`${skill.name}――光の刃が黒い霧を切り裂く！`);
    }
    capture('ally', fromHP, fromLine);
  };
  if (e.speed > 5) {
    hit();
    if (s.hp > 0) act();
  } else {
    act();
    if (b.hp > 0) hit();
  }
  b.turn++;
  r.defeat = s.hp === 0;
  r.victory = b.hp === 0;
  if (!r.defeat) {
    if (b.liliaRestTurns > 0) {
      b.liliaRestTurns--;
      r.lines.push('リリアは手当てのあと、休んでいる。');
    } else {
      const n = liliaHeal(s);
      if (n) {
        r.hpChanges.push({ target: 'hero', amount: n });
        b.liliaRestTurns = 1;
        r.lines.push(`リリアの手当て。HP が ${n} 回復。`);
        capture('support', r.hpChanges.length - 1, r.lines.length - 1);
      }
    }
  }
  if (e.boss && b.turn >= 3 && !b.awakened && !r.defeat && !r.victory)
    r.awakening = true;
  return r;
}
export const SAVE_KEY = 'hoshiken.prologue.v1';
export function validState(v: unknown): v is State {
  if (!v || typeof v !== 'object') return false;
  const s = v as State;
  return (
    s.version === 1 &&
    Object.hasOwn(maps, s.map) &&
    Number.isFinite(s.x) &&
    Math.abs(s.x) <= Math.max(8, mapHalfWidth(s.map)) &&
    Number.isFinite(s.z) &&
    Math.abs(s.z) <= maps[s.map].length / 2 &&
    Number.isInteger(s.hp) &&
    s.hp >= (s.chapter ? 0 : 1) &&
    s.hp <= actorMaxHP(s, 'hero') &&
    Number.isInteger(s.herbs) &&
    s.herbs >= 0 &&
    s.herbs <= 99 &&
    ['lilia', 'sword', 'starSword', 'complete'].every(
      (k) => typeof (s as unknown as Record<string, unknown>)[k] === 'boolean',
    ) &&
    Array.isArray(s.flags) &&
    s.flags.every((f) => typeof f === 'string') &&
    Array.isArray(s.defeated) &&
    s.defeated.every((id) => Object.hasOwn(enemies, id)) &&
    validChapter(s) &&
    (!s.complete || s.starSword) &&
    (!s.lilia || s.sword)
  );
}
export function readSave(): {
  state: State | null;
  error: string | null;
} {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: null, error: null };
    const s = JSON.parse(raw);
    if (!validState(s)) throw Error();
    ensureParty(s);
    return { state: s, error: null };
  } catch {
    return {
      state: null,
      error: 'セーブを読み込めません。新規開始で上書きできます。',
    };
  }
}
export function save(s: State): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function validChapter(s: State): boolean {
  if (s.chapter === undefined)
    return !!['entrance', 'depths', 'temple'].includes(s.map);
  const c = s.chapter;
  return (
    !!c &&
    typeof c === 'object' &&
    [1, 2, 3].includes(c.number) &&
    [
      'arrival',
      'inquiry',
      'rest',
      'office',
      'waterway',
      'sever',
      'core',
      'shutdown',
      'records',
      'return',
      'opening',
      'investigation',
      'belfry',
      'boss',
      'restoration',
      'departure',
      'complete',
    ].includes(c.stage) &&
    typeof c.titleShown === 'boolean' &&
    Number.isInteger(c.liliaHP) &&
    c.liliaHP >= 0 &&
    validParty(s) &&
    c.liliaHP <= actorMaxHP(s, 'lilia') &&
    (s.hp > 0 || c.liliaHP > 0) &&
    s.complete &&
    s.lilia &&
    s.starSword &&
    (c.stage !== 'complete' ||
      (c.number === 2 && s.flags.includes('ch01:complete')) ||
      (c.number === 3 && s.flags.includes('ch02:complete'))) &&
    (c.number !== 2 || s.flags.includes('ch01:complete')) &&
    (c.number !== 3 ||
      (c.stage === 'complete' && s.flags.includes('ch02:complete'))) &&
    (!s.flags.includes('ch02:sever') || s.flags.includes('skill:star-sever'))
  );
}
export function actorHP(s: State, actor: Actor): number {
  return actor === 'hero' ? s.hp : (s.chapter?.liliaHP ?? 0);
}
export function healActor(s: State, actor: Actor, amount: number): number {
  const hp = actorHP(s, actor);
  if (hp <= 0) return 0;
  const healed = Math.min(amount, actorMaxHP(s, actor) - hp);
  if (actor === 'hero') s.hp += healed;
  else if (s.chapter) s.chapter.liliaHP += healed;
  return healed;
}
