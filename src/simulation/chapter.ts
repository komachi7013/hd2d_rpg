import { secondObjective } from './chapter-two';
import { maps, type MapId } from './data';
import { learnSkill } from './abilities';
import type { State } from './state';
import { ensureParty, type PartyProgress } from './progression';

export type ChapterStage =
  | 'arrival'
  | 'inquiry'
  | 'rest'
  | 'office'
  | 'waterway'
  | 'sever'
  | 'core'
  | 'shutdown'
  | 'records'
  | 'return'
  | 'opening'
  | 'investigation'
  | 'belfry'
  | 'boss'
  | 'restoration'
  | 'departure'
  | 'complete';
export interface ChapterProgress {
  number: 1 | 2 | 3;
  stage: ChapterStage;
  titleShown: boolean;
  liliaHP: number;
  party?: PartyProgress;
}
export const chapterTitle = {
  number: '第一章',
  title: '鐘の音が消える村',
  flag: 'ch01:title',
};
export function mark(state: State, flag: string): void {
  if (!state.flags.includes(flag)) state.flags.push(flag);
}
export function relocate(state: State, map: MapId): void {
  state.map = map;
  state.x = maps[map].spawn[0];
  state.z = maps[map].spawn[1];
}
export function beginChapter(state: State): void {
  if (state.chapter || !state.complete) return;
  state.lilia = true;
  state.sword = true;
  state.starSword = true;
  state.hp = 100;
  state.chapter = {
    number: 1,
    stage: 'opening',
    titleShown: false,
    liliaHP: 100,
  };
  ensureParty(state);
  learnSkill(state, 'star-slash');
  learnSkill(state, 'recovery');
  relocate(state, 'village');
}
export function finishChapterTitle(state: State): void {
  if (!state.chapter) return;
  state.chapter.titleShown = true;
  mark(state, chapterTitle.flag);
}
export function learnPrayer(state: State): void {
  if (!state.chapter) return;
  learnSkill(state, 'prayer');
  mark(state, 'ch01:prayer');
  state.chapter.stage = 'boss';
}
export function rescueSpirit(state: State): void {
  if (!state.chapter) return;
  mark(state, 'ch01:boss');
  if (!state.defeated.includes('bellkeeper')) state.defeated.push('bellkeeper');
  state.chapter.stage = 'restoration';
  // A chapter checkpoint needs at least one conscious party member.
  state.hp = Math.max(1, state.hp);
  state.chapter.liliaHP = Math.max(1, state.chapter.liliaHP);
}
export function restoreBarrier(state: State): void {
  if (!state.chapter || !state.flags.includes('ch01:boss')) return;
  mark(state, 'ch01:restored');
  state.chapter.stage = 'departure';
  relocate(state, 'village');
}
export function identifyEmblem(state: State): void {
  if (!state.flags.includes('ch01:restored')) return;
  mark(state, 'ch01:emblem');
}
export function depart(state: State): void {
  if (!state.chapter || !state.flags.includes('ch01:emblem')) return;
  mark(state, 'ch01:complete');
  state.chapter.number = 2;
  state.chapter.stage = 'complete';
  relocate(state, 'road');
}
export function chapterObjective(state: State): string {
  if (!state.chapter) return '';
  if (state.flags.includes('ch02:started')) return secondObjective(state);
  if (state.chapter.stage === 'complete')
    return '第一章完了 · 街道の先には交易都市';
  if (state.chapter.stage === 'opening')
    return 'リリアと鐘の鳴らない朝を迎える';
  if (!state.flags.includes('ch01:keeper'))
    return '村の北で鐘守の様子を確認する';
  if (state.map === 'village' && !state.flags.includes('ch01:restored'))
    return '北の旧鐘楼へ向かう';
  if (state.map === 'belfry') return '鐘楼の奥から地下へ降りる';
  if (state.map === 'undercroft') return '黒い霧の流れを追い、守護精霊の広間へ';
  if (state.chapter.stage === 'boss')
    return '一閃と祈りで、守護精霊を霧から救う';
  if (state.chapter.stage === 'restoration') return '守護精霊と結界を復旧する';
  if (!state.flags.includes('ch01:emblem'))
    return '村の長老に革袋の紋章を見てもらう';
  return '村の南口から、王都へ続く街道へ旅立つ';
}
