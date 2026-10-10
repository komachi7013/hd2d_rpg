import type { Actor, Battle, State } from './state';
import { actorMP } from './progression';
import { herb } from './data';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  actor: Actor;
  mpCost: number;
  conditions: { starSword: boolean; bossAwakened: boolean };
  effect: { type: 'defeat-target' | 'restore-hp' | 'purify' | 'sever' };
}
export const skills: readonly SkillDefinition[] = [
  {
    id: 'star-sever',
    name: '星断ち',
    actor: 'hero',
    mpCost: 6,
    description: '敵一体に32ダメージ。吸収器の接続を断つ。',
    conditions: { starSword: true, bossAwakened: false },
    effect: { type: 'sever' },
  },
  {
    id: 'star-slash',
    name: '一閃',
    actor: 'hero',
    mpCost: 6,
    description: '霧を払う光の一撃。霧の鎧を解除する。',
    conditions: { starSword: true, bossAwakened: true },
    effect: { type: 'defeat-target' },
  },
  {
    id: 'recovery',
    mpCost: 4,
    name: '回復',
    actor: 'lilia',
    description: '味方一人のHPを42回復する。',
    conditions: { starSword: false, bossAwakened: false },
    effect: { type: 'restore-hp' },
  },
  {
    id: 'prayer',
    mpCost: 3,
    name: '祈り',
    actor: 'lilia',
    description: '戦闘中は味方一人の忘却を解除。戦闘外ではHPを30回復。',
    conditions: { starSword: false, bossAwakened: false },
    effect: { type: 'purify' },
  },
];
export function learnSkill(state: State, id: string): void {
  if (!skills.some((skill) => skill.id === id))
    throw new Error(`Unknown skill: ${id}`);
  const flag = `skill:${id}`;
  if (!state.flags.includes(flag)) state.flags.push(flag);
}
export function learnedSkills(
  state: State,
  actor: Actor = 'hero',
): SkillDefinition[] {
  return skills.filter(
    (skill) =>
      skill.actor === actor &&
      (state.flags.includes(`skill:${skill.id}`) ||
        (skill.id === 'star-slash' && state.starSword) ||
        (skill.id === 'recovery' && !!state.chapter && state.lilia)),
  );
}
export function canUseSkill(
  state: State,
  battle: Battle,
  skill: SkillDefinition,
  actor: Actor = 'hero',
): boolean {
  return (
    (actor === 'hero' ? state.hp : (state.chapter?.liliaHP ?? 0)) > 0 &&
    learnedSkills(state, actor).some((known) => known.id === skill.id) &&
    (!skill.conditions.starSword || state.starSword) &&
    (!skill.conditions.bossAwakened ||
      battle.id !== 'boss' ||
      battle.awakened) &&
    (!battle.forgotten[actor] || skill.id === 'prayer') &&
    (!state.chapter || actorMP(state, actor) >= skill.mpCost)
  );
}
export const items = [
  {
    id: herb.id,
    name: herb.name,
    description: `味方一人のHPを${herb.heal}回復する。戦闘中は1行動を使う。`,
    quantityKey: 'herbs' as const,
    conditions: { missingHP: true },
    effect: { type: 'restore-hp' as const, amount: herb.heal },
  },
];
export function ownedItems(state: State) {
  return items.filter((item) => state[item.quantityKey] > 0);
}
