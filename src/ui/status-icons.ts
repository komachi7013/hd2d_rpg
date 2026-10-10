import type { State, Battle } from '../simulation/state';
export interface StatusIcon {
  id: string;
  label: string;
  path: string;
  tone: string;
  count?: number;
}
const shield = 'M12 2 21 6v6c0 6-9 10-9 10S3 18 3 12V6Z M8 12l3 3 5-6';
const mist = 'M5 9c-4-5 7-9 9-4s-6 9-1 10c6 1 8-7 4-8 M4 18h4 M17 20h3';
const armor = 'M8 3h8l5 6-4 3v9H7v-9L3 9Z M9 15h6';
const broken = 'M3 12h7m4 0h7 M11 3l-3 7 8 4-3 7';
const alert = 'M12 3 2 21h20Z M12 9v6 M12 18v1';
const down = 'M6 6l12 12 M18 6 6 18';
export function battleStatuses(
  s: State,
  b: Battle,
): Record<'hero' | 'lilia' | 'enemy', StatusIcon[]> {
  const icons: Record<'hero' | 'lilia' | 'enemy', StatusIcon[]> = {
    hero: [],
    lilia: [],
    enemy: [],
  };
  for (const a of ['hero', 'lilia'] as const) {
    if (b.guards.includes(a))
      icons[a].push({
        id: 'guard',
        label: '防御：被ダメージ半減',
        path: shield,
        tone: 'buff',
      });
    if (b.forgotten[a])
      icons[a].push({
        id: 'forgotten',
        label: `忘却：技能封印・残り${b.forgotten[a]}ラウンド`,
        path: mist,
        tone: 'debuff',
        count: b.forgotten[a],
      });
    if ((a === 'hero' ? s.hp : (s.chapter?.liliaHP ?? 100)) === 0)
      icons[a].push({
        id: 'down',
        label: '戦闘不能',
        path: down,
        tone: 'debuff',
      });
  }
  if (b.armor)
    icons.enemy.push({
      id: 'armor',
      label: '霧の鎧：ダメージ軽減',
      path: armor,
      tone: 'buff',
    });
  if (b.connections?.some((hp) => hp > 0))
    icons.enemy.push({
      id: 'barrier',
      label: '吸収障壁：被ダメージ50%軽減',
      path: shield,
      tone: 'buff',
      count: b.connections.filter((hp) => hp > 0).length,
    });
  if (b.connections?.every((hp) => hp === 0))
    icons.enemy.push({
      id: 'severed',
      label: '接続解除：障壁なし',
      path: broken,
      tone: 'debuff',
    });
  if (b.telegraph)
    icons.enemy.push({
      id: 'warning',
      label: '予兆：次の敵行動は全体攻撃',
      path: alert,
      tone: 'warning',
    });
  return icons;
}
export const statusMarkup = (icons: StatusIcon[]) =>
  icons
    .map(
      (icon) =>
        `<span class="status-icon ${icon.tone}" data-status="${icon.id}" title="${icon.label}" aria-label="${icon.label}" role="img"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon.path}" /></svg>${icon.count ? `<b>${icon.count}</b>` : ''}</span>`,
    )
    .join('');
