import type { Battle, State } from './state';
import { herb } from './data';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  conditions: { starSword: boolean; bossAwakened: boolean };
  effect: { type: 'defeat-target' };
}
export const skills: readonly SkillDefinition[] = [
  {
    id: 'star-slash',
    name: '一閃',
    description: '光の刃で黒い霧を切り裂く。消耗品を使わず敵を撃破する。',
    conditions: { starSword: true, bossAwakened: true },
    effect: { type: 'defeat-target' },
  },
];
export function learnSkill(state: State, id: string): void {
  if (!skills.some((skill) => skill.id === id))
    throw new Error(`Unknown skill: ${id}`);
  const flag = `skill:${id}`;
  if (!state.flags.includes(flag)) state.flags.push(flag);
}
export function learnedSkills(state: State): SkillDefinition[] {
  return skills.filter(
    (skill) =>
      state.flags.includes(`skill:${skill.id}`) ||
      // Version-1 saves from before skill lists stored this acquisition in starSword.
      (skill.id === 'star-slash' && state.starSword),
  );
}
export function canUseSkill(
  state: State,
  battle: Battle,
  skill: SkillDefinition,
): boolean {
  return (
    state.hp > 0 &&
    learnedSkills(state).some((known) => known.id === skill.id) &&
    (!skill.conditions.starSword || state.starSword) &&
    (!skill.conditions.bossAwakened || battle.id !== 'boss' || battle.awakened)
  );
}
export const items = [
  {
    id: herb.id,
    name: herb.name,
    description: `ユウのHPを${herb.heal}回復する。戦闘中は1行動を使う。`,
    quantityKey: 'herbs' as const,
    conditions: { missingHP: true },
    effect: { type: 'restore-hp' as const, amount: herb.heal },
  },
];
export function ownedItems(state: State) {
  return items.filter((item) => state[item.quantityKey] > 0);
}
