import './ui/styles.css';
import { World } from './render/world';
import { AudioEngine } from './audio';
import { dialogues, maps, enemies, type EnemyId } from './simulation/data';
import {
  fresh,
  beginBattle,
  resolveTurn,
  liliaHeal,
  useHerb,
  readSave,
  save,
  SAVE_KEY,
  type State,
  type Battle,
  type Command,
  type Actor,
  type HPChange,
  actorHP,
  healActor,
} from './simulation/state';
import {
  canUseSkill,
  learnSkill,
  learnedSkills,
  ownedItems,
} from './simulation/abilities';
import {
  beginChapter,
  finishChapterTitle,
  chapterTitle,
  chapterObjective,
  mark,
  learnPrayer,
  rescueSpirit,
  restoreBarrier,
  identifyEmblem,
  depart,
  relocate,
} from './simulation/chapter';
import {
  actorLevel,
  actorMaxHP,
  actorMaxMP,
  actorMP,
  ensureParty,
  spendMP,
  awardVictory,
} from './simulation/progression';
import { skills } from './simulation/abilities';
import { actorName } from './simulation/party-battle';
const ui = document.getElementById('ui')!;
const audio = new AudioEngine();
const awakeningOverlay = document.createElement('div');
awakeningOverlay.id = 'awakening-overlay';
awakeningOverlay.setAttribute('aria-hidden', 'true');
awakeningOverlay.innerHTML =
  '<div class="pendant-glow"></div><div class="surprise-mark">!!</div><div class="awakening-flash"></div>';
document.body.append(awakeningOverlay);
const combatOverlay = document.createElement('div');
combatOverlay.id = 'combat-overlay';
combatOverlay.setAttribute('aria-hidden', 'true');
document.body.append(combatOverlay);
let combatNumbers: {
  node: HTMLElement;
  change: HPChange;
  started: number;
  slot: number;
}[] = [];
const recentHP = new Map<Actor, { amount: number; until: number }>();
function displayHPChanges(changes: HPChange[]) {
  const slots = new Map<string, number>();
  for (const change of changes) {
    if (!change.amount) continue;
    const node = document.createElement('span');
    node.className = `combat-number ${change.amount < 0 ? 'damage' : 'healing'}`;
    node.dataset.target = change.target;
    node.textContent = `${change.amount > 0 ? '+' : ''}${change.amount}`;
    node.style.visibility = 'hidden';
    combatOverlay.append(node);
    const slot = slots.get(change.target) ?? 0;
    slots.set(change.target, slot + 1);
    combatNumbers.push({ node, change, started: performance.now(), slot });
    if (change.target !== 'enemy') {
      recentHP.set(change.target, {
        amount: change.amount,
        until: performance.now() + 1500,
      });
      if (change.guarded) world.guardUntil[change.target] = world.time + 1.5;
    }
  }
}
function resetCombatFeedback() {
  combatNumbers.forEach((entry) => entry.node.remove());
  combatNumbers = [];
  recentHP.clear();
}
let world: World;
let state: State = fresh();
let battle: Battle | null = null;
let mode = 'loading';
let battleMenu: 'root' | 'skills' | 'items' | 'targets' = 'root';
let targetCommand: Command | null = null;
let targetOrigin: 'skills' | 'items' = 'skills';
let titleStarted = 0;
let activeChapterTitle = chapterTitle;
let afterChapterTitle = () => {};
let completeChapterTitle = () => {};
const heldInputs = new Set<string>();
let lines: [string, string][] = [];
let line = 0;
let dialogueId = '';
let afterDialogue = () => {};
let turnAfter = () => {};
let turnText = '';
let toast = '';
let toastUntil = 0;
let cry = false;
let context = '';
let previous = 'title';
const keys = new Set<string>();
let last = performance.now();
const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
function message(text: string) {
  toast = text;
  toastUntil = performance.now() + 3500;
  draw();
}
function checkpoint() {
  if (!save(state))
    message('自動保存できません。ブラウザの保存設定を確認してください。');
  else message('記録を残した。');
}
function btn(label: string, action: string, disabled = false) {
  return `<button data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}
function objective() {
  if (state.chapter) return chapterObjective(state);
  if (state.complete) return 'プロローグ完了';
  if (!state.sword) return '北へ進み、叫び声の主を探す';
  if (!state.lilia) return '魔物を退け、少女を救う';
  if (state.map === 'entrance') return 'リリアと森の奥へ';
  if (state.map === 'depths') return '黒い霧を追い、神殿へ';
  return '神殿の最深部を調べる';
}
function hpClass(actor: Actor) {
  const recent = recentHP.get(actor);
  if (recent && performance.now() < recent.until)
    return recent.amount < 0 ? 'hp-damage' : 'hp-healing';
  return actorHP(state, actor) <= actorMaxHP(state, actor) * 0.3 ? 'low' : '';
}
function hud() {
  const member = (actor: Actor) =>
    `<div class="party-member" data-member="${actor}"><strong>${actorName(actor)}</strong>${state.chapter ? `<small class="level">Lv.${actorLevel(state, actor)}</small>` : ''} <span class="hp-value ${hpClass(actor)}">HP ${actorHP(state, actor)} / ${actorMaxHP(state, actor)}</span><i class="hp"><span style="width:${(actorHP(state, actor) / actorMaxHP(state, actor)) * 100}%"></span></i>${state.chapter ? `<div class="mp-value">MP ${actorMP(state, actor)} / ${actorMaxMP(state, actor)}<i class="mp"><span style="width:${(actorMP(state, actor) / actorMaxMP(state, actor)) * 100}%"></span></i></div>` : ''}</div>`;
  return `<div class="status"><div class="area">${maps[state.map].name}</div>${member('hero')}${state.chapter ? member('lilia') : ''}</div><div class="objective"><small>現在の目的</small>${objective()}</div>`;
}
function fieldMagicButton(
  label: string,
  id: string,
  actor: Actor,
  skillId: string,
) {
  const skill = skills.find((skill) => skill.id === skillId)!;
  return btn(
    `${label} · MP ${skill.mpCost}`,
    id,
    actorHP(state, actor) <= 0 ||
      actorHP(state, actor) >= actorMaxHP(state, actor) ||
      !state.chapter?.liliaHP ||
      actorMP(state, 'lilia') < skill.mpCost,
  );
}
function draw(focusAction?: string) {
  const oldFocus = (document.activeElement as HTMLElement)?.dataset?.action;
  let html = '';
  const saved = readSave();
  if (mode === 'loading')
    html =
      '<div class="loading">星剣の目覚め<br><small>森の記憶を読み込んでいます…</small></div>';
  if (mode === 'chapterTitle')
    html = `<section class="chapter-title"><div class="chapter-title-copy"><p>${activeChapterTitle.number}</p><h1>${activeChapterTitle.title}</h1></div><small>Enter / Z　進む</small></section>`;
  if (mode === 'title') {
    html = `<section class="title"><div class="title-content"><div class="eyebrow">A TALE OF THE LOST STARS</div><h1>星剣の目覚め</h1><p class="subtitle">PROLOGUE / CHAPTER I · 失われた記憶の旅</p><div class="rule"></div><div class="choices">${btn('はじめから', 'new')}${btn('つづきから', 'continue', !saved.state)}${btn('設定', 'settings')}</div>${saved.error ? `<p>${saved.error}</p>` : ''}</div><div class="title-foot">↑ ↓ 選択　Enter / Z 決定　·　PC キーボード対応</div></section>`;
  }
  if (
    ['explore', 'dialogue', 'battle', 'turn', 'menu', 'defeat'].includes(mode)
  )
    html = hud();
  if (mode === 'explore')
    html += `<div class="help">WASD / 矢印 移動　 Enter / Z 調べる　 Esc / X メニュー　 ＋ / − 拡大縮小</div>${context ? `<div class="prompt">Enter / Z　${esc(context)}</div>` : ''}`;
  if (mode === 'dialogue') {
    const [who, text] = lines[line];
    html += `<section class="dialogue" data-action="next"><div class="speaker">${who}</div><div class="text">${text}</div><span class="next">Enter / Z　▼　${line + 1} / ${lines.length}</span></section>`;
  }
  if ((mode === 'battle' || mode === 'turn') && battle) {
    const actor = state.chapter ? battle.actor : 'hero';
    let options = '';
    let guidance = 'コマンドを選択してください。';
    if (battleMenu === 'root' || mode === 'turn') {
      options =
        btn('攻撃', 'attack', mode === 'turn') +
        btn('防御', 'guard', mode === 'turn') +
        (actor === 'lilia'
          ? btn('魔法', 'skills', mode === 'turn')
          : state.starSword
            ? btn('星剣', 'skills', mode === 'turn')
            : '') +
        btn('道具', 'items', mode === 'turn');
      if (state.chapter)
        guidance = `${actorName(actor)}の行動を選択。${battle.telegraph ? '予兆：次は全体攻撃。防御で備えよう！' : battle.armor ? '霧の鎧は一閃で解除できる。' : '味方二人の行動後に敵が動く。'} ${battle.forgotten[actor] ? '忘却中：祈りで解除できる。' : ''}`;
      else if (battle.awakened)
        guidance = '「星剣」から習得済みの「一閃」を選ぼう。';
      else if (battle.id === 'rescue' && battle.turn === 0)
        guidance =
          '攻撃を選び、少女を救おう。防御は被ダメージを半減。道具から薬草を使える。';
    } else if (battleMenu === 'skills') {
      const learned = learnedSkills(state, actor);
      options =
        learned
          .map((skill) =>
            btn(
              `${esc(skill.name)}<small>${esc(skill.description)}${state.chapter ? `<span class="skill-cost">MP ${skill.mpCost}${actorMP(state, actor) < skill.mpCost ? ' · MP不足' : ''}</span>` : ''}</small>`,
              `skill:${skill.id}`,
              !canUseSkill(state, battle!, skill, actor),
            ),
          )
          .join('') + btn('戻る', 'battleBack');
      guidance = learned.length
        ? `${actor === 'lilia' ? '魔法' : '星剣'}の技能を選択してください。Esc / X で戻る。`
        : '習得済みの技能はありません。';
    } else if (battleMenu === 'targets') {
      options =
        (['hero', 'lilia'] as Actor[])
          .map((target) =>
            btn(
              `${actorName(target)}<small>HP ${actorHP(state, target)} / ${actorMaxHP(state, target)}${battle!.forgotten[target] ? ' · 忘却' : ''}${actorHP(state, target) === 0 ? ' · 戦闘不能' : ''}</small>`,
              `target:${target}`,
              actorHP(state, target) === 0 ||
                (targetCommand === 'skill:prayer'
                  ? !battle!.forgotten[target]
                  : actorHP(state, target) >= actorMaxHP(state, target)),
            ),
          )
          .join('') + btn('戻る', 'battleBack');
      guidance = '味方一人を選択してください。Esc / X で技能・道具一覧へ戻る。';
    } else {
      const owned = ownedItems(state);
      options =
        owned
          .map((item) =>
            btn(
              `${esc(item.name)} ×${state[item.quantityKey]}<small>${esc(item.description)}</small>`,
              `item:${item.id}`,
              item.conditions.missingHP &&
                (state.chapter
                  ? state.hp >= actorMaxHP(state, 'hero') &&
                    state.chapter.liliaHP >= actorMaxHP(state, 'lilia')
                  : state.hp === 100),
            ),
          )
          .join('') + btn('戻る', 'battleBack');
      guidance = owned.length
        ? '道具を選択してください。Esc / X で戻る。'
        : '所持している道具はありません。Esc / X で戻る。';
    }
    html += `<div class="battle-label${state.chapter ? ' chapter-battle-label' : ''}">${enemies[battle.id].name}<small>HP ${battle.hp} / ${enemies[battle.id].hp}${state.chapter && battle.id === 'bellkeeper' ? (battle.armor ? ' · 霧の鎧' : ' · 鎧解除中') : ''}</small></div><div class="battle-ui"><div class="commands" data-menu="${battleMenu}">${options}</div><div class="battle-log"><small>TURN ${battle.turn + (mode === 'battle' ? 1 : 0)} · ${state.chapter ? `${actorName(actor)}の行動${battle.forgotten.hero ? ' · ユウ：忘却' : ''}${battle.forgotten.lilia ? ' · リリア：忘却' : ''}${state.hp === 0 ? ' · ユウ：戦闘不能' : ''}${state.chapter.liliaHP === 0 ? ' · リリア：戦闘不能' : ''}` : state.lilia ? (battle.liliaRestTurns > 0 ? (mode === 'turn' ? 'リリア：次のターンは休み' : 'リリア：このターンは休み') : 'リリアが同行中') : 'ユウは一人で戦っている'}</small>${mode === 'turn' ? turnText : guidance} ${mode === 'turn' ? '<span class="next">Enter / Z　次へ ▼</span>' : ''}</div></div>`;
  }
  if (mode === 'menu')
    html += `<div class="modal"><section class="card"><div class="eyebrow">TRAVEL JOURNAL</div><h2>旅の記録</h2><p>${objective()}<br>${state.chapter ? 'リリアが戦闘仲間として同行。魔法で一人を回復、祈りで忘却を解除。' : state.lilia ? 'リリアが同行。HP が半分以下で手当て。手当ての次のターンは休み。' : 'まだ同行者はいない。'}<br>武器：${state.starSword ? '星剣' : state.sword ? '拾った剣' : 'なし'}</p><div class="choices">${btn(`薬草を使う · ${state.herbs}個`, 'fieldHerb', !state.herbs)}${state.chapter ? `${fieldMagicButton('回復 → ユウ', 'fieldHeal:hero', 'hero', 'recovery')}${fieldMagicButton('回復 → リリア', 'fieldHeal:lilia', 'lilia', 'recovery')}${state.flags.includes('skill:prayer') ? `${fieldMagicButton('祈り → ユウ', 'fieldPrayer:hero', 'hero', 'prayer')}${fieldMagicButton('祈り → リリア', 'fieldPrayer:lilia', 'lilia', 'prayer')}` : ''}${btn(`薬草 → リリア · ${state.herbs}個`, 'fieldHerbLilia', !state.herbs || state.chapter.liliaHP <= 0 || state.chapter.liliaHP >= actorMaxHP(state, 'lilia'))}` : ''}${btn('設定', 'settings')}${btn('タイトルへ', 'title')}${btn('探索に戻る', 'close')}</div></section></div>`;
  if (mode === 'settings')
    html += `<div class="modal"><section class="card"><div class="eyebrow">SETTINGS</div><h2>音の設定</h2><label>音量 <span id="volume-label">${Math.round(audio.volume * 100)}%</span><input id="volume" type="range" min="0" max="1" step="0.01" value="${audio.volume}"></label><label><input id="mute" type="checkbox" ${audio.muted ? 'checked' : ''}> ミュート</label><p>移動：WASD / 矢印<br>決定：Enter / Z　メニュー：Esc / X<br>カメラ：＋ / ＝ / −</p><div class="choices">${btn('戻る', 'settingsBack')}</div></section></div>`;
  if (mode === 'overwrite')
    html = `<div class="modal"><section class="card"><h2>新しい旅を始めますか？</h2><p>現在のセーブは、新しい旅の記録で上書きされます。</p><div class="choices">${btn('戻る', 'title')}${btn('はじめから始める', 'start')}</div></section></div>`;
  if (mode === 'defeat')
    html += `<div class="modal"><section class="card"><div class="eyebrow">THE JOURNEY CONTINUES</div><h2>力尽きた……</h2><p>直前の戦闘開始時の HP と薬草に戻して、再挑戦できます。</p><div class="choices">${btn('もう一度立ち向かう', 'retry')}${btn('タイトルへ', 'title')}</div></section></div>`;
  if (mode === 'complete')
    html = `<div class="modal ending"><section class="card"><div class="eyebrow">星剣の継承者よ</div><h2>星剣の目覚め</h2><div class="complete-mark">PROLOGUE COMPLETE</div><p>失われた記憶。青く輝く剣。<br>ユウとリリアの旅は、ここから始まる。</p><p>プロローグ完了を記録しました。<br>アルネ村の翌朝へ、物語が続きます。</p><div class="choices">${btn('第一章へ進む', 'chapter')}${btn('タイトルへ戻る', 'title')}</div></section></div>`;

  if (toast && performance.now() < toastUntil)
    html += `<div class="toast">${toast}</div>`;
  ui.innerHTML = html;
  if (
    [
      'title',
      'battle',
      'menu',
      'settings',
      'overwrite',
      'defeat',
      'complete',
    ].includes(mode)
  ) {
    const buttons = Array.from(
      ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    const preferred = focusAction ?? (mode === 'battle' ? oldFocus : undefined);
    (
      buttons.find((button) => button.dataset.action === preferred) ??
      buttons[0]
    )?.focus({ preventScroll: true });
  }
  const volume = ui.querySelector<HTMLInputElement>('#volume');
  if (volume)
    volume.oninput = () => {
      audio.settings(+volume.value, audio.muted);
      ui.querySelector('#volume-label')!.textContent =
        `${Math.round(audio.volume * 100)}%`;
    };
  const mute = ui.querySelector<HTMLInputElement>('#mute');
  if (mute) mute.onchange = () => audio.settings(audio.volume, mute.checked);
}
function talk(
  id: string,
  done: () => void = () => {
    mode = 'explore';
    draw();
  },
) {
  dialogueId = id;
  lines = dialogues[id];
  line = 0;
  afterDialogue = done;
  mode = 'dialogue';
  keys.clear();
  world.moving = false;
  draw();
}
function next() {
  if (++line < lines.length) {
    if (dialogueId === 'awaken') {
      world.cinematicPhase = line;
      if (line === 4) world.cinematicStarted = world.time;
      if (line === 3) {
        audio.fx('awaken');
        world.awakeningEffects.start(performance.now());
      }
    }
    draw();
  } else {
    world.cinematicPhase = 0;
    // Completion callbacks may save and redraw before starting the next event.
    mode = 'explore';
    afterDialogue();
  }
}
function start() {
  resetCombatFeedback();
  state = fresh();
  battle = null;
  cry = false;
  audio.set('explore');
  world.build(state.map);
  talk('intro', () => {
    mode = 'explore';
    checkpoint();
    draw();
  });
}
function enterBattle(id: EnemyId) {
  keys.clear();
  world.moving = false;
  resetCombatFeedback();
  battle = beginBattle(state, id);
  battleMenu = 'root';
  world.awakeningEffects.reset();
  world.guardUntil = { hero: 0, lilia: 0 };
  world.actionUntil = 0;
  audio.set('battle');
  mode = 'battle';
  draw();
}
function victory() {
  const id = battle!.id;
  if (!state.defeated.includes(id)) state.defeated.push(id);
  battle = null;
  audio.set(state.chapter ? 'mist' : 'explore');
  if (id === 'rescue') {
    state.lilia = true;
    liliaHeal(state);
    talk('join', () => {
      mode = 'explore';
      checkpoint();
      draw();
    });
  } else if (id === 'boss') {
    state.complete = true;
    state.starSword = true;
    state.z = -20;
    checkpoint();
    talk('ending', () => {
      mode = 'complete';
      checkpoint();
      draw();
    });
  } else if (id === 'bellkeeper') {
    rescueSpirit(state);
    checkpoint();
    resumeChapter();
  } else {
    mode = 'explore';
    checkpoint();
    draw();
  }
}
function command(cmd: Command, target?: Actor) {
  if (!battle || mode !== 'battle') return;
  const actingActor = state.chapter ? battle.actor : 'hero';
  const result = resolveTurn(state, battle, cmd, target);
  if (!result.used) {
    message(result.lines.join(' '));
    return;
  }
  if (result.victory && state.chapter) {
    const beforeHP = { hero: state.hp, lilia: state.chapter.liliaHP };
    result.lines.push(...awardVictory(state, battle.id));
    for (const actor of ['hero', 'lilia'] as Actor[]) {
      const gain = actorHP(state, actor) - beforeHP[actor];
      if (gain) result.hpChanges.push({ target: actor, amount: gain });
    }
  }
  displayHPChanges(result.hpChanges);
  audio.fx(
    cmd.startsWith('item:') ||
      cmd === 'skill:recovery' ||
      cmd === 'skill:prayer'
      ? 'heal'
      : cmd.startsWith('skill:')
        ? 'star'
        : cmd === 'attack'
          ? 'attack'
          : 'confirm',
  );
  world.play(
    cmd === 'skill:recovery' || cmd === 'skill:prayer'
      ? 'heal'
      : cmd === 'attack'
        ? 'attack'
        : cmd.startsWith('skill:')
          ? 'star'
          : cmd.startsWith('item:')
            ? 'heal'
            : 'guard',
    1.1,
    actingActor,
    target,
  );
  if (result.lines.some((line) => line.startsWith('予兆：')))
    audio.fx('warning');
  turnText = result.lines.map(esc).join('<br>');
  mode = 'turn';
  battleMenu = 'root';
  keys.clear();
  turnAfter = () => {
    if (result.defeat) {
      mode = 'defeat';
      draw();
    } else if (result.victory) victory();
    else if (result.awakening) {
      audio.set('quiet');
      audio.fx('awaken');
      talk('awaken', () => {
        battle!.awakened = true;
        state.starSword = true;
        learnSkill(state, 'star-slash');
        audio.set('battle');

        mode = 'battle';
        draw();
      });
    } else {
      mode = 'battle';
      draw();
    }
  };
  draw();
}
function action(id: string) {
  audio.unlock();
  if (id === 'new') {
    let exists = false;
    try {
      exists = localStorage.getItem(SAVE_KEY) !== null;
    } catch {}
    if (exists) {
      mode = 'overwrite';
      draw();
    } else start();
  }
  if (id === 'start') start();
  if (id === 'chapter' && mode === 'complete') {
    beginChapter(state);
    checkpoint();
    showChapterTitle();
  }
  if (id === 'continue') {
    const s = readSave().state;
    if (s) {
      resetCombatFeedback();
      state = s;
      ensureParty(state);
      cry = state.sword || state.lilia || state.flags.includes('heardCry');
      battle = null;
      world.build(state.map);
      audio.set('explore');
      if (state.chapter) resumeChapter();
      else if (state.complete) {
        beginChapter(state);
        checkpoint();
        showChapterTitle();
      } else {
        mode = 'explore';
        draw();
      }
    }
  }
  if (id === 'title') {
    mode = 'title';
    resetCombatFeedback();
    battle = null;
    keys.clear();
    audio.set('explore');
    draw();
  }
  if (id === 'settings') {
    previous = mode;
    mode = 'settings';
    keys.clear();
    draw();
  }
  if (id === 'settingsBack') {
    mode = previous;
    draw();
  }
  if (id === 'close') {
    mode = 'explore';
    keys.clear();
    draw();
  }
  if (id === 'next' && mode === 'dialogue') next();
  if (mode === 'battle' && battle) {
    if (battleMenu === 'root' && (id === 'skills' || id === 'items')) {
      if (id === 'skills' && !state.starSword && battle.actor !== 'lilia')
        return;
      battleMenu = id;
      keys.clear();
      draw();
      return;
    }
    if (id === 'battleBack' && battleMenu !== 'root') {
      if (battleMenu === 'targets') {
        battleMenu = targetOrigin;
        targetCommand = null;
        draw();
        return;
      }
      const origin = battleMenu;
      battleMenu = 'root';
      keys.clear();
      draw(origin);
      return;
    }
    if (battleMenu === 'targets' && id.startsWith('target:') && targetCommand) {
      command(targetCommand, id.slice(7) as Actor);
      return;
    }
    if (
      state.chapter &&
      ((battleMenu === 'skills' &&
        ['skill:recovery', 'skill:prayer'].includes(id)) ||
        (battleMenu === 'items' && id === 'item:herb'))
    ) {
      targetCommand = id as Command;
      targetOrigin = battleMenu as 'skills' | 'items';
      battleMenu = 'targets';
      draw();
      return;
    }
    if (
      (battleMenu === 'root' && ['attack', 'guard'].includes(id)) ||
      (battleMenu === 'skills' && id.startsWith('skill:')) ||
      (battleMenu === 'items' && id.startsWith('item:'))
    )
      command(id as Command);
  }
  if (id === 'retry' && battle) {
    const id = battle.id;
    state = structuredClone(battle.before);
    enterBattle(id);
  }
  if (
    mode === 'menu' &&
    state.chapter &&
    (id.startsWith('fieldHeal:') ||
      id.startsWith('fieldPrayer:') ||
      id === 'fieldHerbLilia')
  ) {
    const target: Actor =
      id === 'fieldHerbLilia' ? 'lilia' : (id.split(':')[1] as Actor);
    if (!['hero', 'lilia'].includes(target) || state.chapter.liliaHP <= 0)
      return;
    if (id.startsWith('fieldPrayer:') && !state.flags.includes('skill:prayer'))
      return;
    if (id === 'fieldHerbLilia' && !state.herbs) return;
    const fieldSkill =
      id === 'fieldHerbLilia'
        ? undefined
        : skills.find(
            (skill) =>
              skill.id ===
              (id.startsWith('fieldPrayer:') ? 'prayer' : 'recovery'),
          );
    if (fieldSkill && actorMP(state, 'lilia') < fieldSkill.mpCost) {
      message('MPが足りない。');
      return;
    }
    const n = healActor(
      state,
      target,
      id === 'fieldHerbLilia' ? 50 : id.startsWith('fieldPrayer:') ? 30 : 42,
    );
    if (n) {
      if (id === 'fieldHerbLilia') state.herbs--;
      if (fieldSkill) spendMP(state, 'lilia', fieldSkill.mpCost);
      audio.fx('heal');
      checkpoint();
      message(`${actorName(target)}のHPが ${n} 回復した。`);
    }
    draw();
  }
  if (id === 'fieldHerb') {
    const n = useHerb(state);
    if (n) {
      audio.fx('heal');
      checkpoint();
      message(`HP が ${n} 回復した。`);
    } else
      message(
        state.hp >= actorMaxHP(state, 'hero')
          ? 'HP は満タンだ。'
          : '薬草を持っていない。',
      );
    draw();
  }
}
ui.addEventListener('click', (e) => {
  const node = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (node && !(node instanceof HTMLButtonElement && node.disabled))
    action(node.dataset.action!);
});
function interact() {
  const landmark = maps[state.map].landmarks.find(
    (p) => Math.hypot(p.x - state.x, p.z - state.z) < 2.7,
  );
  if (landmark) {
    if (state.chapter) {
      chapterInteract(landmark.id);
      return;
    }
    if (landmark.id === 'sword') {
      if (state.sword) {
        message('剣はすでに拾っている。');
        return;
      }
      state.sword = true;
      talk('sword');
      return;
    }
    if (landmark.id === 'herbs') {
      if (state.flags.includes('herbs')) {
        message('薬草は必要な分だけ採った。');
        return;
      }
      state.herbs += 2;
      state.flags.push('herbs');
    }
    state.flags.push(`read:${landmark.id}`);
    talk(landmark.id, () => {
      mode = 'explore';
      checkpoint();
      draw();
    });
  }
}
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const confirm = ['enter', 'z'].includes(key);
  const duplicateConfirm =
    confirm && ['enter', 'z'].some((input) => heldInputs.has(input));
  heldInputs.add(key);
  if (duplicateConfirm) {
    e.preventDefault();
    return;
  }
  if (
    mode === 'settings' &&
    e.target instanceof HTMLInputElement &&
    !['escape', 'x', 'enter', 'z'].includes(key)
  ) {
    audio.unlock();
    return;
  }
  if (
    [
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
      ' ',
      'enter',
      'escape',
      'z',
      'x',
      'w',
      'a',
      's',
      'd',
      '+',
      '=',
      '-',
    ].includes(key)
  )
    e.preventDefault();
  audio.unlock();
  // Movement is tracked from the initial keydown; repeat must not reactivate
  // a key cleared when entering a menu, dialogue, battle or a new map.
  if (e.repeat) return;
  if (mode === 'chapterTitle') {
    if (confirm && performance.now() - titleStarted >= 500) finishTitle();
    return;
  }
  if (mode === 'explore') {
    if (
      [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
      ].includes(key)
    )
      keys.add(key);
    if (['enter', 'z'].includes(key)) interact();
    if (['escape', 'x'].includes(key)) {
      mode = 'menu';
      keys.clear();
      draw();
    }
    if (key === '+' || key === '=')
      world.zoom = Math.min(1.6, world.zoom + 0.1);
    if (key === '-') world.zoom = Math.max(0.7, world.zoom - 0.1);
    return;
  }
  if (mode === 'dialogue' && ['enter', 'z'].includes(key)) {
    next();
    return;
  }
  if (mode === 'turn' && ['enter', 'z'].includes(key)) {
    turnAfter();
    return;
  }
  if (['escape', 'x'].includes(key)) {
    if (mode === 'menu') action('close');
    if (mode === 'settings') action('settingsBack');
    if (mode === 'battle' && battleMenu !== 'root') action('battleBack');
    return;
  }
  if (
    [
      'title',
      'battle',
      'menu',
      'settings',
      'overwrite',
      'defeat',
      'complete',
    ].includes(mode)
  ) {
    const buttons = Array.from(
      ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['arrowdown', 's', 'arrowup', 'w'].includes(key)) {
      const delta = key === 'arrowup' || key === 'w' ? -1 : 1;
      buttons[(index + delta + buttons.length) % buttons.length]?.focus();
    }
    if (['enter', 'z'].includes(key)) {
      const button = buttons[Math.max(0, index)];
      if (button) action(button.dataset.action!);
    }
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  heldInputs.delete(e.key.toLowerCase());
});
window.addEventListener('blur', () => {
  keys.clear();
  heldInputs.clear();
});
function update(dt: number) {
  if (mode === 'chapterTitle' && performance.now() - titleStarted >= 3000)
    finishTitle();
  if (mode !== 'explore') {
    world.moving = false;
    return;
  }
  let dx =
    Number(keys.has('d') || keys.has('arrowright')) -
    Number(keys.has('a') || keys.has('arrowleft'));
  let dz =
    Number(keys.has('s') || keys.has('arrowdown')) -
    Number(keys.has('w') || keys.has('arrowup'));
  const len = Math.hypot(dx, dz);
  world.moving = len > 0;
  if (len) {
    dx /= len;
    dz /= len;
    const speed = 3.1;
    const x = state.x + dx * dt * speed,
      z = state.z + dz * dt * speed;
    if (world.walkable(x, state.z)) state.x = x;
    if (world.walkable(state.x, z)) state.z = z;
    world.direction =
      Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 1 : 2) : dz < 0 ? 3 : 0;
  }
  if (state.map === 'entrance' && state.z < 7 && !cry && !state.lilia) {
    cry = true;
    state.flags.push('heardCry');
    talk('cry');
    return;
  }
  const p = maps[state.map].landmarks.find(
    (p) => Math.hypot(p.x - state.x, p.z - state.z) < 2.7,
  );
  const nextContext = p ? p.label : '';
  if (context !== nextContext) {
    context = nextContext;
    draw();
  }
  if (
    state.chapter &&
    state.map === 'undercroft' &&
    state.z < 5 &&
    !state.flags.includes('ch01:ward')
  ) {
    talk('ward', () => {
      mark(state, 'ch01:ward');
      mode = 'explore';
      checkpoint();
      draw();
    });
    return;
  }
  for (const e of maps[state.map].encounters) {
    if (
      !state.defeated.includes(e.id) &&
      Math.hypot(e.x - state.x, e.z - state.z) < 1.7
    ) {
      if (!state.sword) {
        state.z = e.z + 2;
        message('先に落ちている剣を拾おう。');
        return;
      }
      if (e.id === 'bellkeeper') {
        state.z = e.z + 4;
        checkpoint();
        talk('bellkeeper', () => enterBattle('bellkeeper'));
      } else if (e.id === 'boss') {
        state.z = e.z + 4;
        checkpoint();
        talk('boss', () => enterBattle('boss'));
      } else enterBattle(e.id);
      return;
    }
  }
  if (state.chapter) {
    updateChapterTravel();
    return;
  }
  if (state.z < maps[state.map].exit && state.map !== 'temple') {
    if (!state.lilia) {
      state.z = maps[state.map].exit + 1;
      message('少女を置いては行けない。');
      return;
    }
    state.map = state.map === 'entrance' ? 'depths' : 'temple';
    state.x = 0;
    state.z = maps[state.map].spawn[1];
    keys.clear();
    world.build(state.map);
    checkpoint();
    if (state.map === 'temple') talk('temple');
    else draw();
  }
}

function showChapterTitle(
  title = chapterTitle,
  done = resumeChapter,
  completed = () => finishChapterTitle(state),
) {
  activeChapterTitle = title;
  afterChapterTitle = done;
  completeChapterTitle = completed;
  mode = 'chapterTitle';
  titleStarted = performance.now();
  keys.clear();
  battle = null;
  world.moving = false;
  audio.set('village');
  world.build(state.map);
  draw();
}
function finishTitle() {
  if (mode !== 'chapterTitle') return;
  completeChapterTitle();
  checkpoint();
  afterChapterTitle();
}
function exploreChapter() {
  mode = 'explore';
  audio.set(
    ['belfry', 'undercroft', 'sanctum'].includes(state.map)
      ? 'mist'
      : 'village',
  );
  draw();
}
function resumeChapter() {
  if (!state.chapter) return;
  if (!state.chapter.titleShown) {
    showChapterTitle();
    return;
  }
  if (state.chapter.stage === 'opening') {
    talk('ch01_opening', () => {
      state.chapter!.stage = 'investigation';
      checkpoint();
      exploreChapter();
    });
  } else if (state.chapter.stage === 'restoration') {
    talk('spirit_rescued', () =>
      talk('restoration', () => {
        restoreBarrier(state);
        world.build(state.map);
        checkpoint();
        resumeChapter();
      }),
    );
  } else if (
    state.flags.includes('ch01:restored') &&
    !state.flags.includes('ch01:return')
  ) {
    audio.set('village');
    audio.fx('bell');
    talk('return_bell', () => {
      mark(state, 'ch01:return');
      checkpoint();
      exploreChapter();
    });
  } else if (state.map === 'belfry' && !state.flags.includes('ch01:belfry')) {
    talk('belfry_entry', () => {
      mark(state, 'ch01:belfry');
      checkpoint();
      exploreChapter();
    });
  } else if (state.map === 'sanctum' && !state.flags.includes('skill:prayer')) {
    talk('prayer', () => {
      learnPrayer(state);
      checkpoint();
      exploreChapter();
    });
  } else exploreChapter();
}
function chapterInteract(id: string) {
  if (id === 'keeper') {
    const restored = state.flags.includes('ch01:restored');
    talk(restored ? 'keeper_restored' : 'keeper', () => {
      mark(state, 'ch01:keeper');
      checkpoint();
      exploreChapter();
    });
  } else if (id === 'elder') {
    talk(
      state.flags.includes('ch01:emblem')
        ? 'elder_after'
        : state.flags.includes('ch01:restored')
          ? 'emblem'
          : 'elder_wait',
      () => {
        identifyEmblem(state);
        checkpoint();
        exploreChapter();
      },
    );
  } else if (id === 'supply') {
    if (state.flags.includes('ch01:supply')) {
      message('救護箱は空だ。');
      return;
    }
    state.herbs = Math.min(99, state.herbs + 2);
    mark(state, 'ch01:supply');
    talk('supply', () => {
      checkpoint();
      exploreChapter();
    });
  } else if (dialogues[id]) talk(id, exploreChapter);
}
function updateChapterTravel() {
  const map = state.map;
  const north = state.z < maps[map].exit;
  const south = state.z > maps[map].length / 2 - 3;
  if (!north && !south) return;
  if (map === 'village' && south) {
    state.z = maps.village.length / 2 - 3;
    keys.clear();
    if (!state.flags.includes('ch01:emblem')) {
      message('出発前に、村の異変と革袋の紋章を調べよう。');
      return;
    }
    if (state.flags.includes('ch01:complete')) {
      changeChapterMap('road');
      return;
    }
    talk('departure', () => {
      depart(state);
      world.build(state.map);
      checkpoint();
      exploreChapter();
    });
    return;
  }
  const forward = {
    village: 'belfry',
    belfry: 'undercroft',
    undercroft: 'sanctum',
  } as const;
  const backward = {
    belfry: 'village',
    undercroft: 'belfry',
    sanctum: 'undercroft',
    road: 'village',
  } as const;
  if (north && map in forward) {
    if (map === 'village' && !state.flags.includes('ch01:keeper')) {
      state.z = maps.village.exit + 1;
      keys.clear();
      message('旧鐘楼へ向かう前に、鐘守に話を聞こう。');
      return;
    }
    changeChapterMap(forward[map as keyof typeof forward]);
  } else if (south && map in backward) {
    changeChapterMap(
      backward[map as keyof typeof backward],
      true,
      map === 'road',
    );
  } else if (north && map === 'road') {
    state.z = maps.road.exit + 1;
    keys.clear();
    message('第一章完了。交易都市での冒険は第二章へ続く。');
  }
}
function changeChapterMap(map: State['map'], back = false, fromRoad = false) {
  relocate(state, map);
  if (back) state.z = fromRoad ? maps[map].length / 2 - 5 : maps[map].exit + 3;
  keys.clear();
  context = '';
  world.build(map);
  if (map === 'belfry' && !state.flags.includes('ch01:belfry')) {
    state.chapter!.stage = 'belfry';
    checkpoint();
    talk('belfry_entry', () => {
      mark(state, 'ch01:belfry');
      checkpoint();
      exploreChapter();
    });
  } else {
    checkpoint();
    resumeChapter();
  }
}

function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (world) {
    update(dt);
    world.render(state, battle, dt, mode);
    const nowFeedback = performance.now();
    combatNumbers = combatNumbers.filter((entry) => {
      const age = nowFeedback - entry.started;
      if (age >= 1500 || !battle) {
        entry.node.remove();
        return false;
      }
      const sprite =
        entry.change.target === 'hero'
          ? world.player
          : entry.change.target === 'lilia'
            ? world.companion
            : world.enemySprites.get(battle.id);
      if (sprite) {
        const point = sprite.position.clone();
        point.y += sprite.scale.y * 0.6;
        point.project(world.camera);
        entry.node.style.visibility = 'visible';
        entry.node.style.left = `${((point.x + 1) * innerWidth) / 2}px`;
        entry.node.style.top = `${((1 - point.y) * innerHeight) / 2 - age / 70 - entry.slot * 35}px`;
        entry.node.style.opacity = `${Math.min(1, (1500 - age) / 350)}`;
      }
      return true;
    });
    let expiredHP = false;
    for (const [actor, entry] of recentHP) {
      if (nowFeedback >= entry.until) {
        recentHP.delete(actor);
        expiredHP = true;
      }
    }
    if (expiredHP && ['battle', 'turn'].includes(mode)) draw();
    const glow = world.awakeningEffects.sample(performance.now());
    const foot = world.player.position.clone().project(world.camera);
    const size =
      (world.player.scale.y * world.zoom * innerHeight) / (battle ? 18 : 20);
    awakeningOverlay.dataset.phase = glow.phase ?? '';
    awakeningOverlay.style.setProperty(
      '--hero-x',
      `${((foot.x + 1) * innerWidth) / 2}px`,
    );
    awakeningOverlay.style.setProperty(
      '--hero-y',
      `${((1 - foot.y) * innerHeight) / 2}px`,
    );
    awakeningOverlay.style.setProperty('--hero-size', `${size}px`);
    awakeningOverlay.style.setProperty(
      '--flash-opacity',
      `${glow.phase === 'awakening' ? 0.8 * (1 - glow.progress) : 0}`,
    );
  }
  if (toast && now > toastUntil) {
    toast = '';
    draw();
  }
  requestAnimationFrame(loop);
}
async function boot() {
  draw();
  try {
    world = new World(document.getElementById('world')!);
    await world.load();
    mode = 'title';
    draw();
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    mode = 'fatal';
    ui.innerHTML =
      '<div class="fatal">ゲームを読み込めませんでした。<br>WebGL 対応のブラウザで、ページを再読み込みしてください。<br>素材の読み込みに失敗した場合は通信状態を確認してください。</div>';
  }
}
void boot();
