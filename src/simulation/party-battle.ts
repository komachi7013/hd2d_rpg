import { actorMaxHP, actorMP, spendMP } from './progression';
import { enemies } from './data';
import { canUseSkill, skills } from './abilities';
import {
  actorHP,
  healActor,
  type Actor,
  type Battle,
  type Command,
  type State,
  type TurnResult,
} from './state';

export const actorName = (actor: Actor) =>
  actor === 'hero' ? 'ユウ' : 'リリア';
export function resolvePartyTurn(
  s: State,
  b: Battle,
  cmd: Command,
  target?: Actor,
): TurnResult {
  const r: TurnResult = {
    lines: [],
    hpChanges: [],
    used: false,
    victory: false,
    defeat: false,
    awakening: false,
  };
  const actor = b.actor;
  const name = actorName(actor);
  if (!s.chapter || actorHP(s, actor) <= 0 || b.hp <= 0) return r;
  const skill = skills.find((skill) => `skill:${skill.id}` === cmd);
  if (
    cmd.startsWith('skill:') &&
    (!skill || !canUseSkill(s, b, skill, actor))
  ) {
    r.lines.push(
      skill && actorMP(s, actor) < skill.mpCost
        ? 'MPが足りない。'
        : '今はその技能を使えない。忘却は祈りで解除できる。',
    );
    return r;
  }
  const allyAction = cmd === 'item:herb' || skill?.actor === 'lilia';
  if (cmd.startsWith('item:') && (cmd !== 'item:herb' || !s.herbs)) return r;
  if (allyAction && (!target || actorHP(s, target) <= 0)) {
    r.lines.push('行動できる味方一人を選んでください。');
    return r;
  }
  if (
    allyAction &&
    skill?.effect.type !== 'purify' &&
    actorHP(s, target!) >= actorMaxHP(s, target!)
  ) {
    r.lines.push('HP は満タンだ。');
    return r;
  }
  if (skill?.effect.type === 'purify' && !b.forgotten[target!]) {
    r.lines.push('その味方は忘却になっていない。');
    return r;
  }
  const hurt = (a: Actor, base: number) => {
    if (actorHP(s, a) <= 0) return;
    const damage = b.guards.includes(a) ? Math.ceil(base / 2) : base;
    const before = actorHP(s, a);
    if (a === 'hero') s.hp = Math.max(0, s.hp - damage);
    else s.chapter!.liliaHP = Math.max(0, s.chapter!.liliaHP - damage);
    r.hpChanges.push({
      target: a,
      amount: actorHP(s, a) - before,
      guarded: b.guards.includes(a),
    });
    r.lines.push(
      `${actorName(a)}に ${damage} ダメージ${b.guards.includes(a) ? '（防御）' : ''}。`,
    );
  };
  r.used = true;
  if (enemies[b.id].speed > 5 && !b.enemyActed) {
    b.enemyActed = true;
    if (cmd === 'guard') b.guards.push(actor);
    r.lines.push(`${enemies[b.id].name}の先制攻撃。`);
    hurt(
      (b.turn + 1) % 2 === 0 && s.chapter.liliaHP > 0
        ? 'lilia'
        : s.hp > 0
          ? 'hero'
          : 'lilia',
      enemies[b.id].attack,
    );
    if (actorHP(s, actor) === 0) {
      b.acted.push(actor);
      r.defeat = s.hp === 0 && s.chapter.liliaHP === 0;
      b.actor = s.hp > 0 ? 'hero' : 'lilia';
      if (r.defeat) b.turn++;
      return r;
    }
  }
  if (skill) spendMP(s, actor, skill.mpCost);
  if (cmd === 'guard') {
    if (!b.guards.includes(actor)) b.guards.push(actor);
    r.lines.push(`${name}は身を守っている。`);
  } else if (cmd === 'attack' || skill?.id === 'star-slash') {
    const slash = skill?.id === 'star-slash';
    if (slash && b.armor) {
      b.armor = false;
      b.armorAge = 0;
      r.lines.push('一閃――精霊を覆う霧の鎧を切り裂いた！');
    }
    const base = slash ? 64 : actor === 'hero' ? 42 : 22;
    const damage = b.armor ? Math.ceil(base * 0.35) : base;
    const before = b.hp;
    b.hp = Math.max(0, b.hp - damage);
    r.hpChanges.push({ target: 'enemy', amount: b.hp - before });
    r.lines.push(
      `${name}の${slash ? '一閃' : '攻撃'}。${enemies[b.id].name}に ${damage} ダメージ。`,
    );
  } else if (skill?.effect.type === 'purify') {
    b.forgotten[target!] = 0;
    r.lines.push(`リリアの祈り。${actorName(target!)}の忘却が解けた。`);
  } else if (allyAction) {
    const herb = cmd === 'item:herb';
    if (herb) s.herbs--;
    const healed = healActor(s, target!, herb ? 50 : 42);
    r.hpChanges.push({ target: target!, amount: healed });
    r.lines.push(
      `${herb ? '薬草' : 'リリアの回復'}。${actorName(target!)}のHPが ${healed} 回復。`,
    );
  }
  b.acted.push(actor);
  r.victory = b.hp === 0;
  if (r.victory) return r;
  const pending = (['hero', 'lilia'] as Actor[]).find(
    (a) => actorHP(s, a) > 0 && !b.acted.includes(a),
  );
  if (pending) {
    b.actor = pending;
    return r;
  }
  b.turn++;
  for (const a of ['hero', 'lilia'] as Actor[])
    b.forgotten[a] = Math.max(0, b.forgotten[a] - 1);
  if (b.id === 'bellkeeper') {
    if (b.telegraph) {
      r.lines.push('霧憑きの鐘守の「黒鐘の共鳴」――全体攻撃！');
      hurt('hero', 26);
      hurt('lilia', 26);
      b.telegraph = false;
    } else if (b.turn % 3 === 1) {
      const victim: Actor = s.hp > 0 ? 'hero' : 'lilia';
      b.forgotten[victim] = 3;
      r.lines.push(
        `鐘守の忘却。${actorName(victim)}の技能が封じられた。祈りで解除できる（3ラウンドで自然解除）。`,
      );
      hurt(victim, 10);
    } else {
      hurt(s.hp > 0 ? 'hero' : 'lilia', 14);
      b.telegraph = true;
      r.lines.push(
        '予兆：大鐘が低く震える。次の敵行動は全体攻撃。防御で備えよう！',
      );
    }
    if (!b.armor && ++b.armorAge >= 2) {
      b.armor = true;
      r.lines.push('黒い霧が集まり、霧の鎧が再形成された。');
    }
  } else if (!b.enemyActed) {
    r.lines.push(`${enemies[b.id].name}の攻撃。`);
    hurt(
      b.turn % 2 === 0 && s.chapter.liliaHP > 0
        ? 'lilia'
        : s.hp > 0
          ? 'hero'
          : 'lilia',
      enemies[b.id].attack,
    );
  }
  r.defeat = s.hp === 0 && s.chapter.liliaHP === 0;
  b.enemyActed = false;
  b.acted = [];
  b.guards = [];
  b.actor = s.hp > 0 ? 'hero' : 'lilia';
  return r;
}
