import { dialogues } from './data';
import { mark, relocate, type ChapterStage } from './chapter';
import { learnSkill } from './abilities';
import { actorMaxHP, resetBattleMP } from './progression';
import type { State } from './state';

export const secondTitle = {
  number: '第二章',
  title: '名前のない街',
  flag: 'ch02:title',
};
export function beginSecondChapter(s: State): boolean {
  if (
    !s.chapter ||
    !s.flags.includes('ch01:complete') ||
    s.flags.includes('ch02:started')
  )
    return false;
  mark(s, 'ch02:started');
  s.chapter.number = 2;
  s.chapter.stage = 'arrival';
  s.chapter.titleShown = false;
  relocate(s, 'merca');
  return true;
}
export function secondRest(s: State, flag: string): void {
  if (!s.chapter || s.flags.includes(flag)) return;
  s.hp = actorMaxHP(s, 'hero');
  s.chapter.liliaHP = actorMaxHP(s, 'lilia');
  resetBattleMP(s);
  mark(s, flag);
}
export function collectorVictory(s: State): void {
  if (!s.chapter) return;
  mark(s, 'ch02:boss');
  if (!s.defeated.includes('ch02-collector')) s.defeated.push('ch02-collector');
  s.chapter.stage = 'shutdown';
}
export interface SecondEvent {
  id: string;
  flag: string;
  stage: ChapterStage;
}
export function secondEvent(s: State): SecondEvent | null {
  const event = (
    id: string,
    flag: string,
    stage: ChapterStage,
  ): SecondEvent | null =>
    s.flags.includes(flag) ? null : { id, flag, stage };
  if (s.map === 'merca' && !s.flags.includes('ch02:arrival'))
    return event('ch02_arrival', 'ch02:arrival', 'inquiry');
  if (s.map === 'merca-depot' && !s.flags.includes('ch02:manifest'))
    return event('ch02_manifest', 'ch02:manifest', 'rest');
  if (s.map === 'merca-depot' && !s.flags.includes('ch02:rest-entry'))
    return event('ch02_rest_entry', 'ch02:rest-entry', 'office');
  if (s.map === 'merca-office')
    return event('ch02_office', 'ch02:office', 'waterway');
  if (s.map === 'merca-waterway' && s.z < 8 && !s.flags.includes('ch02:flow'))
    return event('ch02_flow', 'ch02:flow', 'sever');
  if (s.map === 'merca-waterway' && s.z < -18)
    return event('ch02_sever', 'ch02:sever', 'core');
  if (s.map === 'merca-core' && !s.flags.includes('ch02:core'))
    return event('ch02_core', 'ch02:core', 'boss');
  if (s.flags.includes('ch02:boss')) {
    if (!s.flags.includes('ch02:rescue'))
      return event('ch02_rescue', 'ch02:rescue', 'shutdown');
    if (!s.flags.includes('ch02:shutdown'))
      return event('ch02_shutdown', 'ch02:shutdown', 'records');
    if (!s.flags.includes('ch02:records'))
      return event('ch02_records', 'ch02:records', 'return');
    if (s.map === 'merca' && !s.flags.includes('ch02:return'))
      return event('ch02_return', 'ch02:return', 'departure');
    if (s.map === 'merca-depot' && s.flags.includes('ch02:return'))
      return event('ch02_rest_exit', 'ch02:rest-exit', 'departure');
  }
  return null;
}
export function finishSecondEvent(s: State, e: SecondEvent): void {
  if (!s.chapter || s.flags.includes(e.flag)) return;
  if (e.flag === 'ch02:sever') learnSkill(s, 'star-sever');
  if (e.flag === 'ch02:rescue') {
    s.hp = Math.max(1, s.hp);
    s.chapter.liliaHP = Math.max(1, s.chapter.liliaHP);
  }
  if (e.flag === 'ch02:rest-entry' || e.flag === 'ch02:rest-exit')
    secondRest(s, e.flag);
  mark(s, e.flag);
  s.chapter.stage = e.stage;
  if (e.flag === 'ch02:records') relocate(s, 'merca');
}
export function departSecondChapter(s: State): boolean {
  if (!s.chapter || !s.flags.includes('ch02:rest-exit')) return false;
  mark(s, 'ch02:complete');
  s.chapter.number = 3;
  s.chapter.stage = 'complete';
  relocate(s, 'north-road');
  return true;
}
export function secondObjective(s: State): string {
  if (s.flags.includes('ch02:complete'))
    return '第二章完了 · 次は北方の観測塔へ';
  if (!s.flags.includes('ch02:arrival'))
    return 'メルカの市場で、住民の異変を確かめる';
  if (!s.flags.includes('ch02:rest-entry'))
    return '市場のカイの仕事場へ · 配送控えを確認する';
  if (!s.flags.includes('ch02:office')) return '市場の北にある管理施設へ';
  if (!s.flags.includes('ch02:flow')) return '保守通路で導管と保守記録を調べる';
  if (!s.flags.includes('ch02:sever'))
    return '地下水路の奥へ · セナと停止盤へ向かう';
  if (!s.flags.includes('ch02:boss'))
    return '星断ちで吸収器を止め、一閃で本体を攻める';
  if (!s.flags.includes('ch02:records'))
    return '住民を救護し、炉を停止して記録庫を調べる';
  if (!s.flags.includes('ch02:rest-exit'))
    return '街の様子を確かめ、カイの仕事場で出発前に休息する';
  return '北門から観測塔へ · 王都への照会はその後に';
}
Object.assign(dialogues, {
  ch02_arrival: [
    [
      '語り',
      '翌日の夕方。水路と荷揚げ場に囲まれた交易都市メルカへ、二人はたどり着いた。荷車は立ち止まり、荷札には名前のない空欄がある。',
    ],
    [
      '商人',
      '王立調査隊の印？ その印の荷なら、水路の……あれ、どこだったか。帳簿を見直さないと。',
    ],
    ['カイ', '兄さん、トーマ！ 俺だよ、カイ。今日の荷は一緒に運んだだろう？'],
    [
      'トーマ',
      'お前の名前は分かる。でも、一緒に働いていた場面が、抜け落ちているんだ。',
    ],
    [
      'リリア',
      '体調を確かめるね。……熱はない。薬や回復だけでは、この記憶は戻せない。',
    ],
    [
      'ユウ',
      'アルネ村でも、人が仕事や歌を忘れていた。黒い霧が結界を歪め、記憶を吸い上げる道を作っていたんだ。守護精霊を救って、結界は戻せたけれど。',
    ],
    [
      'リリア',
      '祈りは、一時的に意識を覆う忘却を払える。でも、失った人生の記憶すべてを戻す力ではないの。',
    ],
    [
      'カイ',
      'その革袋の紋章、地下へ運んだ機材で見たぞ。兄さんの症状を止めたい。俺の仕事場で配送控えを見てくれ。',
    ],
    [
      'ユウ',
      '僕の過去の手がかりかもしれない。でも、まず困っている人を助けよう。',
    ],
  ],
  ch02_manifest: [
    [
      'カイ',
      'これが配送控え。王立調査隊の紋章がついた機材を、地下水路の水質改善設備へ運んだ。症状が始まった時期も同じだ。',
    ],
    ['ユウ', '袋の印と同じ……僕は調査隊の人間だったのかな。'],
    [
      'カイ',
      '俺に身元は保証できない。ただ配送先なら分かる。兄さんを助けるために協力する。',
    ],
  ],
  ch02_rest_entry: [
    [
      '語り',
      'カイの仕事場で夜を明かす。リリアは住民から聞いた症状と発生時期を書きとめた。',
    ],
    [
      'リリア',
      '水質改善の機材が届いてから、名前や仕事の記憶が抜け始めている。明日の朝、管理施設に聞きに行こう。',
    ],
    [
      '語り',
      '二人は休息した。HP・MPが最大まで回復する。市場へ戻り、北の管理施設へ向かおう。',
    ],
  ],
  ch02_office: [
    [
      '管理責任者',
      '症状は、設備による治療の一時的な副作用だ。地下への立ち入りは認めない。',
    ],
    ['ユウ', '水質改善と掲示しているのに、治療？ なぜ説明が変わるんですか。'],
    ['語り', '責任者は答えず、二人を施設の外へ出した。'],
    [
      'リリア',
      '機材の搬入と症状が重なる。でも、これだけで王国全体が敵だとは言えない。地下の事実を確かめよう。',
    ],
    [
      'セナ',
      '私は保守員のセナ。点検中、管の奥から住民の会話や歌が聞こえたんです。報告しても退けられて……。保守通路なら案内できます。',
    ],
    ['リリア', '村の霧から聞いた声に似ている。調べなければ。'],
    ['カイ', '俺は外で、住民を近づけないようにする。兄さんのためにも、頼む。'],
    ['語り', 'セナに続いて施設の奥へ進むと、地下の保守通路に入れる。'],
  ],
  ch02_flow: [
    [
      '語り',
      '青い導管の継ぎ目に黒い霧が絡む。「水路の……」「一緒に働いて……」。地上で聞いた言葉が、管からこぼれる。',
    ],
    [
      'リリア',
      '村と同じように、何かが人の記憶を引き寄せている。でも、ユウの記憶も同じ原因かは分からない。',
    ],
    [
      '語り',
      'ペンダントが温かくなり、星剣が光る。一閃で霧を払っても、隣の装置から流れが戻ってきた。',
    ],
    [
      'セナ',
      '点検図では、住民側の導管が中枢の収集設備につながっています。この保守記録も証拠になります。停止盤へ行きましょう。',
    ],
  ],
  ch02_sever: [
    ['語り', '防衛装置が動き、細い光がセナを導管へ引き寄せる。'],
    [
      'リリア',
      '私の声を聞いて！ ……祈りで混乱は抑えられるけど、引き寄せる力が止まらない！',
    ],
    ['ユウ', '村では精霊を傷つけず、霧だけを破れた。今度は、この細い光を……。'],
    [
      '語り',
      'ペンダントと剣の反応を追い、ユウは装置とセナを結ぶ接続だけを切り離した。セナはその場に膝をつく。',
    ],
    ['ユウ', '霧を払うだけじゃない……つながっているところを、断てばいい。'],
    [
      '語り',
      '「星剣 → 星断ち」を習得。敵一体に32ダメージ、MP6。コレクターの吸収器を選ぶと接続を解除できる。一閃は本体への主力。救出の演出ではMPを消費しない。',
    ],
  ],
  ch02_core: [
    [
      '語り',
      '設備の管理記録に「小型星環炉」とある。水を浄化するだけでなく、住民の記憶を集め、蓄積する設備だった。',
    ],
    [
      '管理責任者',
      '収集は必要な事業だ！ 止めれば事業が失敗し、王都への供給も途絶える。記録庫は閉鎖する。',
    ],
    ['語り', '責任者は防衛機構《コレクター》を起動し、制御室から退避した。'],
    ['ユウ', '記録を追うより先に、住民との接続を止める！'],
    [
      'セナ',
      '本体と二つの吸収器があります。片方でも接続中なら本体の障壁は半減。星断ちか、攻撃で吸収器を止められます。再接続はありません。',
    ],
    [
      'リリア',
      '一閃で破れる村の霧の鎧とは違うんだね。忘却は祈りで、圧縮の予兆には防御で備えよう。',
    ],
  ],
  ch02_rescue: [
    [
      '語り',
      'コレクターの防衛機構が停止する。炉を爆破することなく、二人はセナを呼んだ。',
    ],
    [
      'リリア',
      '倒れた仲間は保守員と救護するね。意識を確かめてから手当てを。私も、意識が戻るまでそばについている。',
    ],
    ['語り', '戦闘不能の仲間は救護によってHP1で意識を取り戻す。'],
  ],
  ch02_shutdown: [
    ['セナ', '停止盤を操作します。ユウ、残った住民側の接続をお願いします。'],
    [
      '語り',
      '星断ちが弱い接続を外す。リリアは保守員と避難者の意識を確かめ、カイは地上へ連絡し救護を手配する。区画の黒い霧が薄れた。',
    ],
    [
      'リリア',
      '収集中だった記憶の一部は戻るみたい。でも蓄積されたすべてを戻す方法は、まだ分からない。世界の霧まで消えたわけではないね。',
    ],
  ],
  ch02_records: [
    [
      '語り',
      '停止後に開いた記録庫から、輸送記録と北方任務の同行者記録が見つかった。',
    ],
    [
      'セナ',
      '同行者に「ユウ」。備考は「青い石のペンダントを所持」。任務の目的地は北方の観測塔です。',
    ],
    [
      'ユウ',
      '名前とペンダントが一致する……僕の記録である可能性は高い。でも、記憶は戻らない。正式な隊員だったのか、役目も分からない。',
    ],
    [
      'セナ',
      '任務欄は「中核物品の確認・搬出」。物品の名称や用途はありません。指揮欄には調査隊長の氏名もあります。あなたとの関係までは、記録にありません。',
    ],
    [
      'リリア',
      '詳細記録は観測塔の記録装置に残す運用。都市の書類には経過がないのね。',
    ],
    ['ユウ', '僕も、この設備に関わっていたのかな。'],
    [
      'リリア',
      'この記録だけでは、まだ分からない。でも、確かめる場所は見つかった。',
    ],
    ['語り', '二人は北方任務と搬入記録の写しを携え、街へ戻る。'],
  ],
  ch02_return: [
    [
      '語り',
      'セナとカイの確保した証拠をもとに、管理責任者は都市の警備へ引き渡された。捜査や裁判の結末は、まだ分からない。',
    ],
    [
      'トーマ',
      'カイ……二人で雨の中、荷を運んだことを思い出した。でも、仕分けの手順はまだ抜けている。',
    ],
    ['カイ', '思い出せない分は、また一緒にやろう。今日の荷からでいい。'],
    [
      'リリア',
      '症状を止めることと、失った記憶をすべて戻すことは同じじゃない。生活の復旧も、これからだね。',
    ],
    [
      'カイ',
      '観測塔なら北門から分岐を進め。機材の配送経路を教えるよ。現場には詳細記録が残っているはずだ。',
    ],
    [
      'ユウ',
      '先に観測塔で事実を確認して、その後、王都で調査隊に問いただそう。王都では事業側の説明しか得られないかもしれない。',
    ],
    [
      'カイ',
      '俺は兄さんと街の復旧を支える。同行はできないが、連絡や物資の輸送なら任せてくれ。出発前に仕事場で休んでいけ。',
    ],
  ],
  ch02_rest_exit: [
    [
      '語り',
      'カイの仕事場で出発前の休息をとった。二人のHP・MPが最大まで回復する。',
    ],
    ['カイ', '北門へ行けば観測塔方面だ。二人とも、無事で！'],
  ],
  ch02_departure: [
    [
      '語り',
      '街の記憶収集は止まった。けれど、ユウの過去の役割はまだ分からない。',
    ],
    ['ユウ', '僕自身が関わっていたのかもしれない。確かめよう、観測塔で。'],
    [
      '語り',
      '第二章 完了。二人は北方街道へ歩き出す。第三章の物語は、これから。',
    ],
  ],
  sena: [
    [
      'セナ',
      '保守通路は施設の奥です。点検図を持って、一緒に停止盤へ向かいましょう。',
    ],
  ],
  manager: [
    ['管理責任者', '地下は立入禁止だ。設備の稼働を妨げないでもらおう。'],
  ],
  shutdown: [
    ['セナ', '停止盤は止まっています。住民側の接続も、もう外れている。'],
  ],
  flow: [
    [
      'セナ',
      '住民側の導管から中枢へ、流れが集まっています。保守記録は確保しました。',
    ],
  ],
  merchant: [['商人', '仕入れ先は帳簿にあるのに、相手の顔が思い出せない……。']],
  craftsman: [
    ['職人', '道具の名前は言える。でも使う手順が、どうしても分からない。'],
  ],
  family: [
    ['子ども', 'お母さんとここへ来たこと、覚えてない。大丈夫かな……。'],
    ['母親', '一緒にいるよ。焦らず、少しずつ。'],
  ],
  merchant_after: [
    [
      '商人',
      '届け先が少し戻った。顔はまだ曖昧だけど、帳簿を頼りにまた始めるよ。',
    ],
  ],
  craftsman_after: [
    [
      '職人',
      '手順はまだ全部じゃない。隣の職人に教わりながら、やり直している。',
    ],
  ],
  family_after: [
    [
      '母親',
      '不安は落ち着いたみたい。戻らない思い出の分も、これから一緒に過ごします。',
    ],
  ],
  toma: [
    [
      'トーマ',
      'カイの名前は覚えている。一緒に働いた日々が、ところどころ抜けているんだ。',
    ],
  ],
  toma_after: [
    [
      'トーマ',
      '雨の中で荷を運んだ日のことを思い出した。仕事の手順はまた教えてもらうよ。',
    ],
  ],
  kai: [
    [
      'カイ',
      '仕事場は市場の西側だ。配送控えを見て、兄さんの症状を止めてくれ。',
    ],
  ],
  notice: [
    [
      '語り',
      '「王国水質改善事業・地下管理区画は立入禁止」。荷札には王立調査隊の紋章がある。',
    ],
  ],
  'ch02-supply': [['語り', '救護箱から薬草を二つ手に入れた。']],
  'north-sign': [
    [
      '語り',
      '「北方・観測塔方面」。ユウたちは任務の詳細記録を確かめに向かう。その後、王都へ。',
    ],
  ],
});
