import type { Actor, State } from './state';
import type { EnemyId } from './data';

export interface CharacterProgress {
  level: number;
  xp: number;
  mp: number;
}
export type PartyProgress = Record<Actor, CharacterProgress>;
export const xpRequired = (level: number) => 40 + (level - 1) * 30;
export function actorLevel(s: State, actor: Actor): number {
  return s.chapter?.party?.[actor]?.level ?? 1;
}
export function actorMaxHP(s: State, actor: Actor): number {
  return (
    100 +
    (s.chapter ? (actorLevel(s, actor) - 1) * (actor === 'hero' ? 12 : 10) : 0)
  );
}
export function actorMaxMP(s: State, actor: Actor): number {
  return s.chapter
    ? 24 + (actorLevel(s, actor) - 1) * (actor === 'hero' ? 4 : 5)
    : 0;
}
export function actorMP(s: State, actor: Actor): number {
  return s.chapter?.party?.[actor]?.mp ?? actorMaxMP(s, actor);
}
export function ensureParty(s: State): PartyProgress | null {
  if (!s.chapter) return null;
  return (s.chapter.party ??= {
    hero: { level: 1, xp: 0, mp: 24 },
    lilia: { level: 1, xp: 0, mp: 24 },
  });
}
export function spendMP(s: State, actor: Actor, cost: number): boolean {
  const party = ensureParty(s);
  if (!party) return true; // The prologue retains its original awakening rules.
  if (party[actor].mp < cost) return false;
  party[actor].mp -= cost;
  return true;
}
export function resetBattleMP(s: State): void {
  const party = ensureParty(s);
  if (party)
    for (const actor of ['hero', 'lilia'] as Actor[])
      party[actor].mp = actorMaxMP(s, actor);
}
export function awardVictory(s: State, enemy: EnemyId): string[] {
  const party = ensureParty(s);
  if (!party || s.defeated.includes(enemy)) return [];
  const flag = `xp:${enemy}`;
  if (s.flags.includes(flag)) return [];
  s.flags.push(flag);
  const xp = enemy === 'bellkeeper' ? 100 : enemy === 'mist2' ? 45 : 30;
  const lines = [`二人は経験値を ${xp} 獲得した。`];
  for (const actor of ['hero', 'lilia'] as Actor[]) {
    const p = party[actor];
    const oldHP = actorMaxHP(s, actor),
      oldMP = actorMaxMP(s, actor);
    p.xp += xp;
    const before = p.level;
    while (p.level < 50 && p.xp >= xpRequired(p.level)) {
      p.xp -= xpRequired(p.level);
      p.level++;
    }
    if (p.level === 50) p.xp = 0;
    if (p.level === before) continue;
    const gainHP = actorMaxHP(s, actor) - oldHP;
    if (actor === 'hero' && s.hp > 0) s.hp += gainHP;
    if (actor === 'lilia' && s.chapter!.liliaHP > 0)
      s.chapter!.liliaHP += gainHP;
    p.mp += actorMaxMP(s, actor) - oldMP;
    lines.push(
      `${actor === 'hero' ? 'ユウ' : 'リリア'}はレベル ${p.level} に上がった。最大HP ${actorMaxHP(s, actor)}・最大MP ${actorMaxMP(s, actor)}。`,
    );
  }
  return lines;
}
export function validParty(s: State): boolean {
  const party = s.chapter?.party;
  if (party === undefined) return true;
  return (
    !!party &&
    typeof party === 'object' &&
    (['hero', 'lilia'] as Actor[]).every((actor) => {
      const p = party[actor];
      return (
        !!p &&
        typeof p === 'object' &&
        Number.isInteger(p.level) &&
        p.level >= 1 &&
        p.level <= 50 &&
        Number.isInteger(p.xp) &&
        p.xp >= 0 &&
        p.xp < xpRequired(p.level) &&
        Number.isInteger(p.mp) &&
        p.mp >= 0 &&
        p.mp <= actorMaxMP(s, actor)
      );
    })
  );
}
