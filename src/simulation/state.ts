import { enemies, herb, maps, type EnemyId, type MapId } from './data';
import { canUseSkill, skills, ownedItems } from './abilities';
export interface State {
  version: 1;
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
  if (!s.lilia || s.hp <= 0 || s.hp > 50) return 0;
  const n = Math.min(30, 100 - s.hp);
  s.hp += n;
  return n;
}
export function useHerb(s: State): number {
  if (s.herbs <= 0 || s.hp <= 0 || s.hp === 100) return 0;
  s.herbs--;
  const n = Math.min(herb.heal, 100 - s.hp);
  s.hp += n;
  return n;
}
export interface Battle {
  id: EnemyId;
  hp: number;
  turn: number;
  awakened: boolean;
  liliaRestTurns: number;
  before: State;
}
export type Command = 'attack' | 'guard' | `item:${string}` | `skill:${string}`;
export interface TurnResult {
  lines: string[];
  victory: boolean;
  defeat: boolean;
  awakening: boolean;
  used: boolean;
}
export function beginBattle(s: State, id: EnemyId): Battle {
  return {
    id,
    hp: enemies[id].hp,
    turn: 0,
    awakened: false,
    liliaRestTurns: 0,
    before: structuredClone(s),
  };
}
export function resolveTurn(s: State, b: Battle, cmd: Command): TurnResult {
  const e = enemies[b.id];
  const r: TurnResult = {
    lines: [],
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
  const hit = () => {
    const damage = cmd === 'guard' ? Math.ceil(e.attack / 2) : e.attack;
    s.hp = Math.max(0, s.hp - damage);
    r.lines.push(`${e.name}の攻撃。ユウに ${damage} ダメージ。`);
  };
  const act = () => {
    if (cmd === 'attack') {
      const damage = s.starSword ? 42 : 24;
      b.hp = Math.max(e.boss && !b.awakened ? 1 : 0, b.hp - damage);
      r.lines.push(`ユウの攻撃。${e.name}に ${damage} ダメージ。`);
    }
    if (cmd === 'guard') r.lines.push('ユウは身を守っている。');
    if (item?.effect.type === 'restore-hp') {
      const n = useHerb(s);
      r.lines.push(`薬草を使った。HP が ${n} 回復。`);
    }
    if (skill?.effect.type === 'defeat-target') {
      b.hp = 0;
      r.lines.push(`${skill.name}――光の刃が黒い霧を切り裂く！`);
    }
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
        b.liliaRestTurns = 1;
        r.lines.push(`リリアの手当て。HP が ${n} 回復。`);
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
    Math.abs(s.x) <= 8 &&
    Number.isFinite(s.z) &&
    Math.abs(s.z) <= maps[s.map].length / 2 &&
    Number.isInteger(s.hp) &&
    s.hp >= 1 &&
    s.hp <= 100 &&
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
