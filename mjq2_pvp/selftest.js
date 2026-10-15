// ============================================================
// 马嘉棋2 逻辑回归自测（无第三方依赖）
// 用法：node selftest.js
// 原理：用最小 DOM 桩加载 ma_jia_qi_2.html 内的游戏脚本，
//       再直接调用内部函数断言关键行为。改动游戏逻辑后请重跑。
// 覆盖：卡组限张/不可携带卡拦截/卡组码往返/指挥点槽成长/
//       发现敌人行判定/毁坏/好高骛远/重复挂同名反制提示
// ============================================================
const fs = require('fs'), vm = require('vm');

function makeEl() {
  return {
    id: '', className: '', style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
    children: [], parentElement: null, offsetWidth: 560, offsetHeight: 560, scrollTop: 0, scrollHeight: 0,
    classList: {
      _s: new Set(),
      add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); },
      toggle(x, f) { if (f === undefined) { this._s.has(x) ? this._s.delete(x) : this._s.add(x); } else { f ? this._s.add(x) : this._s.delete(x); } }
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() { }, insertBefore() { },
    querySelectorAll() { return []; }, querySelector() { return null; },
    addEventListener() { }, setAttribute() { }, getAttribute() { return null; },
    closest() { return null; }, select() { }, focus() { },
    getBoundingClientRect() { return { left: 0, top: 0, width: 56, height: 56 }; }
  };
}
const cache = {};
const document = {
  getElementById(id) { return cache[id] || (cache[id] = makeEl()); },
  createElement() { return makeEl(); },
  querySelectorAll() { return []; },
  addEventListener() { },
  execCommand() { return true; }
};
const sandbox = {
  document, console,
  location: { search: '', pathname: '/', hostname: 'localhost', protocol: 'http:', host: 'localhost:3000' },
  window: { addEventListener() { } },
  navigator: {},
  setTimeout: () => 0, clearTimeout: () => { },
  WebSocket: function () { this.readyState = 3; },
  prompt: () => null,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  escape: (s) => s,
  unescape: (s) => s,
  URLSearchParams
};
sandbox.globalThis = sandbox;

const html = fs.readFileSync('ma_jia_qi_2.html', 'utf8');
const builderHtml = fs.readFileSync('deck_builder.html', 'utf8');
const batMain = new TextDecoder('gbk').decode(fs.readFileSync('启动双人联机.bat'));   // 启动脚本自 2026-10-04 起为 GBK（chcp 936）
const batClear = fs.readFileSync('清理端口.bat', 'utf8');
const serverJs = fs.readFileSync('server.js', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const test = `
;(function(){
  const P = (k, v) => console.log(k + ' => ' + v);
  // 地图（2026-10-06 第八批）：红方大本营 12 号格、蓝方 89 号格；RH / BH 是 0-based 下标
  const RH = RED_HOME - 1, BH = BLUE_HOME - 1;
  P('卡组校验 5×广积粮(普通限4)', validateDeck(['granary','granary','granary','granary','granary']));
  P('卡组校验 4×广积粮', validateDeck(['granary','granary','granary','granary']));
  P('卡组校验 核威慑(不可携带)', validateDeck(['nuke']));
  P('卡组校验 计划(不可携带)', validateDeck(['plan']));
  P('卡组校验 趁虚而入7K档(不可携带)', validateDeck(['seize7']));
  P('卡组校验 趁虚而入9K档(可携带)', validateDeck(['seize']));
  P('卡组校验 单点打击(不可携带)', validateDeck(['single_strike']));
  P('卡组校验 超45张', validateDeck(new Array(46).fill('granary').map((x,i)=> i<4?'granary':'scatter')));
  const codeStr = (deck = ['granary','carpet'], encodeDeck());
  P('卡组码前缀/解码', codeStr.slice(0, 2) + ' / ' + decodeDeck(codeStr).ok);

  // 槽成长：每回合 +1，达到 20 后不再增长
  redSlot = 1; const seq = [];
  for (let i = 0; i < 23; i++) { if (redSlot < 20) redSlot += 1; seq.push(Math.floor(redSlot)); }
  P('红方 cp 序列(23回合)', seq.join(','));
  P('槽单位是否始终为整数', seq.every(Number.isInteger));

  // 发现敌人：41~60 号格（第5、6行）触发
  round = 'red';
  cellEffects = []; blueReaction = []; redReaction = [];
  blueReaction.push({ cardId: 'discover_enemy', uid: 1 });
  blueHand = [{ cardId: 'discover_enemy', uid: 1 }];
  deck = []; blueDeckLocal = []; redHand = [];
  for (let i = 0; i < 20; i++) deck.push('scatter');
  notifyOccupation(41, 'red', 'blue'); P('占领41号格 → 蓝方手牌', blueHand.length);
  blueReaction = []; blueHand = [{ cardId: 'discover_enemy', uid: 2 }];
  notifyOccupation(51, 'red', 'blue'); P('占领51号格 → 蓝方手牌', blueHand.length);

  // 好高骛远：翻过但未取用的牌应回到牌堆底，不再永久丢弃
  round = 'red'; costMods = {};
  deck = ['scatter', 'granary', 'carpet']; redHand = [{ cardId: 'scatter', uid: 900 }];
  CARDS['ambitious'].effect();
  pendingChoice.options[0].run();
  P('好高骛远 手牌', redHand.map(c => c.cardId).join(','));
  P('好高骛远 牌库(应保留 carpet + 翻过的 scatter)', deck.join(','));

  // 毁坏：仅弃掉被选中的一张，其余候选留在敌方手中
  blueHand = [{ cardId: 'carpet', uid: 1 }, { cardId: 'winter', uid: 2 }, { cardId: 'rest', uid: 3 }, { cardId: 'blitz', uid: 4 }];
  redHand = [];
  CARDS['destroy'].effect();
  const before = blueHand.length, candN = pendingChoice.options.length;
  pendingChoice.options[0].run();
  P('毁坏 候选数', candN);
  P('毁坏 敌方手牌 前/后(应 -1)', before + '/' + blueHand.length);
  P('毁坏 我方获得', redHand.map(c => c.cardId).join(','));

  // 控制类易主：保留该格词条，但绑定词条（绝对防御/临时征召）随格失守移除
  round = 'red'; redReaction = []; blueReaction = []; costMods = {};
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[1] = 'red'; team[10] = 'red'; team[11] = 'red';  // 红方 1/2/11/12
  team[12] = 'blue'; force[12] = 10;                                     // 13 号格：蓝方 10 兵
  cellEffects = [
    { id: 13, type: 'suppress', owner: 'blue', turnCasted: 0 },
    { id: 13, type: 'pol_morale', owner: 'blue', turnCasted: 0 },
    { id: 13, type: 'abs_defense', owner: 'blue', turnCasted: 0 },
    { id: 13, type: 'levee', owner: 'blue', turnCasted: 0, leveePower: 30 }
  ];
  CARDS['chaos'].effect({ target: 13, owner: 'red' });
  P('混乱后 13 号格归属(应为 red)', team[12]);
  P('混乱后保留的词条(应只剩 suppress,pol_morale)', cellEffects.map(e => e.type).join(','));
  P('混乱不再整格清空词条', CARDS['chaos'].effect.toString().indexOf('purgeCellEffects') === -1);
  P('叛乱不再整格清空词条', CARDS['rebellion'].effect.toString().indexOf('purgeCellEffects') === -1);
  P('快速联络不再整格清空词条', CARDS['fastlink'].effect.toString().indexOf('purgeCellEffects') === -1);
  P('边境巡查控制保留词条', CARDS['border_patrol'].effect.toString().indexOf('purgeCellEffects') === -1);

  // 绝对防御被敌方控走后必须失效，不能反过来保护任何大本营
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  cellEffects = [{ id: 10, type: 'abs_defense', owner: 'red', turnCasted: 0 }];
  team[9] = 'red';
  P('己方持有绝对防御时词条留存', dropOwnerBoundEffects() === undefined && cellEffects.length);
  team[9] = 'blue'; dropOwnerBoundEffects();
  P('10 号格被控走后绝对防御已移除(应为 0)', cellEffects.length);

  // 相邻判定不再跨行误判：10 号格与 11 号格不相邻
  P('orthNeighbors(10) 含 9/20 且不含 11', orthNeighbors(10).sort((a, b) => a - b).join(','));

  // 快速联络：目标格须与某个己方格曼哈顿距离≤13
  round = 'red';
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[1] = 'red'; team[10] = 'red'; team[11] = 'red'; // 红方初始 1/2/11/12
  P('快速联络 目标70(距12号格13格,应放行)', validateCardTarget(CARDS['fastlink'], 70));
  P('快速联络 目标80(最近己方格14格,应拒绝)', validateCardTarget(CARDS['fastlink'], 80));
  team[59] = 'red'; // 己方据点推进到 60 号格
  P('快速联络 目标80(据点60号格旁2格,应放行)', validateCardTarget(CARDS['fastlink'], 80));
  P('快速联络 目标89(蓝方大本营,应拒绝)', validateCardTarget(CARDS['fastlink'], BLUE_HOME));

  // 单点打击：对敌方大本营 10 点并抽 1 张
  round = 'blue'; turnCounter = 0; cellEffects = []; blueReaction = []; redReaction = [];
  blueHand = []; blueDeckLocal = ['granary']; deck = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  CARDS['single_strike'].effect();
  P('单点打击后红方大本营兵力(50-10→40)', force[RH]);
  P('单点打击后蓝方手牌(+1)', blueHand.length);

  // 免疫：大本营免疫一回合 + 获得 1 个指挥点槽
  round = 'red'; turnCounter = 0; redSlot = 5; redCp = 0; cellEffects = []; redHand = [];
  CARDS['immunity'].effect();
  P('免疫后指挥点槽(5→6)', redSlot);
  applyForceDelta(1, -30, 'blue');
  P('免疫期间红方大本营不吃 30 伤害(应仍为40)', force[RH]);

  // 饱和炮击 / 核武器打击：不会把敌方格子打到负兵力
  round = 'red'; turnCounter = 0; cellEffects = []; redHand = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[49] = 'blue'; force[49] = 3;
  CARDS['nuke_strike'].effect();
  P('核武器打击后 50 号格兵力(3→0,不为负)', force[49]);
  P('核武器打击后 50 号格归属(中立,不被抢走)', team[49]);
  team[49] = 'blue'; force[49] = 3;
  CARDS['satbarrage'].effect();
  P('饱和炮击后 50 号格 兵力/归属', force[49] + '/' + team[49]);

  // 随机伤害类卡牌一律不会把敌方格子打到负兵力
  round = 'red'; turnCounter = 0; cellEffects = []; redHand = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50;
  let flipped = false, negative = false;
  for (let k = 0; k < 40; k++) {
    team[49] = 'blue'; force[49] = 3;
    CARDS['scatter'].effect({ target: 50, owner: 'red' });
    if (force[49] < 0) negative = true;
    if (team[49] === 'red') flipped = true;
  }
  P('随机弹道 出现过负兵力？（应 false）', negative);
  P('随机弹道 曾归红方？（应 false）', flipped);
  team[49] = 'blue'; force[49] = 6;
  applyForceDelta(50, -6, 'red');
  P('恰好打到 0 → 兵力 0 的施放方格(red/0)', team[49] + '/' + force[49]);
  team[49] = 'blue'; force[49] = 5;
  applyForceDelta(50, -6, 'red');
  P('超杀(本会 <0) → 兵力 0 的中立格(none/0)', team[49] + '/' + force[49]);
  round = 'red'; team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  redReaction = []; blueReaction = []; lastDitchDefender = null; attackedCells = [];
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 20; team[2] = 'blue'; force[2] = 5;
  arrows = [{ from: 2, to: 3, num: -19, team: 'red', type: 'attack' }];
  settleArrows();
  P('对战（普通攻击）超杀仍可抢地(red/14)', team[2] + '/' + force[2]);
  team[49] = 'blue'; force[49] = 3;
  CARDS['bio_squad'].effect({ target: 1, owner: 'red' });
  P('生化小队后 50 号格 兵力/归属(不为负)', force[49] + '/' + team[49]);

  // 军事中心：+50，回合结束时该格 -40 并发一张「兵力增强」
  round = 'red'; turnCounter = 3; cellEffects = []; redHand = []; costMods = {};
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[11] = 'red'; force[11] = 10;
  CARDS['military_center'].effect({ target: 12, owner: 'red' });
  P('军事中心后 12 号格兵力(10+50→60)', force[11]);
  P('12 号格行动花费减免(应 0)', cellActionDiscount(12));
  tickEffects('red');
  P('回合末 -40(60→20)', force[11]);
  P('回合末获得一张牌(应为 force_amp)', redHand.map(c => c.cardId).join(','));

  // 研发链：军事研发 → 扩展军事研发 → 高级军事研发
  round = 'red'; redHand = []; costMods = {};
  CARDS['mil_research'].effect();
  P('军事研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('军事研发第二项到手', redHand.map(c => c.cardId).join(','));
  redHand = [];
  CARDS['ext_research'].effect();
  P('扩展军事研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('扩展军事研发第二项到手', redHand.map(c => c.cardId).join(','));

  // 义务兵 / 政治鼓舞 只影响本方：敌方手里与卡组里的同名卡不变价
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} }; uidCostOverride = {};
  deck = ['granary', 'carpet', 'scatter']; blueDeckLocal = ['granary', 'carpet', 'scatter'];
  redHand = [{ cardId: 'granary', uid: 9001 }]; blueHand = [{ cardId: 'granary', uid: 9002 }];
  CARDS['conscript'].effect();
  P('义务兵后 红方 granary(3→2)', getCardCost('granary', 'red'));
  P('义务兵后 蓝方 granary(仍 3)', getCardCost('granary', 'blue'));
  P('义务兵后 红方手牌 granary 仍原价(uid 抵消→3)', instCost(redHand[0], 'red'));
  P('义务兵后 蓝方手牌 granary(仍 3)', instCost(blueHand[0], 'blue'));

  round = 'red'; turnCounter = 0; costMods = { red: {}, blue: {} }; uidCostOverride = {};
  deck = ['granary', 'carpet']; blueDeckLocal = ['granary', 'carpet'];
  team = new Array(TOTAL_CELLS).fill('none'); team[RH] = 'red'; cellEffects = [];
  CARDS['pol_morale'].effect();
  P('政治鼓舞后 红方 granary(3→2)', getCardCost('granary', 'red'));
  P('政治鼓舞后 蓝方 granary(仍 3)', getCardCost('granary', 'blue'));
  P('政治鼓舞后 红方 carpet(9→8)', getCardCost('carpet', 'red'));
  P('政治鼓舞后 蓝方 carpet(仍 9)', getCardCost('carpet', 'blue'));

  // 卡组上限 50（原 45）
  const fill = (n) => {
    const out = [];
    ['granary', 'supply', 'conquer', 'scatter', 'defeat', 'clear_effect', 'loot', 'ambitious', 'back_prod', 'limit_mission', 'suppress', 'retreat']
      .forEach(id => { for (let k = 0; k < 4; k++) out.push(id); });
    ['levee', 'rally', 'rebellion', 'demoralize']
      .forEach(id => { for (let k = 0; k < 3; k++) out.push(id); });
    return out.slice(0, n);
  };
  P('卡组 50 张合法(上限已放宽)', validateDeck(fill(50)));
  P('卡组 51 张被拒', validateDeck(fill(51)));

  // 养精蓄锐：伤害≠1 的洗入副本视为"构筑之外"
  round = 'red'; carriedCardIds = { build_strength: 1, granary: 1 }; rallyDmg = { red: 1, blue: 1 };
  P('养精蓄锐(伤害1) 视为构筑内', isBuiltCard('build_strength', 'red'));
  rallyDmg = { red: 4, blue: 1 };
  P('养精蓄锐(伤害≠1) 视为构筑之外', !isBuiltCard('build_strength', 'red'));
  P('养精蓄锐判定按方独立(蓝方伤害仍为1)', isBuiltCard('build_strength', 'blue'));
  P('普通卡仍按携带名单判定', isBuiltCard('granary', 'red') && !isBuiltCard('nuke', 'red'));

  // 牌堆为空惩罚：只由本方牌堆为空触发，且只结算本方格子
  round = 'red'; cellEffects = []; growthFactor = { red: 1, blue: 1 };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(10);
  team[RH] = 'red'; team[BH] = 'blue'; force[RH] = 30; force[BH] = 30; force[50] = 30; // 50 号格中立
  deck = []; blueDeckLocal = [];
  drawFrom(deck, 1, 'red');
  P('红方牌堆空 → 红方格子-2(30→28)', force[RH]);
  P('红方牌堆空 → 敌方格子不受影响(仍30)', force[BH]);
  P('红方牌堆空 → 中立格不受影响(仍30)', force[50]);
  P('红方增长系数减半(→0.5)', growthFactor.red);
  P('敌方增长系数不受红方影响(仍1)', growthFactor.blue);
  drawFrom(blueDeckLocal, 1, 'blue');
  P('蓝方牌堆空 → 蓝方格子-2(30→28)', force[BH]);
  P('蓝方牌堆空 → 红方格子不受影响(仍28)', force[RH]);
  P('蓝方增长系数减半(→0.5)', growthFactor.blue);

  // 趁虚而入 +55 / 生化小队 +65
  round = 'red'; cellEffects = []; redHand = []; costMods = {};
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[12] = 'red'; force[12] = 10;          // 13 号格（普通格，非大本营）
  CARDS['seize'].effect({ target: 13 });
  P('趁虚而入 9K档 +55(10→65)', force[12]);
  CARDS['seize0'].effect({ target: 13 });
  P('趁虚而入 0K档 +55(65→99封顶)', force[12]);
  force[12] = 10;
  CARDS['bio_squad'].effect({ target: 13 });
  P('生化小队 +65(10→75)', force[12]);

  // 闪电袭击：25 伤害落在"抽牌方（= 挂反制方的敌方）"的大本营；回合开始固定抽牌不触发
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = {};
  redReaction = [{ cardId: 'lightning_raid', uid: 1 }]; redHand = [{ cardId: 'lightning_raid', uid: 1 }];
  blueReaction = []; blueHand = []; deck = []; blueDeckLocal = new Array(10).fill('granary');
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[BH] = 'blue'; force[RH] = 50; force[BH] = 50;
  isTurnStartDraw = false;
  draw(1, 'blue');
  P('闪电袭击 敌方额外抽牌 → 抽牌方大本营(50-25→25)', force[BH]);
  P('闪电袭击 挂反制方自己大本营不受影响(仍50)', force[RH]);
  P('闪电袭击 反制被消耗(应0)', redReaction.length);
  redReaction = [{ cardId: 'lightning_raid', uid: 2 }]; redHand = [{ cardId: 'lightning_raid', uid: 2 }];
  blueDeckLocal = new Array(10).fill('granary'); force[BH] = 50;
  isTurnStartDraw = true;                       // 模拟"每回合固定抽 1 张"
  draw(1, 'blue');
  P('闪电袭击 回合开始固定抽牌不触发(仍50)', force[BH]);
  P('闪电袭击 该反制未被消耗(应1)', redReaction.length);
  isTurnStartDraw = false;

  // 联邦国家：条件看"自己"大本营（2026-10-05 起门槛 150），伤害打"敌方"大本营（100）
  round = 'red'; turnCounter = 0; cellEffects = []; redHand = []; costMods = {}; blueReaction = [];
  deck = new Array(6).fill('granary'); blueDeckLocal = ['granary', 'granary', 'granary', 'granary'];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[BH] = 'blue'; force[RH] = 150; force[BH] = 120;
  CARDS['federal'].effect();
  P('联邦国家 己方大本营(应仍150)', force[RH]);
  P('联邦国家 敌方大本营(120-100→20)', force[BH]);

  // 局部抵抗：这 10 点伤害归属施放方，免疫/国家消防局/西苏精神都能拦（此前归属写反）
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  blueReaction = [{ cardId: 'sisu', uid: 9 }]; blueHand = [{ cardId: 'sisu', uid: 9 }];
  deck = []; blueDeckLocal = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[BH] = 'blue'; force[RH] = 50; force[BH] = 50; team[10] = 'none'; force[10] = 5;
  CARDS['local_resist'].effect({ target: 11 });
  P('局部抵抗 遇西苏反弹 → 施放方大本营(50-10→40)', force[RH]);
  P('局部抵抗 敌方大本营不承伤(应仍50)', force[BH]);

  // 新兵入伍（2026-10-06 改版）：只让"被占领方"（= 挂反制的一方）所有格子 +10
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = {};
  blueReaction = [{ cardId: 'new_recruit', uid: 5 }]; blueHand = [{ cardId: 'new_recruit', uid: 5 }];
  deck = new Array(10).fill('granary'); blueDeckLocal = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  team[10] = 'blue'; force[10] = 22;      // 11 号格：蓝方 22
  team[12] = 'red'; force[12] = 30;       // 13 号格：红方 30
  force[49] = 7;                          // 50 号格：中立 7
  notifyOccupation(13, 'red', 'blue');    // 红方占领 13 号格（蓝方挂的新兵入伍）
  P('新兵入伍 蓝方普通格(22→32)', force[10]);
  P('新兵入伍 蓝方大本营(50→60)', force[BH]);
  P('新兵入伍 红方格不受影响(仍30)', force[12]);
  P('新兵入伍 红方大本营不受影响(仍50)', force[RH]);
  P('新兵入伍 中立格不受影响(仍7)', force[49]);

  // 养精蓄锐：伤害到 99 后仍然洗入，只是伤害不再增长
  round = 'red'; rallyDmg = { red: 99, blue: 1 }; deck = []; cellEffects = []; costMods = {};
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[10] = 'blue'; force[10] = 50;
  CARDS['build_strength'].effect({ target: 11 });
  P('养精蓄锐 99 时仍洗入本卡(牌库应含 build_strength)', deck.includes('build_strength'));
  P('养精蓄锐 99 时伤害不再增长(应仍99)', rallyDmg.red);

  // 反制"触发"进双方战报；"激活/取消反制"仍然不进战报
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  clearGameLog(); redCp = 10;
  redHand = [{ cardId: 'radio_jam', uid: 21 }]; redReaction = [];
  hangReaction(21);
  P('激活反制 不进战报(本地同屏, 应0条)', gameLog.length);
  reactionAnnounce('blue', '反制触发 · 测试反制', '对敌方大本营造成 40 伤害');
  P('反制触发 记入战报(应1条)', gameLog.length);
  P('触发战报内容', gameLog[0] ? gameLog[0].text : '(空)');
  P('触发战报 无 privateTeam(红蓝双方都能看到)', gameLog[0] ? !gameLog[0].privateTeam : false);

  // 武装抵抗：3K、对敌方格子 20 伤害、每溢出 2 点洗 1 张「抵抗」
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  P('武装抵抗 费用(应3)', CARDS['armed_resist'].cost);
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[10] = 'blue'; force[10] = 10;   // 11 号格：蓝方 10 兵
  deck = []; blueDeckLocal = ['granary'];
  CARDS['armed_resist'].effect({ target: 11 });
  P('武装抵抗 10兵格 溢出10 → 洗入5张抵抗', blueDeckLocal.filter(x => x === 'resist').length);
  P('武装抵抗 10兵格被20伤（超杀）→ 中立/0（新规则不再抢地）', team[10] + '/' + force[10]);
  team[10] = 'blue'; force[10] = 25; blueDeckLocal = ['granary'];
  CARDS['armed_resist'].effect({ target: 11 });
  P('武装抵抗 25兵格 无溢出 → 洗入0张', blueDeckLocal.filter(x => x === 'resist').length);
  P('武装抵抗 目标校验(大本营应被拒)', validateCardTarget(CARDS['armed_resist'], RED_HOME));
  P('武装抵抗 目标校验(敌方大本营应被拒)', validateCardTarget(CARDS['armed_resist'], BLUE_HOME));

  // 破译机：复制而非偷取（敌方卡组一张不少）
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  deck = []; blueDeckLocal = ['granary', 'scatter', 'carpet', 'radio_jam'];  // 3 指令 + 1 反制
  const blueBefore = blueDeckLocal.slice();
  CARDS['decoder'].effect();
  P('破译机 敌方卡组未被夺走(应4张不变)', blueDeckLocal.length);
  P('破译机 敌方卡组内容不变', blueDeckLocal.join(',') === blueBefore.join(','));
  P('破译机 己方卡组获得3张复制', deck.length);
  P('破译机 复制的都是指令', deck.every(cid => CARDS[cid].type === '指令'));

  // 军事要塞：敌方那张只复制（两步抉择：先敌方后己方）
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  deck = ['granary', 'scatter']; blueDeckLocal = ['carpet', 'winter', 'blitz'];
  const bLen = blueDeckLocal.length, rLen = deck.length;
  CARDS['fortress'].effect();
  pendingChoice.options[0].run();          // 选敌方一张
  pendingChoice.options[0].run();          // 选己方一张
  P('军事要塞 敌方卡组未被夺走(应仍3张)', blueDeckLocal.length === bLen);
  P('军事要塞 己方卡组 +2（敌方那张的复制 + 己方那张「开发」的复制）', deck.length - rLen);

  // 护理队：+1 指挥点槽 + 友方大本营 +20 兵力
  round = 'red'; turnCounter = 0; redSlot = 5;
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  CARDS['nursing_team'].effect();
  P('护理队 指挥点槽(5→6)', redSlot);
  P('护理队 友方大本营(50→70)', force[RH]);
  P('护理队 敌方大本营不受影响(仍50)', force[BH]);
  force[RH] = 95; CARDS['nursing_team'].effect();
  P('护理队 大本营 95+20=115（上限已放宽到200）', force[RH]);
  force[RH] = 195; CARDS['nursing_team'].effect();
  P('护理队 大本营 195+20 → 200（封顶）', force[RH]);

  // 加急电报：手牌选1张置卡组顶；被洗牌打乱后抽到依然是 0 费
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  uidCostOverride = {}; freeDrawTickets = { red: {}, blue: {} };
  redHand = [{ cardId: 'carpet', uid: 801 }]; deck = ['granary', 'granary'];
  CARDS['express_telegram'].effect();
  pendingChoice.options[0].run();
  P('加急电报 手牌已寄出(应0张)', redHand.length);
  P('加急电报 置于卡组顶(deck[0] 应=carpet)', deck[0]);
  deck.splice(0, 1); deck.push('carpet');   // 模拟军事要塞之类把牌库洗乱
  P('洗牌后 carpet 已在牌库末尾', deck[deck.length - 1]);
  drawFrom(deck, 3, 'red');
  const gotFree = redHand.find(c => c.cardId === 'carpet');
  P('加急电报 洗牌后抽到仍为 0 费', gotFree ? instCost(gotFree, 'red') : '未抽到');
  P('加急电报 同名其它副本不免费(牌库里的 granary 3K)', CARDS['granary'].cost);

  // 调度军队：大本营词条，本回合第 2 张指令时抽 2 张
  round = 'red'; turnCounter = 0; redSlot = 20; redCp = 40; cellEffects = [];
  costMods = { red: {}, blue: {} }; uidCostOverride = {}; blitzActive = null;
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50;
  blueReaction = []; redReaction = []; instrThisTurn = { red: 0, blue: 0 };
  cellEffects = [{ id: RH + 1, type: 'dispatch_army', owner: 'red', turnCasted: 0 }];
  deck = ['scatter', 'scatter', 'scatter']; blueDeckLocal = []; redHand = [{ cardId: 'granary', uid: 901 }];
  redCp = 40;
  playCard(901);                              // 第 1 张指令：不触发
  P('调度军队 第1张指令不抽牌(手牌应0)', redHand.length);
  redHand = [{ cardId: 'granary', uid: 902 }]; redCp = 40;
  playCard(902);                              // 第 2 张指令：抽 2 张
  P('调度军队 第2张指令抽2张(手牌应2)', redHand.length);
  P('调度军队 无该词条时不触发', (() => {
    cellEffects = []; redHand = [{ cardId: 'granary', uid: 903 }]; redCp = 40; instrThisTurn = { red: 0, blue: 0 };
    playCard(903); instrThisTurn.red = 1;
    redHand = [{ cardId: 'granary', uid: 904 }]; redCp = 40;
    playCard(904);
    return redHand.length === 0;
  })());

  // ===== 词条随军移动（2026-10-03 起所有非大本营格子的效果都随军） =====
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[20] = 'red'; force[20] = 20; team[21] = 'blue'; force[21] = 3;
  cellEffects = [
    { id: 21, type: 'pol_morale', owner: 'red', turnCasted: 0 },
    { id: 21, type: 'abs_defense', owner: 'red', turnCasted: 0 },
    { id: RH + 1, type: 'immunity', owner: 'red', turnCasted: 0 }
  ];
  arrows = [{ from: 21, to: 22, num: -19, team: 'red', type: 'attack' }];
  settleArrows();
  P('攻击占领后 21号格的词条跟随到 22号格', cellEffects.filter(e => e.id === 22).map(e => e.type).join(','));
  P('大本营(12号格)上的词条不移动', cellEffects.some(e => e.id === RH + 1 && e.type === 'immunity'));
  cellEffects = [
    { id: 21, type: 'mil_center', owner: 'red', turnCasted: 0 },
    { id: 21, type: 'rebellion', owner: 'red', turnCasted: 0 },
    { id: 21, type: 'fastlink_dmg', owner: 'red', turnCasted: 0 }
  ];
  moveCellEffects(21, 22, 'red');
  P('moveCellEffects 搬走普通词条', cellEffects.filter(e => e.id === 22).map(e => e.type).join(','));
  P('叛乱/快速联络脉冲 不随军', cellEffects.filter(e => e.id === 21).map(e => e.type).sort().join(','));
  cellEffects = [{ id: RH + 1, type: 'dispatch_army', owner: 'red', turnCasted: 0 }];
  moveCellEffects(RH + 1, 22, 'red');
  P('起点是大本营时不搬走词条', cellEffects[0].id === RH + 1);

  // ===== 寸步难行：敌方回合结束时按其行动次数×2 打其全场 =====
  round = 'red'; turnCounter = 5; cellEffects = []; costMods = { red: {}, blue: {} };
  growthFactor = { red: 0.25, blue: 0.25 };   // 关掉自然增长，便于断言
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 20; team[BH] = 'blue'; force[BH] = 50;
  blueReaction = [{ cardId: 'stuck', uid: 31 }]; blueHand = [{ cardId: 'stuck', uid: 31 }];
  redReaction = []; arrows = []; attackedCells = []; actionsThisTurn = { red: 3, blue: 0 };
  deck = new Array(10).fill('granary'); blueDeckLocal = new Array(10).fill('granary');
  gameOver = false; redSlot = 5; blueSlot = 5;
  nextRound();
  P('寸步难行：红方行动3次 → 普通格 20-6=14', force[1]);
  P('寸步难行：大本营同样受伤 50-6=44', force[RH]);
  P('寸步难行：反制被消耗(应0)', blueReaction.length);
  P('寸步难行：行动次数已随回合重置', actionsThisTurn.red);

  // ===== 国家消防局改版：被攻击即伤害=1 + 本方格子至多受1点 =====
  round = 'red'; turnCounter = 5; cellEffects = []; costMods = { red: {}, blue: {} };
  growthFactor = { red: 1, blue: 1 };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  team[10] = 'red'; force[10] = 30; team[1] = 'blue'; force[1] = 3;
  blueReaction = [{ cardId: 'fire_dept', uid: 41 }]; blueHand = [{ cardId: 'fire_dept', uid: 41 }];
  redReaction = []; fireDeptGuard = { red: false, blue: false }; arrows = [];
  arrows = [{ from: 11, to: 2, num: -29, team: 'red', type: 'attack' }];
  settleArrows();
  P('消防局：30兵打3兵格，只造成1点(3→2)', force[1]);
  P('消防局：蓝方护盾开启', fireDeptGuard.blue);
  P('消防局：护盾词条已挂到大本营', cellEffects.some(e => e.type === 'fire_dept_guard' && e.id === BLUE_HOME));
  applyForceDelta(2, -50, 'red');
  P('消防局：护盾期内卡牌直伤也只1点(2→1)', force[1]);
  round = 'blue'; deck = new Array(10).fill('granary'); blueDeckLocal = new Array(10).fill('granary');
  startTurn('blue');
  P('消防局：蓝方回合开始 → 护盾关闭', fireDeptGuard.blue === false);
  P('消防局：护盾词条随回合开始移除', !cellEffects.some(e => e.type === 'fire_dept_guard'));

  // ===== 新卡：预警 / 防御组件 =====
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} }; redHand = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  team[13] = 'red'; force[13] = 10;    // 14 号格：防御组件目标
  team[12] = 'red'; force[12] = 5;     // 13 号格（与 14 号格相邻的友方格）
  team[3] = 'blue'; force[3] = 5;      // 4 号格（与 14 号格相邻的敌方格）
  team[14] = 'none'; force[14] = 0;    // 15 号格（与 14 号格相邻的中立格）
  deck = new Array(10).fill('granary'); blueDeckLocal = [];
  CARDS['warning'].effect();
  P('预警：大本营 50→90', force[RH]);
  P('预警：抽1张', redHand.length);
  CARDS['def_component'].effect({ target: 14 });   // 14 号格：邻格为 4 / 13 / 15 / 24
  P('防御组件：目标格 10→35', force[13]);
  P('防御组件：友方邻格 13号格 5→30', force[12]);
  P('防御组件：敌方邻格 4号格不受影响(仍5)', force[3]);
  P('防御组件：中立邻格 15号格不受影响(仍0)', force[14]);

  // ===== 新卡：主动声纳 / 压制撤退 =====
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  uidCostOverride = {};
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; team[BH + 1] = 'blue'; team[10] = 'blue';
  blueHand = [{ cardId: 'granary', uid: 51 }]; redHand = [];
  CARDS['active_sonar'].effect();
  P('主动声纳：压制敌方格子数(应2)', cellEffects.filter(e => e.type === 'suppress').length);
  P('主动声纳：己方格未被压制', !cellEffects.some(e => e.type === 'suppress' && e.id === RH + 1));
  P('主动声纳：敌方手牌 +4费(granary 3→7)', instCost(blueHand[0], 'blue'));
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH + 1] = 'blue'; force[BH + 1] = 50;
  team[10] = 'blue'; force[10] = 3;     // 11 号格 3 兵（可被撤退；蓝方邻格只有 21 号格）
  team[20] = 'blue'; force[20] = 40;    // 21 号格 40 兵（>30 不撤）
  team[30] = 'blue'; force[30] = 1;     // 31 号格 1 兵（不撤）
  CARDS['suppress_retreat'].effect();
  P('压制撤退：3兵格被撤到1', force[10]);
  P('压制撤退：撤走的2兵力分给相邻同阵营格(21号格 40→42)', force[20]);
  P('压制撤退：1兵格不受影响(仍1)', force[30]);

  // ===== 新卡：陷阱围困 / 跃进生产 / 转变生产 / 特殊研究 =====
  round = 'red'; turnCounter = 0; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(5);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  CARDS['trap_siege'].effect();
  P('陷阱围困：大本营词条已挂', hasEffect(RH + 1, 'trap_siege', 'red'));
  rewardSeizeDiscount('red');
  P('陷阱围困：反制触发 → 敌方大本营 50→40', force[BH]);
  round = 'red'; costMods = { red: {}, blue: {} }; redReaction = [];
  redHand = [{ cardId: 'mil_research', uid: 61 }, { cardId: 'adv_research', uid: 62 }];
  CARDS['leap_prod'].effect();
  P('跃进生产：只列出非终端研发(应1项)', pendingChoice.options.length);
  pendingChoice.options[0].run();
  P('跃进生产：军事研发 → 扩展军事研发', redHand.map(c => c.cardId).join(','));
  P('跃进生产：保留原 uid', redHand[0].uid === 61);
  round = 'red'; redHand = [{ cardId: 'ext_pol_research', uid: 71 }]; costMods = { red: {}, blue: {} };
  CARDS['transform_prod'].effect();
  pendingChoice.options[0].run();
  const tp = redHand[0].cardId;
  P('转变生产：扩展政治研发 → 同阶段其它研发', RESEARCH_TIERS.ext.indexOf(tp) !== -1 && tp !== 'ext_pol_research');
  P('转变生产：本卡费用 5→7', getCardCost('transform_prod', 'red'));
  round = 'red'; redHand = [{ cardId: 'granary', uid: 81 }]; deck = ['scatter', 'granary']; blueDeckLocal = []; costMods = { red: {}, blue: {} };
  CARDS['special_study'].effect();
  pendingChoice.options[0].run();
  P('特殊研究：按 3K 参照抽到 3K 的牌', redHand.length);
  redHand = [{ cardId: 'granary', uid: 82 }]; deck = ['scatter']; round = 'red';
  CARDS['special_study'].effect();
  pendingChoice.options[0].run();
  P('特殊研究：卡组没有同费用牌则不抽', redHand.length);

  // ===== 新卡：防御研发链三选一 =====
  round = 'red'; redHand = []; cellEffects = []; costMods = { red: {}, blue: {} };
  CARDS['def_research'].effect();
  P('防御研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('防御研发第二项到手', redHand.map(c => c.cardId).join(','));
  redHand = [];
  CARDS['ext_def_research'].effect();
  P('扩展防御研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[0].run();
  P('扩展防御研发第一项到手', redHand.map(c => c.cardId).join(','));
  redHand = [];
  CARDS['adv_def_research'].effect();
  P('高级防御研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('高级防御研发第二项到手', redHand.map(c => c.cardId).join(','));
  P('研发随机池含防御研发', RESEARCH_POOL.indexOf('def_research') !== -1);

  // 重复挂同名反制应给出提示
  round = 'red'; redHand = [{ cardId: 'radio_jam', uid: 1 }, { cardId: 'radio_jam', uid: 2 }];
  redCp = 10; redReaction = [];
  hangReaction(1); hangReaction(2);
  P('重复挂同名反制提示(本地同屏不暴露卡名)', document.getElementById('message').textContent);

  // ===== 2026-10-04 新增：快速联络回退规则 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[10] = 'red'; force[10] = 1;                 // 11 号格（原中立，临时连接）
  addCellEffect({ id: 11, type: 'fastlink_dmg', owner: 'red', turnCasted: 0 });
  team[49] = 'red'; force[49] = 1;                 // 50 号格（原敌方，临时连接）
  addCellEffect({ id: 50, type: 'fastlink_flip', owner: 'red', turnCasted: 0 });
  turnCounter = 2;
  tickFastlink('red');
  P('快速联络 未占领：原中立格变回中立', force[10] + '/' + team[10]);
  P('快速联络 未占领：原敌方格设回兵力5敌方', force[49] + '/' + team[49]);

  // 临时连接格被敌方拿回 → 不回退，且标记清除
  round = 'red'; cellEffects = [];
  team[10] = 'blue'; force[10] = 8;
  addCellEffect({ id: 11, type: 'fastlink_dmg', owner: 'red', turnCasted: 0 });
  turnCounter = 2; tickFastlink('red');
  P('快速联络 已易主：不回退(8/blue)', force[10] + '/' + team[10]);
  P('快速联络 已易主：标记已清除', cellEffects.some(e => e.type === 'fastlink_dmg'));

  // 临时连接格被本方移动兵力真正占领 → 标记清除、不再回退
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  for (let i = 0; i <= 10; i++) { team[i] = 'red'; force[i] = 1; }
  team[RH] = 'red'; force[RH] = 50; force[1] = 30;
  addCellEffect({ id: 11, type: 'fastlink_dmg', owner: 'red', turnCasted: 0 });
  redCp = 50; turnCounter = 0; arrows = []; actedThisTurn = false;
  blitzActive = null; fastDispatch = null; actionsThisTurn = { red: 0, blue: 0 };
  redReaction = []; blueReaction = []; lastDitchDefender = null; attackedCells = [];
  tryMove(2, 11);
  settleArrows();   // 箭头结算后才真正转移兵力
  P('快速联络 移动进入后标记已清除', cellEffects.some(e => e.type === 'fastlink_dmg'));
  P('快速联络 占领后兵力 30/red', force[10] + '/' + team[10]);
  turnCounter = 2; tickFastlink('red');
  P('快速联络 到期仍未回退(30/red)', force[10] + '/' + team[10]);

  // ===== 蹦蹦炸弹 =====
  round = 'red'; redReaction = []; blueReaction = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  team[49] = 'blue'; force[49] = 10;
  deck = ['granary', 'granary']; blueDeckLocal = []; redHand = [];
  CARDS['bomb_boom'].effect({ target: 50 });
  P('蹦蹦炸弹：50号格 10→5', force[49]);
  P('蹦蹦炸弹：非大本营不抽牌(0)', redHand.length);
  redHand = []; deck = ['granary'];
  CARDS['bomb_boom'].effect({ target: BLUE_HOME });
  P('蹦蹦炸弹：命中大本营 50→45', force[BH]);
  P('蹦蹦炸弹：命中大本营抽1张', redHand.length);

  // ===== 飞行炸弹 / 静默突袭 =====
  team[49] = 'blue'; force[49] = 30;
  CARDS['flying_bomb'].effect({ target: 50 });
  P('飞行炸弹：≤30格兵力归零并中立', force[49] + '/' + team[49]);
  team[49] = 'blue'; force[49] = 25;
  blueHand = [{ cardId: 'granary', uid: 1 }, { cardId: 'carpet', uid: 2 }, { cardId: 'rest', uid: 3 }, { cardId: 'blitz', uid: 4 }, { cardId: 'winter', uid: 5 }];
  CARDS['silent_raid'].effect({ target: 50 });
  P('静默突袭：兵力归零并中立', force[49] + '/' + team[49]);
  P('静默突袭：敌方手牌 5→3', blueHand.length);

  // ===== 核平天下 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  // 红大本营（12）邻格：2 / 11 / 13 / 22；蓝大本营（89）邻格：79 / 88 / 90 / 99
  [1, 10, 12, 21].forEach(i => { team[i] = 'red'; force[i] = 10; });
  [78, 87, 89, 98].forEach(i => { team[i] = 'blue'; force[i] = 10; });
  team[49] = 'blue'; force[49] = 20; team[48] = 'red'; force[48] = 40;    // 50/49 号格
  redCp = 5;
  CARDS['nuke_world'].effect();
  P('核平天下：大本营保留(50/50)', force[RH] + '/' + force[BH]);
  P('核平天下：大本营相邻格保留(10×8)', [1, 10, 12, 21, 78, 87, 89, 98].map(i => force[i]).join('/'));
  P('核平天下：其余格归零并中立', force[49] + '/' + team[49] + ' ' + force[48] + '/' + team[48]);
  P('核平天下：移除60兵力 → +1指挥点(5→6)', redCp);

  // ===== 鼓舞（≤3费 -1）=====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; team[BH] = 'blue';
  P('鼓舞前 红 granary(3)', getCardCost('granary', 'red'));
  addCellEffect({ id: RH + 1, type: 'inspire', owner: 'red', turnCasted: 0 });
  P('鼓舞后 红 granary(3→2)', getCardCost('granary', 'red'));
  P('鼓舞后 红 watch(4K 不变)', getCardCost('watch', 'red'));
  P('鼓舞后 红 carpet(9K 不变)', getCardCost('carpet', 'red'));
  P('鼓舞只影响本方：蓝 granary 仍 3', getCardCost('granary', 'blue'));

  // ===== 指令增员 / 非常规兵员 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 5;
  team[49] = 'blue'; force[49] = 25;
  addCellEffect({ id: 2, type: 'cmd_reinforce', owner: 'red', turnCasted: 0 });
  triggerCardUsedHooks('red');
  P('指令增员：唯一敌格 25→20（每次打 5）', force[49] + '/' + team[49]);
  cellEffects = []; force[49] = 25;
  addCellEffect({ id: 2, type: 'logistics_reinforce', owner: 'red', turnCasted: 0 });
  triggerCardUsedHooks('red');
  P('后勤增员：唯一敌格 25→10（每次打 15）', force[49] + '/' + team[49]);
  cellEffects = []; force[1] = 5;
  addCellEffect({ id: 2, type: 'irregular', owner: 'red', turnCasted: 0 });
  triggerCardUsedHooks('red');
  P('非常规兵员：2号格 5→15', force[1]);

  // ===== 愈战愈勇 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  redReaction = []; blueReaction = []; lastDitchDefender = null;
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[1] = 'red'; force[1] = 20; team[2] = 'blue'; force[2] = 5;
  addCellEffect({ id: 2, type: 'battle_hardened', owner: 'red', turnCasted: 0 });
  arrows = [{ from: 2, to: 3, num: -19, team: 'red', type: 'attack' }];
  settleArrows();
  P('愈战愈勇：占领后 3号格 14+20=34', force[2]);
  P('愈战愈勇：词条随军到 3号格', cellEffects.filter(e => e.type === 'battle_hardened').map(e => e.id).join(','));

  // ===== 2026-10-06 第十三批：非转化式易主/中立化 → 移除该格一切词条 =====
  // 规则：格被敌方以**非转化**方式夺取（攻击占领等）或**变成中立格**时，格上原有的一切词条都被移除；
  //       只有转化/控制类易主（混乱/叛乱/快速联络/边境巡查①）保留词条。
  // A) 攻击占领：目标格上的敌方词条（含非绑定型的 mil_center / call_to_arms）被清空
  {
    cellEffects = []; redReaction = []; blueReaction = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50;
    team[20] = 'red'; force[20] = 40;              // 21 号格（红，攻击方）
    team[21] = 'blue'; force[21] = 5;              // 22 号格（蓝，被占领）
    cellEffects = [
      { id: 22, type: 'mil_center', owner: 'blue', turnCasted: 0, power: 50 },
      { id: 22, type: 'call_to_arms', owner: 'blue', turnCasted: 0, power: 5 },
      { id: 22, type: 'suppress', owner: 'blue', turnCasted: 0 }
    ];
    arrows = [{ from: 21, to: 22, num: -39, team: 'red', type: 'attack' }];
    settleArrows();
    P('非转化夺取：22号格归红方', team[21]);
    P('非转化夺取：22号格原有词条全部移除(应空)', cellEffects.filter(e => e.id === 22).map(e => e.type).join(','));
  }
  // B) 攻击占领：攻方随军词条仍搬入（不得误删）
  {
    cellEffects = []; redReaction = []; blueReaction = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50;
    team[20] = 'red'; force[20] = 40; team[21] = 'blue'; force[21] = 5;
    cellEffects = [
      { id: 21, type: 'battle_hardened', owner: 'red', turnCasted: 0 },   // 攻方随军词条
      { id: 22, type: 'mil_center', owner: 'blue', turnCasted: 0, power: 50 } // 守方格词条（应被清）
    ];
    arrows = [{ from: 21, to: 22, num: -39, team: 'red', type: 'attack' }];
    settleArrows();
    P('非转化夺取：守方词条清除、攻方随军词条保留', cellEffects.map(e => e.type + '@' + e.id).join(','));
  }
  // C) 中立化（applyForceDelta neutral 模式）：目标格词条清空
  {
    cellEffects = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50;
    team[21] = 'blue'; force[21] = 30;
    cellEffects = [{ id: 22, type: 'mil_center', owner: 'blue', turnCasted: 0, power: 50 }];
    applyForceDelta(22, -30, 'red', 'neutral');
    P('中立化：22号格变中立', team[21]);
    P('中立化：22号格词条清空(应空)', cellEffects.filter(e => e.id === 22).length);
  }
  // D) 转化/控制类易主仍保留词条（混乱），与上面形成对照
  {
    cellEffects = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50;
    team[1] = 'red'; force[1] = 20;                      // 2 号格红
    team[2] = 'blue'; force[2] = 5;                      // 3 号格蓝，与红 2 号格相邻
    cellEffects = [{ id: 3, type: 'mil_center', owner: 'blue', turnCasted: 0, power: 50 }];
    CARDS['chaos'].effect({ target: 3, owner: 'red' });
    P('转化式易主(混乱)：3号格归红方', team[2]);
    P('转化式易主(混乱)：原词条保留(应含 mil_center)', cellEffects.filter(e => e.id === 3).map(e => e.type).join(','));
  }

  // ===== 后勤研发链 =====
  round = 'red'; redHand = []; cellEffects = []; costMods = { red: {}, blue: {} };
  CARDS['log_research'].effect();
  P('后勤研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('后勤研发第二项到手', redHand.map(c => c.cardId).join(','));
  redHand = [];
  CARDS['ext_log_research'].effect();
  P('扩展后勤研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[0].run();
  P('扩展后勤研发第一项到手', redHand.map(c => c.cardId).join(','));
  redHand = [];
  CARDS['adv_log_research'].effect();
  P('高级后勤研发 抉择项', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[1].run();
  P('高级后勤研发第二项到手', redHand.map(c => c.cardId).join(','));
  P('研发随机池含后勤研发', RESEARCH_POOL.indexOf('log_research') !== -1);

  // ===== 合成机油 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  redSlot = 10; redCp = 0; redHand = []; redReaction = [];
  deck = ['granary', 'carpet', 'rest']; blueDeckLocal = [];
  turnCounter = 1;   // MODE='local' 时 isHost/isJoin 恒为 false，无需改动
  addCellEffect({ id: RH + 1, type: 'synth_oil', owner: 'red', turnCasted: 0 });
  startTurn('red');
  P('合成机油：槽10→11；仅 1 格 → 领土补给 0 → +10 = 10', redCp);
  P('合成机油：效果已清除', hasEffect(RH + 1, 'synth_oil', 'red'));
  P('合成机油：回合开始1张 + 合成1张 = 2', redHand.length);

  // ===== 2026-10-04 第二批：清除 / 监视 / 闪电袭击 / 两张新卡 =====
  // 清除：移除词条（保留压制）；若该格有「兵力增加」词条，把加成兵力一并移除（保底 20）
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 40;
  addCellEffect({ id: 50, type: 'suppress', owner: 'blue', turnCasted: 0 });
  addCellEffect({ id: 50, type: 'abs_defense', owner: 'blue', turnCasted: 0 });
  CARDS['clear_effect'].effect({ target: 50 });
  P('清除：只保留压制的词条(应 suppress)', cellEffects.map(e => e.type).join(','));
  P('清除：无「兵力增加」词条 → 兵力不变(仍40)', force[49]);
  // 一次性加成（临时征召 +30）→ 60-30=30
  cellEffects = []; team[49] = 'blue'; force[49] = 60;
  addCellEffect({ id: 50, type: 'levee', owner: 'blue', turnCasted: 0, leveePower: 30, power: 30 });
  CARDS['clear_effect'].effect({ target: 50 });
  P('清除：移除「临时征召」+30 加成(60-30=30)', force[49]);
  P('清除：加成词条一并移除(应 0)', cellEffects.length);
  // 保底 20：加成比现有兵力还多
  cellEffects = []; team[49] = 'blue'; force[49] = 30;
  addCellEffect({ id: 50, type: 'boost_prod', owner: 'blue', turnCasted: 0, power: 65 });
  CARDS['clear_effect'].effect({ target: 50 });
  P('清除：加成超过现有兵力 → 保底 20', force[49]);
  // 累计型（非常规兵员每用一次牌 +10）按累计值移除
  cellEffects = []; team[49] = 'blue'; force[49] = 50;
  addCellEffect({ id: 50, type: 'irregular', owner: 'blue', turnCasted: 0, power: 0 });
  triggerCardUsedHooks('blue');
  triggerCardUsedHooks('blue');
  P('清除前：非常规兵员累计 20 / 兵力 70', cellEffects[0].power + '/' + force[49]);
  clearCellEffects('red', 50);
  P('清除：移除累计的 +20(70-20=50)', force[49]);
  // 纯防御 / 压制词条不算「兵力增加」→ 不扣兵力
  cellEffects = []; team[49] = 'blue'; force[49] = 40;
  addCellEffect({ id: 50, type: 'abs_defense', owner: 'blue', turnCasted: 0 });
  addCellEffect({ id: 50, type: 'suppress', owner: 'blue', turnCasted: 0 });
  clearCellEffects('red', 50);
  P('清除：纯防御词条 → 兵力不变(40) 且只留压制', force[49] + '/' + cellEffects.map(e => e.type).join(','));

  // 监视：花费 >10 的手牌不能被转化
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  redHand = [{ cardId: 'carpet', uid: 1 }, { cardId: 'federal', uid: 2 }, { cardId: 'granary', uid: 3 }, { cardId: 'resist', uid: 4 }];
  redCp = 50;
  CARDS['watch'].effect();
  P('监视：模板候选（不应含 18K 联邦国家 与「抵抗」）', pendingChoice.options.map(o => o.text).join(' / '));
  pendingChoice.options[0].run();
  P('监视：被转化候选（不应含 18K 联邦国家 与「抵抗」）', pendingChoice.options.map(o => o.text).join(' / '));

  // 闪电袭击：2K、25 伤害
  P('闪电袭击 费用(应2)', CARDS['lightning_raid'].cost);
  P('鼓舞 费用(应9)', CARDS['inspire'].cost);
  P('canBeTransformed：抵抗 false / 广积粮 true', canBeTransformed('resist') + '/' + canBeTransformed('granary'));
  round = 'red'; cellEffects = []; redReaction = []; blueReaction = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  deck = ['granary', 'carpet']; blueDeckLocal = ['granary'];
  blueReaction = [{ cardId: 'lightning_raid', uid: 77 }];
  blueHand = [{ cardId: 'lightning_raid', uid: 77 }];
  isTurnStartDraw = false;
  drawFrom(deck, 1, 'red');
  P('闪电袭击：红方额外抽牌 → 红方大本营 50-25=25', force[RH]);
  P('闪电袭击：反制被消耗(应0)', blueReaction.length);

  // 激烈齐射：25 伤害 + 中心 3×3 各施加一次「清除」
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[12] = 'blue'; force[12] = 45;    // 13 号格（目标；3×3 = 2/3/4/12/13/14/22/23/24）
  team[2] = 'blue'; force[2] = 30;      // 3 号格（3×3 内）
  team[13] = 'blue'; force[13] = 30;    // 14 号格（3×3 内）
  addCellEffect({ id: 13, type: 'abs_defense', owner: 'blue', turnCasted: 0 });
  CARDS['fierce_volley'].effect({ target: 13 });
  P('激烈齐射：中心 45-25=20（清除不再固定扣兵力）', force[12]);
  P('激烈齐射：3×3 内无加成邻格兵力不变(30)', force[2] + '/' + force[13]);
  P('激烈齐射：3×3 内词条已被清除(应 false)', cellEffects.some(e => e.id === 13));
  // 3×3 内带「兵力增加」词条的格子：加成兵力一并移除
  cellEffects = []; costMods = { red: {}, blue: {} };
  team[12] = 'blue'; force[12] = 45;   // 13 号格（目标）
  team[2] = 'blue'; force[2] = 50;     // 3 号格（3×3 内，带临时征召 +30）
  team[13] = 'blue'; force[13] = 30;   // 14 号格（3×3 内，无加成）
  addCellEffect({ id: 3, type: 'levee', owner: 'blue', turnCasted: 0, leveePower: 30, power: 30 });
  CARDS['fierce_volley'].effect({ target: 13 });
  P('激烈齐射：3×3 内带+30 的格子 50-30=20', force[2]);
  P('激烈齐射：3×3 内无加成格子兵力不变(30)', force[13]);

  // 火炮打击：清除（-10）；兵力≤25 额外归零
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[49] = 'blue'; force[49] = 20;
  CARDS['artillery_strike'].effect({ target: 50 });
  P('火炮打击：≤25 → 清除后兵力归零并中立(0/none)', force[49] + '/' + team[49]);
  team[49] = 'blue'; force[49] = 40;
  CARDS['artillery_strike'].effect({ target: 50 });
  P('火炮打击：>25 → 不清零、无加成则兵力不变(40/blue)', force[49] + '/' + team[49]);
  // 有「兵力增加」词条：先移除加成（60-30=30）→ 清除前 60>25，不归零
  cellEffects = []; team[49] = 'blue'; force[49] = 60;
  addCellEffect({ id: 50, type: 'levee', owner: 'blue', turnCasted: 0, leveePower: 30, power: 30 });
  CARDS['artillery_strike'].effect({ target: 50 });
  P('火炮打击：移除 +30 加成后 60→30（不清零）', force[49] + '/' + team[49]);

  // ===== 2026-10-04 第三批：解放 / 抵抗变革 / 抵抗高潮 =====
  // 解放：3 张抵抗进敌方卡组 + 友方大本营 +30
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  deck = ['granary']; blueDeckLocal = ['granary'];
  CARDS['liberation'].effect();
  P('解放：敌方卡组新增 3 张抵抗', blueDeckLocal.filter(x => x === 'resist').length);
  P('解放：友方大本营 50+30=80', force[RH]);

  // 抵抗变革：敌方抽到「抵抗」→ 词条持有方抽 1 张
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  redHand = []; blueHand = []; redReaction = []; blueReaction = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  addCellEffect({ id: 2, type: 'resist_reform', owner: 'blue', turnCasted: 0 });
  deck = ['resist', 'granary']; blueDeckLocal = ['granary', 'granary'];
  isTurnStartDraw = false;
  drawFrom(deck, 1, 'red');
  P('抵抗变革：红方抽到「抵抗」', redHand.map(c => c.cardId).join(','));
  P('抵抗变革：蓝方因此抽 1 张', blueHand.length);

  // 抵抗高潮：敌方使用「抵抗」→ 使用者大本营 -15
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  redHand = [{ cardId: 'resist', uid: 501 }]; blueHand = [];
  redCp = 10; redReaction = []; blueReaction = []; pendingChoice = null;
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[BH] = 'blue'; force[BH] = 50;
  addCellEffect({ id: 2, type: 'resist_climax', owner: 'blue', turnCasted: 0 });
  playCard(501);
  P('抵抗高潮：红方使用抵抗 → 红方大本营 50-15=35', force[RH]);

  // ===== 2026-10-04 第四批：指挥点改为"按领土补给" =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  for (let i = 0; i < 4; i++) team[i] = 'red';
  team[BH] = 'blue';
  redSlot = 1; redCp = 0; redHand = []; redReaction = [];
  deck = ['granary', 'carpet', 'rest']; blueDeckLocal = [];
  turnCounter = 1;
  P('领土补给函数：4 格 → 2 点', territoryCp('red'));
  startTurn('red');
  P('首回合：槽1→2，4 格补给 2 → cp=2', redSlot + '/' + redCp);
  // 9 格 → 6 点
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  for (let i = 0; i < 9; i++) team[i] = 'red';
  redSlot = 20; redCp = 0; redHand = []; deck = ['granary', 'carpet'];
  turnCounter = 5;
  startTurn('red');
  P('9 格 → 6 点（槽 20 不封顶）', redCp);
  // 槽封顶
  redSlot = 3; redCp = 0;
  startTurn('red');
  P('槽 3→4，领土 6 被槽封顶 → 4', redCp);
  // 1 格 → 领土补给 0，但轮数保底 floor(5/2)=2
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; team[BH] = 'blue';
  redSlot = 10; redCp = 5; redHand = []; deck = ['granary'];
  turnCounter = 5;
  startTurn('red');
  P('1 格 → 领土0/轮数保底2 → 2（不再补满到槽）', redCp);
  P('countCells：红/蓝', countCells('red') + '/' + countCells('blue'));

  // ===== 2026-10-04 第四批 A：指挥点公式 = min(槽, max(领土, floor(轮数/2))) =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  for (let i = 0; i < 3; i++) team[i] = 'red';   // 3 格 → 领土 2
  team[BH] = 'blue';
  redHand = []; redReaction = []; deck = ['granary'];
  turnCounter = 0; redSlot = 1; redCp = 0;
  P('轮数保底 floor(0/2)', roundFloorCp());
  startTurn('red');
  P('公式：3格领土2 / 轮数0 → min(槽2, 2) = 2', redCp);
  turnCounter = 9; redSlot = 1; redCp = 0;
  startTurn('red');
  P('公式：3格领土2 / 轮数保底4 → min(槽2, 4) = 2（槽封顶）', redCp);
  redSlot = 20; redCp = 0; turnCounter = 9;
  startTurn('red');
  P('公式：3格领土2 / 轮数保底4 → min(槽20, 4) = 4', redCp);
  redSlot = 3; redCp = 0; turnCounter = 30;
  startTurn('red');
  P('公式：3格领土2 / 轮数保底15 → min(槽4, 15) = 4', redCp + '（槽' + redSlot + '）');
  P('supplyCp(3格, 轮数30) = 15', supplyCp('red'));

  // ===== 2026-10-04 第四批 B：指令打中立格 → 归本方 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;                       // 红方大本营
  team[49] = 'none'; force[49] = 0;                     // 50 号格：兵力 0 的中立格
  rallyDmg = { red: 1, blue: 1 };
  deck = ['granary'];
  CARDS['build_strength'].effect({ target: 50 });
  P('养精蓄锐打0兵中立格 → 归本方(0/red)', force[49] + '/' + team[49]);

  // 中立格没被打穿（兵力仍 > 0）→ 不夺地
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[49] = 'none'; force[49] = 20;
  CARDS['scatter'].effect({ target: 50 });
  P('随机弹道打20兵中立格(未击穿) → 仍中立', force[49] + '/' + team[49]);

  // 敌方格超杀 → 仍为 0 兵中立格（旧规则不变）
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[49] = 'blue'; force[49] = 3;
  CARDS['pol_propaganda'].effect({ target: 50 });
  P('指令打敌方格超杀 → 0兵中立(0/none)', force[49] + '/' + team[49]);

  // ===== 2026-10-04 第四批 C：新卡「号召」 =====
  // 友方回合开始 +5
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[12] = 'red'; force[12] = 10; team[BH] = 'blue'; force[BH] = 50;
  addCellEffect({ id: 13, type: 'call_to_arms', owner: 'red', turnCasted: 0 });
  redSlot = 5; redCp = 0; redHand = []; redReaction = []; deck = ['granary'];
  turnCounter = 1;
  startTurn('red');
  P('号召：回合开始 10+5=15（13 号格非后勤，不受后勤补给影响）', force[12]);
  P('号召：效果仍在(未受伤害)', cellEffects.some(e => e.type === 'call_to_arms'));
  applyForceDelta(13, -3, 'blue');
  P('号召：受到伤害后移除(false)', cellEffects.some(e => e.type === 'call_to_arms'));
  P('号召：伤害仍照常结算(15-3=12)', force[12]);

  // 该格移动时移除
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  [0, 1, 10, 11].forEach(i => { team[i] = 'red'; force[i] = 10; });   // 1/2/11/12 号格
  force[RH] = 50;
  addCellEffect({ id: 2, type: 'call_to_arms', owner: 'red', turnCasted: 0 });
  redCp = 50; arrows = []; actionsThisTurn = { red: 0, blue: 0 };
  blitzActive = null; fastDispatch = null; actedThisTurn = false;
  tryMove(2, 12);
  P('号召：该格移动后移除(false)', cellEffects.some(e => e.type === 'call_to_arms'));

  // 该格攻击时移除
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[12] = 'red'; force[12] = 30;    // 13 号格（非后勤，可主动攻击）
  team[13] = 'blue'; force[13] = 5;    // 14 号格
  addCellEffect({ id: 13, type: 'call_to_arms', owner: 'red', turnCasted: 0 });
  redCp = 50; arrows = []; attackedCells = []; actionsThisTurn = { red: 0, blue: 0 };
  blueReaction = []; redReaction = [];
  tryAttack(13, 14);
  P('号召：该格发动攻击后移除(false)', cellEffects.some(e => e.type === 'call_to_arms'));

  // 后勤格不能主动攻击（2026-10-06 第八批）
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[1] = 'red'; force[1] = 30;      // 2 号格：红方后勤格
  team[2] = 'blue'; force[2] = 5;      // 3 号格：敌方
  addCellEffect({ id: 2, type: 'call_to_arms', owner: 'red', turnCasted: 0 });
  redCp = 50; arrows = []; attackedCells = []; actionsThisTurn = { red: 0, blue: 0 };
  blueReaction = []; redReaction = [];
  tryAttack(2, 3);
  P('后勤格不能主动攻击：未扣指挥点(仍50)', redCp);
  P('后勤格不能主动攻击：未产生攻击箭头(0)', arrows.length);
  P('后勤格不能主动攻击：词条未被移除(true)', cellEffects.some(e => e.type === 'call_to_arms'));
  redCp = 50; arrows = [];
  tryMove(2, RH + 1);
  P('后勤格可以移动（向大本营移动扣 10 点 → 40）', redCp);

  // 该格被攻击（settleArrows 路径）时移除
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 30;
  team[2] = 'blue'; force[2] = 40;
  addCellEffect({ id: 3, type: 'call_to_arms', owner: 'blue', turnCasted: 0 });
  arrows = [{ from: 2, to: 3, num: -29, team: 'red', type: 'attack' }];
  settleArrows();
  P('号召：该格被攻击后移除(false)', cellEffects.some(e => e.type === 'call_to_arms'));
  P('号召：被攻击伤害照常结算(40-29=11/blue)', force[2] + '/' + team[2]);

  // ===== 2026-10-04 第五批 A：清除类卡牌不能打大本营 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  P('清除：不能指向大本营', validateCardTarget(CARDS['clear_effect'], BLUE_HOME));
  P('火炮打击：不能指向大本营', validateCardTarget(CARDS['artillery_strike'], BLUE_HOME));
  P('激烈齐射：不能指向大本营', validateCardTarget(CARDS['fierce_volley'], BLUE_HOME));
  P('清除：仍可指向普通敌方格(应 null)', validateCardTarget(CARDS['clear_effect'], 50));

  // 激烈齐射的 3×3 不能波及大本营（90 号格的 3×3 = 79/80/89/90/99/100，含蓝方大本营 100）
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[78] = 'blue'; force[78] = 45;      // 79 号格（目标；3×3 = 68/69/70/78/79/80/88/89/90，含蓝方大本营 89）
  team[87] = 'blue'; force[87] = 40;      // 88 号格（3×3 内、紧贴大本营）
  team[BH] = 'blue'; force[BH] = 50;      // 89 号格（敌方大本营）
  addCellEffect({ id: BLUE_HOME, type: 'inspire', owner: 'blue', turnCasted: 0 });
  CARDS['fierce_volley'].effect({ target: 79 });
  P('激烈齐射：3×3 中的敌大本营不掉血(仍50)', force[BH]);
  P('激烈齐射：3×3 中的敌大本营词条未被清(true)', cellEffects.some(e => e.id === BLUE_HOME));
  P('激烈齐射：3×3 普通邻格无加成 → 兵力不变(40)', force[87]);
  P('激烈齐射：目标格 45-25=20', force[78]);

  // ===== 2026-10-05：观战绝不参与本地对局流程（不弹卡组、不调度、不开局） =====
  {
    round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    redHand = []; blueHand = []; deck = ['granary', 'carpet']; blueDeckLocal = ['granary'];
    turnCounter = 7; mulliganQueue = null; mulliganActiveTeam = null; redDeckConfigured = false;
    const prevWatch = isWatch, prevMode = MODE;
    isWatch = true; MODE = 'watch';
    setupMatchDecks();
    P('观战：setupMatchDecks 不生效(turnCounter 仍 7)', turnCounter);
    P('观战：不发牌(红/蓝手牌 0)', redHand.length + '/' + blueHand.length);
    P('观战：不进入调度(mulliganQueue 仍 null)', mulliganQueue);
    openMulligan('red');
    P('观战：openMulligan 不弹窗(mulliganQueue 仍 null)', mulliganQueue);
    doMulliganConfirm();
    P('观战：doMulliganConfirm 不触发开局(手牌仍 0)', redHand.length + '/' + blueHand.length);
    onDeckModalConfirm();
    P('观战：onDeckModalConfirm 不触发本地开局(redDeckConfigured 仍 false)', redDeckConfigured);
    onRedDeckSet();
    P('观战：onRedDeckSet 不触发本地开局(redDeckConfigured 仍 false)', redDeckConfigured);
    initGame();
    P('观战：initGame 不初始化本地棋局(41 号格仍为空)', team[40] + '/' + force[40]);
    isWatch = prevWatch; MODE = prevMode;
  }

  // ===== 2026-10-05 第十一批：投降按钮（结束本局，判对方获胜）=====
  {
    MODE = 'local'; isHost = false; isJoin = false; isWatch = false;
    gameOver = false; winWinner = null; winQuote = null;
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 100; team[BH] = 'blue'; force[BH] = 100;
    round = 'red'; clearGameLog();
    surrenderNow('red');
    P('投降：红方投降 → 蓝方获胜', gameOver + '/' + winWinner);
    {
      const e = gameLog.filter(x => x.text.indexOf('投降') !== -1);
      P('投降：战报公开记录（无 privateTeam）', e.length ? e[e.length - 1].text + ' | private=' + !!e[e.length - 1].privateTeam : '(无)');
    }
    surrenderNow('red');
    P('投降：本局已结束后不重复触发(仍 blue)', winWinner);
    gameOver = false; winWinner = null; clearGameLog();
    surrenderNow('blue');
    P('投降：蓝方投降 → 红方获胜', gameOver + '/' + winWinner);
    gameOver = false; winWinner = null; isWatch = true;
    confirmSurrender();
    P('投降：观战态 confirmSurrender 不生效', gameOver);
    isWatch = false;
    gameOver = false; winWinner = null;
  }

  // ===== 2026-10-06 第十一批：对局开始后不能再导入卡组 =====
  {
    // 未锁定：可以打开
    deckLocked = false; isWatch = false; isJoin = false;
    const md = document.getElementById('deckModal');
    openDeckModal();
    P('卡组导入：未锁定时可打开弹窗', md.classList.contains('show') ? 'show' : 'hidden');
    md.classList.remove('show');
    // 锁定后：任何模式都不允许
    deckLocked = true;
    openDeckModal();
    P('卡组导入：锁定后（本地/房主）不打开弹窗', md.classList.contains('show') ? 'show' : 'hidden');
    P('卡组导入：锁定后按钮被禁用', document.getElementById('btnDeckImport').disabled);
    // 蓝方侧同样拦截
    isJoin = true;
    openDeckModal();
    P('卡组导入：锁定后（蓝方）也不打开弹窗', md.classList.contains('show') ? 'show' : 'hidden');
    isJoin = false;
    // 重开解除锁定并恢复按钮
    initGame();
    P('卡组导入：重开后解除锁定', deckLocked);
    P('卡组导入：重开后按钮恢复可用', document.getElementById('btnDeckImport').disabled === false);
  }

  // ===== 2026-10-05 第十批：堡垒防御设为 135 + 卡组移出的点名通报 =====
  {
    round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 40; team[BH] = 'blue'; force[BH] = 50;
    deck = ['granary', 'carpet', 'rest', 'seize', 'greed', 'united', 'federal', 'fortify', 'bastion'];
    blueDeckLocal = [];
    clearGameLog();
    CARDS['bastion'].effect();
    P('堡垒防御：大本营兵力设为 135', force[RH]);
    P('堡垒防御：卡组顶 7 张被移除(9→2)', deck.length);
    const dep = gameLog.filter(e => e.text.indexOf('卡组移出') !== -1);
    P('堡垒防御：战报逐张点名', dep.length ? dep[dep.length - 1].text : '(无)');
    P('卡组移出通报 双方可见(无 privateTeam)', dep.length ? !dep[dep.length - 1].privateTeam : false);
    // "设为"不是"+":兵力高于 135 时反而会降
    force[RH] = 199;
    CARDS['bastion'].effect();
    P('堡垒防御：199 也会被设为 135', force[RH]);

    // 抵抗：弃卡组顶一张牌 → 点名是哪张
    round = 'red'; cellEffects = [];
    deck = ['granary', 'carpet']; blueDeckLocal = [];
    clearGameLog();
    CARDS['resist'].effect();
    pendingChoice.options[1].run();
    P('抵抗：弃卡组顶后卡组剩 1 张', deck.length);
    P('抵抗：战报点名被弃的卡', gameLog.map(e => e.text).join(' | '));

    // 义务兵被抽走 → 点名
    round = 'red'; cellEffects = [];
    deck = ['conscript', 'granary']; blueDeckLocal = [];
    turnCounter = 5; conscriptGranted = { red: false, blue: false };
    redHand = [];
    clearGameLog();
    startTurn('red');
    P('义务兵：被抽走且战报点名', gameLog.filter(e => e.text.indexOf('卡组移出') !== -1).map(e => e.text).join(' | ') || '(无)');
  }

  // ===== 2026-10-04 第五批 B：新卡「贪心」（2026-10-09 第十五批：伤害=1+使用次数、上限15；2026-10-10 第十六批：可打大本营、对大本营 50% 落空）=====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  redReaction = []; blueReaction = []; fireDeptGuard = { red: false, blue: false };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[49] = 'blue'; force[49] = 30;
  greedUses = { red: 0, blue: 0 };
  deck = new Array(25).fill('granary'); blueDeckLocal = [];
  CARDS['greed'].effect({ target: 50 });
  P('贪心：首次使用 30-1=29（伤害=1+0）', force[49]);
  P('贪心：卡组 25 → 25+2 = 27（floor(25/10)=2）', deck.length);
  P('贪心：洗入的副本数(应2)', deck.filter(x => x === 'greed').length);
  CARDS['greed'].effect({ target: 50 });
  P('贪心：第2次 29-2=27（伤害=1+1）', force[49]);
  greedUses.red = 20;
  CARDS['greed'].effect({ target: 50 });
  P('贪心：累计20次后伤害封顶15 → 27-15=12', force[49]);
  greedUses = { red: 0, blue: 0 };
  deck = new Array(9).fill('granary');
  CARDS['greed'].effect({ target: 50 });
  P('贪心：卡组 9 张 → 不洗入(9)', deck.length);
  P('贪心：可指向大本营(应 null)', validateCardTarget(CARDS['greed'], RED_HOME));
  P('贪心：任意格放行(应 null)', validateCardTarget(CARDS['greed'], 50) + '/' + validateCardTarget(CARDS['greed'], 2));
  // 大本营 50% 概率空过（2026-10-10 第十六批）
  {
    const realRandom = Math.random;
    greedUses = { red: 0, blue: 0 };
    team[BH] = 'blue'; force[BH] = 100; team[49] = 'blue'; force[49] = 30;
    deck = new Array(9).fill('granary');
    Math.random = () => 0.25;               // < 0.5 → 落空
    CARDS['greed'].effect({ target: BLUE_HOME });
    P('贪心：打敌方大本营 random=0.25 → 落空(100不变)', force[BH]);
    Math.random = () => 0.75;               // ≥ 0.5 → 命中
    CARDS['greed'].effect({ target: BLUE_HOME });
    P('贪心：打敌方大本营 random=0.75 → 命中 100-2=98', force[BH]);
    Math.random = () => 0.25;               // 非大本营不看概率
    CARDS['greed'].effect({ target: 50 });
    P('贪心：打非大本营不受 50% 影响（30-3=27）', force[49]);
    Math.random = realRandom;
  }

  // 贪心：洗入副本后视为"构筑之外"（2026-10-06 第十一批）
  round = 'red'; cellEffects = []; carriedCardIds = { greed: 1, granary: 1 };
  greedCopied = { red: false, blue: false }; greedUses = { red: 0, blue: 0 };
  P('贪心：未洗入副本时视为构筑内', isBuiltCard('greed', 'red'));
  deck = new Array(25).fill('granary');
  CARDS['greed'].effect({ target: 50 });
  P('贪心：洗入副本后视为构筑之外', !isBuiltCard('greed', 'red'));
  P('贪心：判定按方独立(蓝方未洗入仍构筑内)', isBuiltCard('greed', 'blue'));
  P('贪心：其它卡不受影响(granary 仍构筑内)', isBuiltCard('granary', 'red'));
  deck = new Array(9).fill('granary'); greedCopied = { red: false, blue: false };
  CARDS['greed'].effect({ target: 50 });
  P('贪心：未发生洗入(9张→0)时不改变判定', isBuiltCard('greed', 'red'));
  greedCopied = { red: false, blue: false };

  // ===== 2026-10-06 第十一批 / 2026-10-07 第十四批：航运 / 足智多谋 / 后勤中枢 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  redHand = []; redReaction = []; blueReaction = []; blueDeckLocal = [];
  deck = ['granary', 'shipping', 'greed', 'united'];
  setCp('red', 5);
  CARDS['shipping'].effect();
  P('航运：抽2张（granary/shipping）', redHand.map(c => c.cardId).join(','));
  P('航运：牌库剩 2 张', deck.length);
  P('航运：失去1个指挥点（5→4）', getCp('red'));

  // 足智多谋：从卡组抽一张「增员」类指令
  redHand = []; deck = ['granary', 'united', 'cmd_reinforce', 'passive_reinforce'];
  CARDS['resourceful'].effect();
  P('足智多谋：抽到「增员」类指令之一', (redHand[0] && ['cmd_reinforce', 'passive_reinforce'].indexOf(redHand[0].cardId) !== -1) ? 'ok' : 'fail');
  P('足智多谋：卡组剩 3 张', deck.length);
  redHand = []; deck = ['granary', 'united'];
  CARDS['resourceful'].effect();
  P('足智多谋：无目标时不抽（手牌空、卡组不动）', redHand.length + '/' + deck.length);
  P('足智多谋：校验放行(应 null)', validateCardTarget(CARDS['resourceful'], 50));

  // ===== 2026-10-07 第十四批：后勤中枢（使用 0 费卡 → 抽 1 张）=====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10;
  redHand = []; redReaction = []; blueReaction = []; blueDeckLocal = [];
  deck = ['granary', 'united', 'greed', 'shipping', 'carpet'];
  addCellEffect({ id: 2, type: 'logi_hub', owner: 'red', turnCasted: 0 });
  triggerCardUsedHooks('red', 0);          // 使用一张 0 费牌
  P('后勤中枢：使用0费卡 → 抽1张（granary）', redHand.map(c => c.cardId).join(','));
  P('后勤中枢：牌库 5→4', deck.length);
  triggerCardUsedHooks('red', 3);          // 使用一张 3 费牌
  P('后勤中枢：非0费卡不抽（牌库仍 4）', deck.length);
  P('后勤中枢：校验放行(友方格应 null)', validateCardTarget(CARDS['logi_hub'], 2));

  // ===== 2026-10-09 第十五批：新卡与全局规则 =====
  // 空袭增员：本格受到任何来源伤害时，在伤害结算前把兵力降为4
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 100;
  addCellEffect({ id: 50, type: 'air_reinforce', owner: 'red', turnCasted: 0 });
  applyForceDelta(50, -3, 'red');
  P('空袭增员：100兵受3伤 → 先降为4再-3 → 1/blue', force[49] + '/' + team[49]);
  cellEffects = []; force[49] = 100;
  addCellEffect({ id: 50, type: 'air_reinforce', owner: 'red', turnCasted: 0 });
  applyForceDelta(50, -5, 'red');
  P('空袭增员：100兵受5伤 → 降为4再-5 → 0并中立', force[49] + '/' + team[49]);
  P('空袭增员：校验放行(可指向敌方格 应 null)', validateCardTarget(CARDS['air_reinforce'], 50));

  // 空袭增员：使用后给随机一个友方格挂"同名空名词条"（算增员特效、但无任何效果）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10; team[49] = 'blue'; force[49] = 100;
  CARDS['air_reinforce'].effect({ target: 50 });
  const airs = cellEffects.filter(e => e.type === 'air_reinforce');
  P('空袭增员：共 2 个词条（目标 50 真词条 + 随机友方挂名）', airs.map(e => e.id + (e.inert ? '(名)' : '(真)')).join(' '));
  P('空袭增员：挂名词条 inert、不被 applyAirReinforce 触发（只-3 不降为4）', (() => {
    const inert = airs.find(e => e.inert);
    if (!inert) return 'fail';
    const before = force[inert.id - 1];
    applyForceDelta(inert.id, -3, 'blue');
    return before + '→' + force[inert.id - 1];
  })());
  P('空袭增员：挂名词条计入「增员特效数量」', cellEffects.filter(e => REINFORCE_EFFECTS.indexOf(e.type) !== -1 && e.owner === 'red').length === 2 ? 'ok' : 'fail');

  // 进攻增员：+10 且留下可被「清除」剥除的「进攻增员」词条
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 40;
  redHand = [];
  CARDS['attack_reinforce'].effect({ target: 2 });
  P('进攻增员：2号格 40→50', force[1]);
  P('进攻增员：留下 attack_reinforce 词条(power 10)', cellEffects.filter(e => e.type === 'attack_reinforce').map(e => e.id + ':' + e.power).join(','));
  P('进攻增员：入手「爆破」与「计划」', redHand.map(c => c.cardId).join(','));
  P('进攻增员：forceBuffPower=10', forceBuffPower(2));
  clearCellEffects('blue', 2);
  P('进攻增员：清除后 50-10=40 且词条消失', force[1] + '/' + cellEffects.filter(e => e.id === 2).length);

  // 词条随军移动：不看归属（敌方挂在我方格上的词条也随格移动）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10;
  addCellEffect({ id: 2, type: 'air_reinforce', owner: 'blue', turnCasted: 0 });   // 蓝方挂的词条
  moveCellEffects(2, 3);
  P('随军移动：敌我词条一视同仁（2→3）', cellEffects.filter(e => e.type === 'air_reinforce').map(e => e.id).join(','));

  // 突击增员：兵力上限30 + 不自动增长
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 80;
  addCellEffect({ id: 2, type: 'assault_reinforce', owner: 'red', turnCasted: 0 });
  P('突击增员：兵力上限改为 30', forceCapIdx(1));
  setForce(1, 80);
  P('突击增员：setForce(80) 被截断为 30', force[1]);
  force[1] = 7; changeForce();
  P('突击增员：不自动增长（7 不变）', force[1]);

  // 控制增员：全场兵力≤30的格子无法攻击（在花指挥点前拦截）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[12] = 'red'; force[12] = 20; team[13] = 'blue'; force[13] = 10;
  addCellEffect({ id: 3, type: 'control_reinforce', owner: 'red', turnCasted: 0 });
  setCp('red', 10); tryAttack(13, 14);
  P('控制增员：兵力20无法攻击（指挥点未被消耗 应10）', getCp('red'));
  cellEffects = []; force[12] = 40; setCp('red', 10); tryAttack(13, 14);
  P('控制增员：词条移除后兵力40可攻击（指挥点被消耗 应9）', getCp('red'));

  // 被动增员：被敌方攻击 → 伤害结算前 +10
  round = 'red'; cellEffects = []; arrows = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 30; team[2] = 'blue'; force[2] = 20;
  addCellEffect({ id: 3, type: 'passive_reinforce', owner: 'blue', turnCasted: 0 });
  arrows.push({ from: 2, to: 3, num: -25, team: 'red', type: 'attack' }); force[1] = 1;
  settleArrows(); arrows = [];
  P('被动增员：20+10-25=5/blue', force[2] + '/' + team[2]);

  // 愈战愈勇：占领中立格不 +20，占领敌方格 +20
  round = 'red'; cellEffects = []; arrows = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 40; team[2] = 'none'; force[2] = 5;
  addCellEffect({ id: 2, type: 'battle_hardened', owner: 'red', turnCasted: 0, power: 0 });
  arrows.push({ from: 2, to: 3, num: -40, team: 'red', type: 'attack' }); force[1] = 1;
  settleArrows(); arrows = [];
  P('愈战愈勇：占领中立格 → 不+20（5-40→35/red）', force[2] + '/' + team[2]);
  round = 'red'; cellEffects = []; arrows = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 40; team[2] = 'blue'; force[2] = 5;
  addCellEffect({ id: 2, type: 'battle_hardened', owner: 'red', turnCasted: 0, power: 0 });
  arrows.push({ from: 2, to: 3, num: -40, team: 'red', type: 'attack' }); force[1] = 1;
  settleArrows(); arrows = [];
  P('愈战愈勇：占领敌方格 → +20（5-40→35+20=55/red）', force[2] + '/' + team[2]);

  // 国际议会：控制 1 格敌方格及其相邻敌方格
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  team[49] = 'blue'; force[49] = 30; team[39] = 'blue'; force[39] = 20; team[59] = 'blue'; force[59] = 20;
  CARDS['intl_council'].effect({ target: 50 });
  P('国际议会：50 及其相邻敌格 40/60 全部归红', team[49] + ',' + team[39] + ',' + team[59]);
  P('国际议会：不能指向己方格（应非 null）', validateCardTarget(CARDS['intl_council'], RH) ? 'ok' : 'fail');

  // 至死方休：敌方所有格子5伤，归零则重复，且保持阵营（不中立化）（2026-10-10 第十六批：10 → 5）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 25; team[48] = 'blue'; force[48] = 5;
  CARDS['fight_to_death'].effect();
  P('至死方休：50号 25→20→15；49号 5→0 触发重复后仍为蓝方', force[49] + '/' + team[49] + ' ; ' + force[48] + '/' + team[48]);

  // 增员军需部：弹出"3 选 1"抉择框，选中的那张被开发（复制洗入卡组）（2026-10-10 第十六批）
  P('sampleN：3 张不重复', (() => { const s = sampleN([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3); return s.length === 3 && new Set(s).size === 3 ? 'ok' : 'fail'; })());
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50;
  deck = ['granary']; blueDeckLocal = []; pendingChoice = null;
  CARDS['reinforce_depot'].effect();
  P('增员军需部：弹出抉择框(3 个选项)', (pendingChoice ? pendingChoice.options.length : 0) + ' / ' + (pendingChoice ? pendingChoice.executeOn : '无'));
  {
    const pc1 = pendingChoice;
    const before = deck.length;
    pendingChoice.options[0].run();
    P('增员军需部：选 1 张 → 卡组 +1', deck.length === before + 1 ? 'ok' : 'fail');
    P('增员军需部：无「增员」特效 → 不追加抉择框', pendingChoice === pc1 ? 'ok' : 'fail');
  }
  // 友方有「增员」特效 → 选完第一张后追加第二个抉择框（随机 3 张特殊卡）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10;
  addCellEffect({ id: 2, type: 'cmd_reinforce', owner: 'red', turnCasted: 0 });
  deck = ['granary']; blueDeckLocal = []; pendingChoice = null;
  CARDS['reinforce_depot'].effect();
  {
    const pc2 = pendingChoice;
    pendingChoice.options[0].run();
    P('增员军需部：有「增员」特效 → 追加第 2 个抉择框(3 个选项)', (pendingChoice !== pc2 && pendingChoice.options.length === 3) ? 'ok' : 'fail');
    const before2 = deck.length;
    pendingChoice.options[0].run();
    P('增员军需部：追加抉择再开发 1 张', deck.length === before2 + 1 ? 'ok' : 'fail');
  }

  // 渗透：每轮 2N 点（每 2 点一次随机分配），重复 N 轮（2026-10-10 第十六批改版）
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 100;
  addCellEffect({ id: 2, type: 'cmd_reinforce', owner: 'red', turnCasted: 0 });          // N=1
  CARDS['infiltrate'].effect();
  P('渗透：N=1 → 每轮 2 点 / 共 1 轮 → 100-2=98', force[49]);
  cellEffects = []; force[49] = 100;
  addCellEffect({ id: 2, type: 'cmd_reinforce', owner: 'red', turnCasted: 0 });
  addCellEffect({ id: 3, type: 'logistics_reinforce', owner: 'red', turnCasted: 0 });   // N=2
  CARDS['infiltrate'].effect();
  P('渗透：N=2 → 每轮 4 点 / 共 2 轮 → 100-8=92', force[49]);
  cellEffects = [];
  CARDS['infiltrate'].effect();
  P('渗透：N=0 → 零伤害（100 不变）', force[49]);

  // 被动增员：本回合第偶数张指令 → 每挂载一格 -1 指挥点；计数「每回合开始时重置」（2026-10-10 第十六批）
  {
    round = 'red'; cellEffects = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10;
    redHand = []; redReaction = []; blueReaction = []; deck = ['granary']; blueDeckLocal = [];
    uidCostOverride = {}; costMods = { red: {}, blue: {} };   // 清掉上一测试块残留的按-uid 费用覆盖
    addCellEffect({ id: 2, type: 'passive_reinforce', owner: 'red', turnCasted: 0 });
    instrThisTurn = { red: 0, blue: 0 };
    const gc2 = getCardCost('granary', 'red');
    for (let i = 0; i < 5; i++) redHand.push({ cardId: 'granary', uid: cardUidSeq++ });
    setCp('red', 50);
    playCard(redHand[0].uid, null);
    P('被动增员：本回合第1张(奇数)不扣', getCp('red') === 50 - gc2 ? 'ok' : 'fail');
    playCard(redHand[0].uid, null);
    P('被动增员：本回合第2张(偶数) → 再 -1', getCp('red') === 50 - 2 * gc2 - 1 ? 'ok' : 'fail');
    instrThisTurn = { red: 0, blue: 0 };   // 模拟新回合「计数器重置」
    playCard(redHand[0].uid, null);
    P('被动增员：重置后第1张又不扣（证明按回合计数而非全局累计）', getCp('red') === 50 - 3 * gc2 - 1 ? 'ok' : 'fail');
  }

  // 贪心：同一回合至多使用 5 次（2026-10-10 第十六批）
  {
    round = 'red'; cellEffects = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 100;
    redHand = []; redReaction = []; blueReaction = []; deck = ['granary']; blueDeckLocal = [];
    uidCostOverride = {}; costMods = { red: {}, blue: {} };
    greedUses = { red: 0, blue: 0 }; greedThisTurn = { red: 0, blue: 0 };
    for (let i = 0; i < 7; i++) redHand.push({ cardId: 'greed', uid: cardUidSeq++ });
    setCp('red', 50);
    for (let i = 0; i < 5; i++) playCard(redHand[0].uid, 50);
    P('贪心：连打 5 次 → 100-1-2-3-4-5=85', force[49]);
    const cp5 = getCp('red'), hand5 = redHand.length;
    playCard(redHand[0].uid, 50);
    P('贪心：第 6 次被拦截（85 不变 / cp 不变 / 手牌不减）', (force[49] === 85 && getCp('red') === cp5 && redHand.length === hand5) ? 'ok' : 'fail');
    greedThisTurn = { red: 0, blue: 0 };   // 模拟新回合重置后可再用
    playCard(redHand[0].uid, 50);
    P('贪心：重置后可再用（85-6=79）', force[49]);
  }

  // 防御增员：友方大本营获得兵力 → 随机敌格受10伤
  round = 'red'; cellEffects = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[49] = 'blue'; force[49] = 10;
  addCellEffect({ id: 2, type: 'defend_reinforce', owner: 'red', turnCasted: 0 });
  setForce(RH, 80);
  P('防御增员：大本营50→80 → 蓝方50号格 10→0并中立', force[49] + '/' + team[49]);

  // 袭击增员：被敌方占领 → 把「持续袭击增员」置于卡组顶
  round = 'red'; cellEffects = []; arrows = [];
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 10; team[2] = 'blue'; force[2] = 30;
  deck = ['granary', 'united']; blueDeckLocal = [];
  addCellEffect({ id: 2, type: 'raid_reinforce', owner: 'red', turnCasted: 0, power: 20 });
  arrows.push({ from: 3, to: 2, num: -30, team: 'blue', type: 'attack' }); force[2] = 1;
  settleArrows(); arrows = [];
  P('袭击增员：红2号格被蓝方占领 → 卡组顶为「持续袭击增员」', (deck[0] === 'sustained_raid_reinforce') + '/' + team[1]);

  // 袭击增员 / 持续袭击增员：随机目标排除敌方大本营（2026-10-12 第十七批）
  {
    const realRandom = Math.random;
    // 敌方只剩大本营 → 无合法随机目标 → 不结算（本格与大本营都不掉血）
    round = 'red'; cellEffects = []; arrows = [];
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 20; team[BH] = 'blue'; force[BH] = 80;
    Math.random = () => 0;                       // 若仍含大本营，会取到列表首个（大本营 89）
    raidReinforceStrike(2);
    P('袭击增员：敌方只剩大本营 → 不结算（大本营仍80/本格仍20）', force[BH] + '/' + force[1]);
    // 敌方除大本营外还有 1 格 → 只能打那一格，大本营不受影响
    team[49] = 'blue'; force[49] = 30;           // 50 号格（非大本营）
    Math.random = () => 0;                       // 取列表首项
    raidReinforceStrike(2);
    P('袭击增员：只对非大本营敌格造成伤害（50号格 30-20=10）', force[49]);
    P('袭击增员：大本营不受影响（仍80）', force[BH]);
    P('袭击增员：本格承受该敌格兵力(20-30 → 0，归属不变)', force[1] + '/' + team[1]);
    // 多格敌方（含大本营）时，随机池不含大本营
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50; team[1] = 'red'; force[1] = 20;
    team[BH] = 'blue'; force[BH] = 80; team[49] = 'blue'; force[49] = 30; team[48] = 'blue'; force[48] = 30;
    Math.random = realRandom;                    // 恢复真随机，跑真实随机池
    let hitHome = false;
    for (let k = 0; k < 80; k++) {
      force[BH] = 80; force[49] = 30; force[48] = 30; force[1] = 20; team[1] = 'red';
      raidReinforceStrike(2);
      if (force[BH] !== 80) hitHome = true;
    }
    P('袭击增员：80 次真随机均未命中大本营（应 false）', hitHome);
    Math.random = realRandom;
  }

  // 全局规则：每方回合开始，初始大本营周围 3×3 的中立格 → 兵力5的己方格
  try {
    round = 'red'; cellEffects = []; isJoin = false; isWatch = false;
    team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
    team[RH] = 'red'; force[RH] = 50;
    deck = new Array(10).fill('granary'); blueDeckLocal = []; redHand = []; redReaction = []; blueReaction = [];
    startTurn('red');
    const nine = [1, 2, 3, 11, 12, 13, 21, 22, 23];
    P('全局规则：回合开始后大本营周边9格全部归本方(红)', nine.every(id => team[id - 1] === 'red') ? 'ok' : 'fail');
    P('全局规则：原中立格兵力（后勤格会再+5）', nine.map(id => id + ':' + force[id - 1]).join(' '));
  } catch (e) { P('全局规则：startTurn 异常', e.message); }
  P('后勤中枢：不能指大本营', validateCardTarget(CARDS['logi_hub'], RED_HOME) !== null);
  cellEffects = []; redHand = []; deck = ['granary', 'united'];
  triggerCardUsedHooks('red', 0);
  P('后勤中枢：无词条时不抽', redHand.length + '/' + deck.length);

  // ===== 2026-10-04 第六批 A：大本营兵力上限 200 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 180; team[1] = 'red'; force[1] = 90;
  P('forceCapIdx：红大本营12号/普通2号/蓝大本营89号', forceCapIdx(RH) + '/' + forceCapIdx(1) + '/' + forceCapIdx(BH));
  setForce(RH, 260); P('setForce 大本营 260 → 200', force[RH]);
  setForce(1, 260); P('setForce 普通格 260 → 99', force[1]);
  applyForceDelta(RED_HOME, 50, 'red');
  P('大本营 180+50 → 200（不再卡 99）', force[RH]);
  force[RH] = 190;
  applyForceDelta(RED_HOME, 50, 'red');
  P('大本营 190+50 → 200（封顶）', force[RH]);
  force[1] = 90;
  applyForceDelta(2, 50, 'red');
  P('普通格 90+50 → 99（仍封 99）', force[1]);

  // ===== 2026-10-04 第六批 B：其它格子 → 大本营 移动花费 10 =====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  [1, RH].forEach(i => { team[i] = 'red'; force[i] = 20; });   // 2 号格 与 12 号格（红大本营）
  redCp = 30; redReaction = []; arrows = []; attackedCells = [];
  actionsThisTurn = { red: 0, blue: 0 };
  blitzActive = null; fastDispatch = null; actedThisTurn = false;
  tryMove(2, RED_HOME);
  P('向大本营移动花费 10（30-10=20）', redCp);
  redCp = 30; arrows = [];
  tryMove(RED_HOME, 2);
  P('普通移动仍 1 费（30-1=29）', redCp);

  // ===== 2026-10-04 第六批 C：存档码支持大本营 200（新 401 / 兼容旧 301） =====
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 200;
  team[BH] = 'blue'; force[BH] = 137;
  team[49] = 'red'; force[49] = 88;
  round = 'red';
  const saveCode401 = encode();
  P('存档码长度 401', saveCode401.length);
  force = new Array(TOTAL_CELLS).fill(0); team = new Array(TOTAL_CELLS).fill('none');
  P('401 存档码解码成功', decode(saveCode401));
  P('还原 200/137/88', force[RH] + '/' + force[BH] + '/' + force[49]);
  let old301 = '';
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const tc = i === RH ? 'r' : (i === BH ? 'b' : 'n');
    const fc = i === RH ? 99 : (i === BH ? 50 : 0);
    old301 += tc + String(fc).padStart(2, '0');
  }
  old301 += 'r';
  force = new Array(TOTAL_CELLS).fill(0); team = new Array(TOTAL_CELLS).fill('none');
  P('旧 301 存档码仍可读', decode(old301));
  P('旧码还原 99/50', force[RH] + '/' + force[BH]);

  // ===== 2026-10-04 第七批 A：初始大本营 100 =====
  initGame();
  P('初始：红方大本营 12 号格(100)', force[11]);
  P('初始：蓝方大本营 89 号格(100)', force[88]);
  P('初始：红方后勤 1/2/11 号格(30)', force[0] + '/' + force[1] + '/' + force[10]);
  P('初始：红方前沿 3/13/21/22/23 号格(25)', [2, 12, 20, 21, 22].map(i => force[i]).join('/'));
  P('初始：第 4 行（31/32/33）为中立 5 兵力', [30, 31, 32].map(i => force[i] + force[i] && team[i]).join('/') + '|' + [30, 31, 32].map(i => force[i]).join('/'));
  P('初始：蓝方后勤 100/99/90 号格(30)', force[99] + '/' + force[98] + '/' + force[89]);
  P('初始：蓝方前沿 98/88/80/79/78 号格(25)', [97, 87, 79, 78, 77].map(i => force[i]).join('/'));
  P('初始：第 7 行（71~77）为中立 5 兵力', [70, 71, 72, 73, 74, 75, 76].map(i => team[i]).join('/') + '|' + [70, 71, 72, 73, 74, 75, 76].map(i => force[i]).join('/'));
  P('初始：双方各控制 9 格', countCells('red') + '/' + countCells('blue'));
  P('初始：中立 41~60 号格(10)', force[40] + '/' + force[59] + '/' + force[60]);

  // ===== 联合进攻 80 / 联邦国家（门槛 150 → 100 伤害，2026-10-05 第八批 C）=====
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 100;
  team[BH] = 'blue'; force[BH] = 200;
  CARDS['united'].effect({ target: BLUE_HOME });
  P('联合进攻：敌大本营 200-80=120', force[BH]);

  force[RH] = 150; force[BH] = 190; redHand = []; deck = new Array(10).fill('granary');
  CARDS['federal'].effect();
  P('联邦国家：友方大本营 150≥150 → 敌大本营 190-100=90', force[BH]);
  P('联邦国家：抽 4 张', redHand.length);

  force[RH] = 149; force[BH] = 190; redHand = [];
  CARDS['federal'].effect();
  P('联邦国家：友方大本营 149<150 → 不打(仍190)', force[BH]);

  // ===== 2026-10-06 第八批：大本营前移 + 后勤区 =====
  P('地图常量 红大本营/蓝大本营', RED_HOME + '/' + BLUE_HOME);
  P('后勤格 红/蓝', LOGISTICS_RED.join(',') + ' | ' + LOGISTICS_BLUE.join(','));
  P('isHomeId：12/89 为真、1/100 为假', [12, 89].every(isHomeId) + '/' + [1, 100].every(id => !isHomeId(id)));
  P('isLogisticsId：1/2/11/90/99/100 为真、12/89/13 为假',
    [1, 2, 11, 90, 99, 100].every(isLogisticsId) + '/' + [12, 89, 13].every(id => !isLogisticsId(id)));
  P('homeOf / enemyHomeOf(red)', homeOf('red') + '/' + enemyHomeOf('red'));
  P('homeOf / enemyHomeOf(blue)', homeOf('blue') + '/' + enemyHomeOf('blue'));
  P('forceCapIdx 大本营 200 / 后勤格 99', forceCapIdx(RH) + '/' + forceCapIdx(BH) + '/' + forceCapIdx(0));

  // 后勤补给：每个己方回合开始 +5（只涨己方控制的）
  round = 'red'; cellEffects = []; costMods = { red: {}, blue: {} };
  team = new Array(TOTAL_CELLS).fill('none'); force = new Array(TOTAL_CELLS).fill(0);
  team[RH] = 'red'; force[RH] = 100;
  [0, 1, 10].forEach(i => { team[i] = 'red'; force[i] = 20; });     // 红方后勤 1/2/11
  [89, 98, 99].forEach(i => { team[i] = 'blue'; force[i] = 20; });  // 蓝方后勤 90/99/100
  blueHand = []; blueReaction = []; redReaction = []; redHand = [];
  deck = new Array(10).fill('granary'); blueDeckLocal = new Array(10).fill('granary');
  redSlot = 5; redCp = 0; turnCounter = 2; conscriptGranted = { red: true, blue: true };
  startTurn('red');
  P('后勤补给：红方后勤 20→25', force[0] + '/' + force[1] + '/' + force[10]);
  P('后勤补给：蓝方后勤不受影响(仍20)', force[89] + '/' + force[98] + '/' + force[99]);
  P('后勤补给：大本营不自动涨兵(仍100)', force[RH]);
  team[0] = 'blue'; force[0] = 90;      // 1 号格被敌方占领
  startTurn('red');
  P('后勤补给：被敌方占领的后勤格不给自己涨(仍90)', force[0]);
  P('后勤补给：其它后勤格继续涨(25→30)', force[1] + '/' + force[10]);

  // ===== 2026-10-06 第十二批：语言系统（表情快捷语句）=====
  P('表情：8 条固定语句', EMOTE_LINES.length === 8);
  // 2026-10-06 回归：提交卡组后应自动进入调度（本地模式）
  deck = ['granary','carpet','superspread','scatter'];
  MODE = 'local'; isHost = false; isJoin = false; isWatch = false; deckLocked = false;
  blueSubmitted = false; redDeckConfigured = false;
  onRedDeckSet();
  P('本地：提交卡组后自动弹出调度', document.getElementById('mulliganModal').classList.contains('show'));
  P('本地：调度方 = 红方', mulliganActiveTeam);
  P('本地：提交后卡组锁定', deckLocked === true);
  P('表情：第 1/8 条文案', EMOTE_LINES[0] + ' | ' + EMOTE_LINES[7]);
  P('表情：冷却时长 = 8 秒', EMOTE_CD_MS === 8 * 1000);
  // 冷却与发送
  resetEmote();
  emoteReadyAt = 0;
  P('表情：初始可发送(冷却为 0)', emoteReadyAt === 0);
  sendEmote(0);                                  // 本地（MODE=local 时不会外发）
  P('表情：发送后进入冷却', emoteReadyAt > Date.now());
  const beforeReady = emoteReadyAt;
  sendEmote(1);                                  // 冷却期间再发应被拒绝
  P('表情：冷却期间再发被拒绝(冷却时间不变)', emoteReadyAt === beforeReady);
  resetEmote();
  P('表情：resetEmote 解除冷却', emoteReadyAt === 0);
  // 飘字节点：本地发送会往飘字层塞节点（DOM 桩下 children 会被记录）
  const layer = document.getElementById('emoteLayer');
  layer.children.length = 0;
  showEmote(2, 'red');
  showEmote(3, 'blue');
  P('表情：红/蓝飘字各自入层', layer.children.length === 2);
  P('表情：红方 class 含 red', layer.children[0].className.indexOf('red') !== -1);
  P('表情：蓝方 class 含 blue', layer.children[1].className.indexOf('blue') !== -1);
  P('表情：飘字层节点数可回收(动画结束移除)', layer.children.length === 2);

  // ===== 2026-10-12 第十七批：取消按钮（取消指令的目标选择）=====
  {
    MODE = 'local'; isHost = false; isJoin = false; isWatch = false;
    gameOver = false;
    const cbtn = document.getElementById('btnCancelTarget');
    // 1) 初始/无选格状态：置灰
    cardTargetMode = null; pendingBlueTarget = null;
    updateCancelTargetBtn();
    P('取消按钮：无选格状态置灰', cbtn.disabled === true);
    P('取消按钮：无选格时点击无副作用', cancelTargetSelection() === false);
    // 2) 进入选格状态后 → 可用
    round = 'red';
    cardTargetMode = { uid: 777 };
    updateCancelTargetBtn();
    P('取消按钮：选格后变为可用', cbtn.disabled === false);
    // 3) 取消后：回到置灰且状态清空
    P('取消按钮：取消返回 true', cancelTargetSelection() === true);
    P('取消按钮：取消后 cardTargetMode 清空', cardTargetMode === null);
    P('取消按钮：取消后按钮回到置灰', cbtn.disabled === true);
    // 4) 取消不消耗手牌 / 指挥点（选格阶段未进入 playCard 结算）
    redHand = [{ cardId: 'scatter', uid: 777 }]; deck = ['granary', 'carpet'];
    setCp('red', 10);
    const handBefore = redHand.length, cpBefore = getCp('red'), deckBefore = deck.length;
    cardTargetMode = { uid: 777 };
    updateCancelTargetBtn();
    cancelTargetSelection();
    P('取消按钮：不消耗手牌', redHand.length === handBefore);
    P('取消按钮：不消耗指挥点', getCp('red') === cpBefore);
    P('取消按钮：不消耗牌库', deck.length === deckBefore);
    // 5) 空中优势（行列选择）走 cancelRowCol 分支
    cardTargetMode = { uid: 888, rowcol: true };
    updateCancelTargetBtn();
    P('取消按钮：天空优势选行列时可用', cbtn.disabled === false);
    P('取消按钮：天空优势取消返回 true', cancelTargetSelection() === true);
    P('取消按钮：天空优势取消后清空', cardTargetMode === null);
    // 6) 观战：恒置灰、取消无效
    isWatch = true;
    cardTargetMode = { uid: 999 };
    updateCancelTargetBtn();
    P('取消按钮：观战恒置灰', cbtn.disabled === true);
    P('取消按钮：观战取消无效', cancelTargetSelection() === false);
    isWatch = false;
    // 7) host 代蓝方选格中（pendingBlueTarget）也可取消
    MODE = 'host'; isHost = true; isJoin = false;
    cardTargetMode = null; pendingBlueTarget = 555;
    updateCancelTargetBtn();
    P('取消按钮：host 待蓝方选格时可用', cbtn.disabled === false);
    P('取消按钮：host 取消蓝方待选返回 true', cancelTargetSelection() === true);
    P('取消按钮：host 取消后 pendingBlueTarget 清空', pendingBlueTarget === null);
    // 8) 蓝方本地取消：应发出 cancelTarget 指令
    MODE = 'join'; isHost = false; isJoin = true;
    cardTargetMode = { uid: 444 };
    let sent = null;
    sendCardCmd = function (p) { sent = p; return true; };
    cancelTargetSelection();
    P('取消按钮：蓝方取消发送 cancelTarget 指令', sent && sent.type === 'cancelTarget');
    P('取消按钮：蓝方取消后本地状态清空', cardTargetMode === null);
  }

  // ===== 2026-10-06 回归：蓝方指令在房主端必须被正确分发（msg.type 笔误曾让整链静默失败）=====
  // 背景：handlePeerCmd 里 cardTarget 分支误写 msg.type（msg 只在 ws.onmessage 内声明），
  // 导致 deck / cardTarget / emote / mulligan 等所有走到该分支的蓝方指令抛 ReferenceError，
  // 进而红方看不到蓝方表情、蓝方提交卡组后不弹调度。此处用行为断言锁死。
  {
    // 1) 蓝方提交卡组 → 应触发 handleBlueDeck（blueSubmitted 置真）
    MODE = 'host'; isHost = true; isJoin = false; isWatch = false;
    redDeckConfigured = true; blueSubmitted = false; blueDeckLocal = [];
    let threw = false;
    try { handlePeerCmd({ type: 'deck', code: null }); } catch (e) { threw = true; }
    P('蓝方指令 deck：不抛异常', threw === false);
    P('蓝方指令 deck：已标记蓝方提交', blueSubmitted === true);

    // 2) 蓝方发身份证表情 → 房主端应播放（飘字层新增一个 blue 节点）
    const eLayer = document.getElementById('emoteLayer');
    eLayer.children.length = 0;
    threw = false;
    try { handlePeerCmd({ type: 'emote', index: 2 }); } catch (e) { threw = true; }
    P('蓝方指令 emote：不抛异常', threw === false);
    P('蓝方指令 emote：房主端播放了蓝方飘字', eLayer.children.length === 1 && eLayer.children[0].className.indexOf('blue') !== -1);

    // 3) 蓝方指向性卡牌（cardTarget）→ 不应抛异常（round 非蓝方时提前 return 也算正常）
    round = 'red';
    threw = false;
    try { handlePeerCmd({ type: 'cardTarget', uid: 'x', target: 12 }); } catch (e) { threw = true; }
    P('蓝方指令 cardTarget：不抛异常', threw === false);

    // 4) 未知指令类型不应抛异常（防御性 else 分支）
    threw = false;
    try { handlePeerCmd({ type: '__unknown__' }); } catch (e) { threw = true; }
    P('未知蓝方指令：不抛异常(有兜底)', threw === false);
  }
})();
function encodeDeck_src(a){ return 'D1' + btoa(unescape(encodeURIComponent(JSON.stringify(a)))); }
`;

try {
  vm.createContext(sandbox);
  new vm.Script(code + '\n' + test, { filename: 'ma_jia_qi_2.html' }).runInContext(sandbox);
  console.log('\n[selftest] 全部断言执行完毕（请核对上面的期望值）');
} catch (e) {
  console.log('❌ 运行异常:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e);
  process.exitCode = 1;
}

// ---- 静态结构检查（HTML 层，直接扫源码）----
console.log('\n[结构检查]');
console.log('卡组上限常量 50 =>', /const MAX_DECK = 50;/.test(html));
console.log('终局遮罩已移除「再来一局」按钮 =>', !/<button class="victory-btn"/.test(html) && !/再来一局/.test(html.replace(/^.*终局遮罩：点击任意处关闭.*$/m, '')));
console.log('closeVictory 已定义 =>', /function closeVictory\(\)/.test(html));
console.log('组卡器上限 50 =>', /const MAX_DECK = 50;/.test(builderHtml));
console.log('挂起/取消反制日志走私密通道(不进公用战报) =>', /logPrivate\('挂起激活反制/.test(html) && /logPrivate\('取消激活/.test(html));
console.log('战报同步剔除红方私密条目 =>', /gameLog\.filter\(e => !\(e\.privateTeam && e\.privateTeam !== 'blue'\)\)/.test(html));
console.log('牌堆惩罚按阵营独立 =>', /growthFactor\[drawTeam\]/.test(html) && /growthFactor\[round\]/.test(html) && !/growthFactor = 1;/.test(html));
console.log('趁虚而入 +55 已同步 =>', /具有\+55兵力/.test(html) && /具有\+55兵力/.test(builderHtml) && !/具有\+40兵力/.test(html));
console.log('生化小队 +65 已同步 =>', /使一个友方格\+65兵力/.test(html) && /使一个友方格\+65兵力/.test(builderHtml) && !/使一个友方格\+30兵力/.test(html));
console.log('闪电袭击 已由 1K/40 改为 2K/25 =>', !/name: '闪电袭击', cost: 1/.test(html) && !/其大本营-40/.test(html) && !/name: '闪电袭击', cost: 1/.test(builderHtml));
console.log('新兵入伍 改为只给友方 +10 =>', /友方所有格子\+10兵力/.test(html) && /友方所有格子获得\+10兵力/.test(builderHtml) && !/全场所有格子\+10兵力/.test(html) && !/全场所有格子获得\+10兵力/.test(builderHtml));
console.log('养精蓄锐 99 仍洗入 =>', !/dmg < 99/.test(html) && /if \(f <= dmg\) \{/.test(html));
console.log('局部抵抗伤害归属已修正 =>', /applyForceDelta\(enemyHome, -10, round\);/.test(html));
console.log('非额外抽牌(开局/调度)已排除 =>', (html.match(/isTurnStartDraw = true;/g) || []).length >= 4);
console.log('非转化式易主清空词条：helper + 各调用点就位 =>', /function purgeEffectsOnCapture\(cellId\)/.test(html)
  && /purgeEffectsOnCapture\(a\.to\);\s*\/\/ 变成中立格/.test(html)
  && /force\[toIdx\] < 0\)[\s\S]*?purgeEffectsOnCapture\(a\.to\);/.test(html)
  && (html.match(/purgeEffectsOnCapture\(/g) || []).length >= 8);
console.log('转化式易主(混乱/叛乱/快速联络/边境巡查)不整格清空 =>', ['chaos','rebellion','fastlink','border_patrol'].every(k => (html.match(new RegExp(k + ':[\\s\\S]{0,900}?purgeCellEffects\\(')) || []).length === 0));
console.log('反制触发 记双方战报(蓝方不再静默) =>', !/announceBlueReaction/.test(html) && /if \(title\) logGame\(title \+ \(sub/.test(html));
console.log('蓝方反制触发的 fx 只发蓝方屏幕 =>', /msgForBlue\.fx = \{ title: title, sub: sub \|\| '' \};/.test(html) && /owner === 'blue'/.test(html));
console.log('激活/取消反制 仍走私密通道 =>', /logPrivate\('挂起激活反制/.test(html) && /logPrivate\('取消激活/.test(html));
console.log('武装抵抗 3K/20伤/每2溢出1张/不可打总部 =>', /cost: 3, type: '指令', level: '特殊'/.test(html) && /对一个敌方格子（不能指向大本营）造成20伤害/.test(html) && /const n = Math\.floor\(extra \/ 2\)/.test(html) && /武装抵抗：目标不能是大本营/.test(html) && /不能指向大本营/.test(builderHtml));
console.log('破译机「复制」/ 军事要塞联袂「开发」=>', /各「开发」一份复制品洗入友方卡组/.test(html) && /各「开发」一份复制品洗入友方卡组/.test(builderHtml) && /军事要塞：开发己方/.test(html));
console.log('加急电报 免费券机制（洗牌不失效）=>', /freeDrawTickets\[drawTeam\]/.test(html) && /uidCostOverride\[inst\.uid\] = -getCardCost/.test(html) && /freeDrawTickets\[round\]\[c\.cardId\]/.test(html));
console.log('调度军队 词条已注册并接入指令计数 =>', /case 'dispatch_army'/.test(html) && /hasEffect\(myHome\(\), 'dispatch_army', round\)/.test(html) && /instrThisTurn\[round\] === 2/.test(html));
console.log('三张新卡在组卡器可携带 =>', ["nursing_team", "express_telegram", "dispatch_army"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('组卡器五维筛选就绪 =>', /id="fLevel"/.test(builderHtml) && /id="fCost"/.test(builderHtml) && /id="fName"/.test(builderHtml) && /id="fDesc"/.test(builderHtml) && /function matchFilters/.test(builderHtml));
console.log('组卡器保留稀有度彩色 =>', /--rar-elite:/.test(builderHtml) && /\.tag-level\.精英 \{ background: var\(--rar-elite\)/.test(builderHtml));
console.log('抉择弹窗已删除取消按钮 =>', !/onclick="closeChoice\(\)"/.test(html) && !/function closeChoice/.test(html) && /id="choiceList"/.test(html));
console.log('词条随军移动已全局化 =>', /function moveCellEffects/.test(html) && /const EFFECT_NO_MOVE/.test(html) && (html.match(/moveCellEffects\(/g) || []).length >= 3);
console.log('寸步难行 已接入行动计数 =>', /actionsThisTurn\[round\]\+\+/.test(html) && /cardId === 'stuck'/.test(html) && /2 \* acts/.test(html));
console.log('国家消防局 6K 改版就绪 =>', /id: 'fire_dept', name: '国家消防局', cost: 6/.test(html) && /fireDeptGuard\[team\[cellId - 1\]\]/.test(html) && /fire_dept_guard/.test(html));
console.log('卡池条目 158（含第十五批 16 张新卡）=>', (html.match(/^    id: '/gm) || []).length === 158);
console.log('两端隐藏名单一致(46 条) =>', (html.match(/const HIDDEN_IN_BUILDER = \[([^\]]*)\]/)[1].match(/'/g) || []).length === 92 && (builderHtml.match(/const HIDDEN_IN_BUILDER = \[([^\]]*)\]/)[1].match(/'/g) || []).length === 92);
console.log('五张可携带新卡在组卡器 =>', ["leap_prod", "transform_prod", "special_study", "trap_siege", "stuck"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('启动脚本支持自定义端口 =>', /set \/p "PORT=/.test(batMain) && /call node server\.js !PORT!/.test(batMain) && /if not "%~1"==""/.test(batMain));
console.log('清理端口脚本要求输入端口 =>', /set \/p "PORT=/.test(batClear) && /必须输入一个端口号/.test(batClear) && !/set "PORT=3000"/.test(batClear));
console.log('server.js 端口可自定义 =>', /Number\(process\.argv\[2\] \|\| process\.env\.PORT\) \|\| 3000/.test(serverJs));
console.log('bat 中文编码正常(启动=GBK/936, 清理=UTF8/65001) =>', !/\uFFFD/.test(batMain) && !/\uFFFD/.test(batClear) && batMain.indexOf('?') === -1 && batClear.indexOf('?') === -1);
console.log('快速联络回退已修好变量遮蔽 =>', /function tickFastlink\(side\)/.test(html) && !/function tickFastlink\(team\)/.test(html) && /e\.type !== 'fastlink_dmg'/.test(html));
console.log('对局开始后不能导入卡组 =>', /if \(deckLocked\) \{\s*setMessage\('对局已经开始，无法再导入卡组/.test(html) && /id="btnDeckImport"/.test(html) && /btnDeckImport'\); if \(dBtn\) dBtn\.disabled = true;/.test(html) && /deckLocked = false;   \/\/ 重开/.test(html) && /deckLocked = !!s\.deckLocked;/.test(html) && !/if \(isJoin && deckLocked\)/.test(html));
console.log('快速联络 移动进入即视为占领 =>', /临时连接的本方格子一旦被真正占领/.test(html) && /不再回退/.test(html));
console.log('愈战愈勇 已接入攻击结算 =>', /battle_hardened/.test(html) && /占领成功后 \+20兵力/.test(html));
console.log('使用卡牌钩子(指令增员/非常规兵员/后勤中枢) =>', /function triggerCardUsedHooks\(side, cardCost\)/.test(html) && /triggerCardUsedHooks\(round, instCost\(card\)\)/.test(html) && /case 'cmd_reinforce'/.test(html) && /e\.type === 'logi_hub'/.test(html) && /if \(cardCost === 0\)/.test(html));
console.log('鼓舞减费已接入 getCardCost =>', /hasEffect\(homeOf\(t\), 'inspire', t\)/.test(html));
console.log('合成机油已接入 startTurn =>', /hasEffect\(homeOf\(team\), 'synth_oil', team\)/.test(html));
console.log('后勤线已接入研发随机池 =>', /'def_research', 'log_research'\]/.test(html) && /log_research: 'ext_log_research'/.test(html));
console.log('12 张新卡在组卡器 =>', ["bomb_boom","cmd_reinforce","irregular_troops","battle_hardened","inspire","log_research","flying_bomb","ext_log_research","synth_oil","adv_log_research","silent_raid","nuke_world"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('组卡器已补齐防御研发链 =>', ["def_research","warning","ext_def_research","def_component","adv_def_research","active_sonar","suppress_retreat"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('两端卡表条目一致(158) =>', (html.match(/^    id: '/gm) || []).length === 158 && (builderHtml.match(/id:'[a-z0-9_]+'/g) || []).length === 158);
console.log('力量结算新规则就位 =>', /mode === 'neutral'/.test(html) && /mode === 'combat'/.test(html) && /2026-10-04 新规则/.test(html) && /attackerTeam, 'neutral'\)/.test(html));
console.log('清除：移除「兵力增加」词条带来的兵力(保底20) =>', /const FORCE_BUFF_EFFECTS = \['levee', 'boost_prod', 'air_assist', 'mil_center', 'irregular', 'battle_hardened', 'call_to_arms', 'attack_reinforce'\]/.test(html) && /function forceBuffPower\(cellId\)/.test(html) && /setForce\(cellId - 1, Math\.max\(20, before - buff\)\)/.test(html) && /max\(20, 当前兵力-所有因词条增加的兵力\)/.test(html) && /max\(20, 当前兵力-所有因词条增加的兵力\)/.test(builderHtml));
console.log('持续型兵力加成会累加 power =>', (html.match(/\.power = \(e\.power \|\| 0\) \+ /g) || []).length >= 2 && /bh\.power = \(bh\.power \|\| 0\) \+ 20/.test(html));
console.log('三张清除类卡牌卡面已去掉固定 -10 =>', !/并-10兵力|各-10兵力|该格-10兵力/.test(html) && !/并-10兵力|各-10兵力/.test(builderHtml));
console.log('投降按钮（右上角固定，观战隐藏）=>', /<button class="surrender-btn" id="btnSurrender" onclick="onBtnSurrender\(\)">/.test(html) && /\.surrender-btn \{\s*\n\s*position: fixed;/.test(html) && /top: 14px;/.test(html) && /right: 16px;/.test(html) && /body\.spectating \.surrender-btn \{ display: none; \}/.test(html));
console.log('投降：确认弹窗 + 判定对方获胜 + 联机指令 =>', /id="surrenderModal"/.test(html) && /function onBtnSurrender\(\)/.test(html) && /function confirmSurrender\(\)/.test(html) && /function surrenderNow\(side\)/.test(html) && /if \(MODE === 'local'\) \{ surrenderNow\(round\); return; \}/.test(html) && /if \(isHost\) \{ surrenderNow\('red'\); return; \}/.test(html) && /sendCardCmd\(\{ type: 'surrender' \}\)/.test(html) && /cmd\.type === 'surrender'/.test(html) && /surrenderNow\('blue'\)/.test(html) && /logGame\(tn \+ '投降，判' \+ wn \+ '获胜', 'warn'\)/.test(html));
console.log('地图：大本营前移到 12/89 + 后勤区（无 1/100 硬编码残留）=>', /const RED_HOME = 12;/.test(html) && /const BLUE_HOME = 89;/.test(html) && /const LOGISTICS_RED = \[1, 2, 11\];/.test(html) && /const LOGISTICS_BLUE = \[100, 99, 90\];/.test(html) && /function isHomeId\(id\)/.test(html) && /function isLogisticsId\(id\)/.test(html) && /function homeOwnerOf\(id\)/.test(html) && !/id === 1 \|\| id === 100/.test(html) && !/cellId === 1 \|\| cellId === 100/.test(html) && !/t === 1 \|\| t === 100/.test(html));
console.log('后勤区：只能移动不能主动攻击 + 每己方回合 +5 =>', /后勤区格子只能移动，不能主动发起攻击/.test(html) && /const LOGISTICS_GROW = 5;/.test(html) && /后勤补给：/.test(html) && /cell\.logistics/.test(html));
console.log('指令增员 5 伤 / 后勤增员 15 伤 已同步 =>', /id: 'cmd_reinforce', name: '指令增员', cost: 5, type: '指令', level: '限定'/.test(html) && /cmd_reinforce:\{ id:'cmd_reinforce', name:'指令增员', cost:5, type:'指令', level:'限定'/.test(builderHtml) && /友方每次使用指令时，对一个随机敌方格子造成5点伤害/.test(html) && /友方每次使用指令时，对一个随机敌方格子造成5点伤害/.test(builderHtml) && /友方使用指令时，对一个随机敌方格子造成15点伤害/.test(html) && /友方使用指令时，对一个随机敌方格子造成15点伤害/.test(builderHtml) && /reinforcerStrike\(side, 'cmd_reinforce', 5, '指令增员'\)/.test(html) && /reinforcerStrike\(side, 'logistics_reinforce', 15, '后勤增员'\)/.test(html));
console.log('第十五批：16 张新卡两端就位 =>', ['intl_council','fight_to_death','reinforce_depot','reinforce_raid','infiltrate','special_reinforce_op','passive_reinforce','attack_reinforce','blast','air_reinforce','raid_reinforce','sustained_raid_reinforce','defend_reinforce','assault_reinforce','control_reinforce','logistics_reinforce'].every(id => new RegExp("id: '" + id + "'").test(html) && builderHtml.indexOf(id + ":{ id:'" + id + "'") !== -1));
console.log('第十五批：增员体系常量 + 隐藏名单两端一致 =>', /const REINFORCE_CARDS = \['passive_reinforce'/.test(html) && /const REINFORCE_EFFECTS = \['passive_reinforce'/.test(html) && /function hasReinforceEffect\(side\)/.test(html) && /'blast', 'sustained_raid_reinforce'\];/.test(html) && /'blast', 'sustained_raid_reinforce'\];/.test(builderHtml));
console.log('第十五批：新机制钩子就位 =>', /function applyAirReinforce\(cellId\)/.test(html) && /function passiveReinforceBuff\(cellId, attackerTeam\)/.test(html) && /function raidReinforceStrike\(selfId\)/.test(html) && /function reinforcerStrike\(side, type, dmg, label\)/.test(html) && /function onHomeGainForce\(idx\)/.test(html) && /e\.type === 'control_reinforce'/.test(html) && /e\.type === 'assault_reinforce'/.test(html) && /a\.capturedFrom === 'none'/.test(html) && /突击增员：该格不可以作为兵力移动的目标/.test(html));
console.log('袭击增员/持续袭击增员：随机敌格排除大本营 =>', /if \(isHomeIdx\(i\)\) continue;   \/\/ 不打大本营/.test(html) && /对一个随机敌方格子（不含大本营）造成等同于本格兵力值的伤害/.test(html) && /对一个随机敌方格子（不含大本营）造成等同于本格兵力值的伤害/.test(builderHtml));
console.log('第十五批：全局规则(大本营周边9格集结) + setCellOwner =>', /大本营周边集结/.test(html) && /around3x3\(homeId\)/.test(html) && /function setCellOwner\(id, owner\)/.test(html));
console.log('第十五批：号召 1K 两端一致 =>', /name: '号召', cost: 1/.test(html) && /name:'号召', cost:1/.test(builderHtml));
console.log('第十五批修正：进攻增员留痕(真词条/+10/可清除) =>', /addCellEffect\(\{ id: ctx\.target, type: 'attack_reinforce', owner: round, turnCasted: turnCounter, power: 10 \}\)/.test(html) && /, 'attack_reinforce'\];/.test(html) && /case 'attack_reinforce'/.test(html) && /attack_reinforce:\{ id:'attack_reinforce'/.test(builderHtml) && /随军移动、可被「清除」剥除/.test(html) && /随军移动、可被「清除」剥除/.test(builderHtml));
console.log('第十五批修正：空袭增员挂名(算增员特效/无实际效果) =>', /inert: true/.test(html) && /type === 'air_reinforce' && !e\.inert/.test(html) && /e\.inert \? '（仅挂名，无任何效果）'/.test(html) && /'passive_reinforce', 'attack_reinforce', 'air_reinforce'/.test(html) && /仅挂名，无任何效果/.test(builderHtml));
console.log('第十五批修正：词条随军移动不看归属 =>', /function moveCellEffects\(fromId, toId\) \{/.test(html) && !/e\.owner === owner && EFFECT_NO_MOVE/.test(html) && /moveCellEffects\(a\.from, a\.to\);/.test(html) && /moveCellEffects\(fromId, toId\);/.test(html));
console.log('第十六批之三：被动增员按回合计数 + 贪心每回合至多5次 =>', /instrThisTurn\[round\] % 2 === 0/.test(html) && !/instrTotal/.test(html) && /greedThisTurn\[round\] >= 5/.test(html) && /let greedThisTurn = \{ red: 0, blue: 0 \};/.test(html) && /greedThisTurn = \{ red: 0, blue: 0 \};  \/\/ 贪心使用次数每回合重置/.test(html) && /同一回合至多使用 5 次/.test(html) && /同一回合至多使用 5 次/.test(builderHtml) && /本回合友方使用第偶数张指令时/.test(html) && /本回合友方使用第偶数张指令时/.test(builderHtml));
console.log('第十六批之二：渗透 2N/每2点一次 + 特殊增员行动 8K =>', /每 2 点伤害做一次随机分配/.test(html) && /damageNoOverkill\(list\[Math\.floor\(Math\.random\(\) \* list\.length\)\], 2, round\)/.test(html) && /2×友方增员特效数量/.test(html) && /2×友方增员特效数量/.test(builderHtml) && /id: 'special_reinforce_op', name: '特殊增员行动', cost: 8/.test(html) && /special_reinforce_op:\{ id:'special_reinforce_op', name:'特殊增员行动', cost:8/.test(builderHtml));
console.log('第十六批：增员军需部 3 选 1 抉择框 + 至死方休 5 伤 =>', /openChoice\('增员军需部 · 抉择/.test(html) && /function openDepotSpecialChoice\(\)/.test(html) && /function sampleN\(arr, n\)/.test(html) && /if \(bonus\) openDepotSpecialChoice\(\);/.test(html) && /从随机 3 张「增员」类指令中选择一张/.test(html) && /从随机 3 张「增员」类指令中选择一张/.test(builderHtml) && /对敌方所有格子造成5点伤害/.test(html) && /对敌方所有格子造成5点伤害/.test(builderHtml) && !/对敌方所有格子造成10点伤害/.test(html) && !/对敌方所有格子造成10点伤害/.test(builderHtml));
console.log('核平天下 保留格随大本营自动推导 =>', /\[RED_HOME, BLUE_HOME\]\.concat\(orthNeighbors\(RED_HOME\), orthNeighbors\(BLUE_HOME\)\)/.test(html) && /除双方大本营及其相邻格外/.test(html) && /除双方大本营及其相邻格外/.test(builderHtml));
console.log('堡垒防御：兵力设为 135（不是 +135）=>', /setForce\(myHome\(\) - 1, 135\)/.test(html) && /将友方大本营的兵力设为135/.test(html) && /将友方大本营的兵力设为135/.test(builderHtml) && !/兵力设为70/.test(html));
console.log('卡牌离开卡组的统一点名通报 =>', /function logDeckDeparture\(team, cardIds, reason\)/.test(html) && (html.match(/logDeckDeparture\(/g) || []).length >= 4 && /logDeckDeparture\(round, pool\.splice\(0, 7\)/.test(html) && /logDeckDeparture\(round, pool\.shift\(\)/.test(html) && !/弃掉卡组顶一张牌', 'meta'/.test(html));
console.log('观战绝不参与本地对局流程 =>', (html.match(/if \(isWatch\) return;/g) || []).length >= 5 && /if \(isWatch\) return;   \/\/ 观战不参与任何本地对局流程/.test(html) && /mulliganQueue = null;\s*\n\s*mulliganActiveTeam = null;/.test(html));
console.log('监视 ≤10 费限制已同步(模板+被转化) =>', /选择一张花费不大于10的手牌（模板）/.test(html) && /选择一张花费不大于10的手牌（模板）/.test(builderHtml) && /const t1 = h.filter/.test(html) && /const t2 = h.filter/.test(html));
console.log('抵抗不可被转化 =>', /function canBeTransformed\(cid\) \{ return cid !== 'resist'; \}/.test(html) && (html.match(/canBeTransformed\(x\.cardId\)/g) || []).length === 2 && /「抵抗」不可被转化/.test(html) && /「抵抗」不可被转化/.test(builderHtml));

console.log('鼓舞 9K 已同步 =>', /name: '鼓舞', cost: 9/.test(html) && /name:'鼓舞', cost:9/.test(builderHtml) && !/name: '鼓舞', cost: 6/.test(html));
console.log('指挥点改为按领土补给 =>', /const CP_CELLS_PER_GAIN = 3/.test(html) && /const CP_GAIN = 2/.test(html) && /function territoryCp\(side\)/.test(html) && /setCp\(team, capped\)/.test(html) && !/setCp\(team, Math\.floor\(getSlot\(team\)\)\)/.test(html));
console.log('闪电袭击 2K/25 已同步 =>', /name: '闪电袭击', cost: 2/.test(html) && /对敌方大本营造成25伤害/.test(html) && /对敌方大本营造成25伤害/.test(builderHtml) && /大本营-25/.test(html));
console.log('激烈齐射/火炮打击在组卡器 =>', ["fierce_volley", "artillery_strike"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('启动脚本已改 chcp 936 =>', /chcp 936 >nul 2>&1/.test(batMain) && !/65001/.test(batMain));
console.log('抵抗体系三张卡就位 =>', /function triggerCardUsedHooks/.test(html) && /resistReformLock/.test(html) && /cardDef\.id === 'resist'/.test(html) && /e\.type === 'resist_reform'/.test(html) && /e\.type === 'resist_climax'/.test(html));
console.log('抵抗体系三张卡在组卡器 =>', ["liberation","resist_reform","resist_climax"].every(id => new RegExp(id + ":\\{ id:'" + id + "'").test(builderHtml)));
console.log('指挥点公式 = min(槽, max(领土, floor(轮数/2))) =>', /function roundFloorCp\(\) \{ return Math\.floor\(turnCounter \/ 2\); \}/.test(html) && /function supplyCp\(side\) \{ return Math\.max\(territoryCp\(side\), roundFloorCp\(\)\); \}/.test(html) && /Math\.min\(getSlot\(team\), supplyCp\(team\)\)/.test(html));
console.log('指令打中立格会占领 =>', /const wasNeutral = \(team\[idx\] === 'none'\)/.test(html) && /if \(attackerTeam && wasNeutral\) team\[idx\] = attackerTeam;/.test(html));
console.log('号召 词条+移除钩子就位 =>', /case 'call_to_arms'/.test(html) && /function removeCallToArms\(cellId, reason\)/.test(html) && (html.match(/removeCallToArms\(/g) || []).length >= 5);
console.log('号召 在组卡器且卡面一致 =>', /call_to_arms:\{ id:'call_to_arms'/.test(builderHtml) && /使一个友方格子获得：友方回合开始时获得\+5兵力/.test(html) && /使一个友方格子获得：友方回合开始时获得\+5兵力/.test(builderHtml));
console.log('清除类卡牌封死大本营 =>', /清除：目标不能是大本营/.test(html) && /激烈齐射：目标不能是大本营/.test(html) && /火炮打击：目标不能是大本营/.test(html) && /around3x3\(t\)\.filter\(\(id\) => !isHomeId\(id\)\)/.test(html) && /不会指向或波及大本营/.test(html) && /不能指向大本营/.test(builderHtml));
console.log('贪心 已加入且卡面一致（1+次数上限15、可打大本营但50%落空、副本构筑之外）=>', /id: 'greed', name: '贪心', cost: 1, type: '指令', level: '普通'/.test(html) && /greed:\{ id:'greed'/.test(builderHtml) && html.indexOf('本方此前使用「贪心」的次数，上限15') !== -1 && builderHtml.indexOf('本方此前使用「贪心」的次数，上限15') !== -1 && /每有10张牌/.test(html) && /每有10张牌/.test(builderHtml) && /若目标是大本营，有 50% 概率不造成伤害/.test(html) && /若目标是大本营，有 50% 概率不造成伤害/.test(builderHtml) && /const miss = isHomeId\(ctx\.target\) && Math\.random\(\) < 0\.5;/.test(html) && !/贪心：目标不能是大本营/.test(html) && /if \(cid === 'greed'\) return !greedCopied\[t\];/.test(html) && /let greedUses = \{ red: 0, blue: 0 \};/.test(html));
console.log('航运/足智多谋/后勤中枢 已加入且卡面一致 =>', ['shipping', 'resourceful', 'logi_hub'].every(id => new RegExp("id: '" + id + "'").test(html) && builderHtml.indexOf(id + ":{ id:'" + id + "'") !== -1) && /抽两张牌，并失去1个指挥点/.test(html) && /抽两张牌，并失去1个指挥点/.test(builderHtml) && /从卡组抽一张「增员」类指令/.test(html) && /从卡组抽一张「增员」类指令/.test(builderHtml) && /友方使用花费为0的卡牌时，抽一张牌/.test(html) && /友方使用花费为0的卡牌时，抽一张牌/.test(builderHtml) && !/dev_squad/.test(html) && !/dev_squad/.test(builderHtml));
console.log('大本营兵力上限 200 =>', /const MAX_HOME_FORCE = 200;/.test(html) && /function forceCapIdx\(idx\)/.test(html) && /function setForce\(idx, v\)/.test(html) && !/Math\.min\(99, force/.test(html));
console.log('向大本营移动花费 10 =>', /isHomeId\(toId\) \? 10 : 1/.test(html) && /向大本营移动需 10 点/.test(html));
console.log('存档码支持 200 且兼容旧格式 =>', /code\.length === 401 \? 4 : \(code\.length === 301 \? 3 : 0\)/.test(html) && /padStart\(3, '0'\)/.test(html));
console.log('初始大本营 12(红)/89(蓝) 各 9 格 =>', /setCell\(RED_HOME, 'red', 100\)/.test(html) && /setCell\(BLUE_HOME, 'blue', 100\)/.test(html) && /\[3, 13, 21, 22, 23\]/.test(html) && /\[98, 88, 80, 79, 78\]/.test(html));
console.log('联合进攻 80 / 联邦国家（≥150 打 100）=>', /对一个敌方大本营造成80伤害/.test(html) && /applyForceDelta\(ctx\.target, -80, round\)/.test(html) && /若友方大本营兵力不低于150，对敌方大本营造成100伤害/.test(html) && /force\[ownHome - 1\] >= 150/.test(html) && /applyForceDelta\(enemyHome, -100, round\)/.test(html) && /造成80伤害/.test(builderHtml) && /不低于150，对敌方大本营造成100伤害/.test(builderHtml));
console.log('多房间路由（server.js）=>', /const rooms = new Map\(\)/.test(serverJs) && /function roomIdFromUrl/.test(serverJs) && /const PAGE_RE =/.test(serverJs) && /'\/ws\/' \+ roomId/.test(serverJs) === false && /rooms\.delete\(roomId\)/.test(serverJs));
console.log('客户端 /host|<房间号> 解析 =>', /const ROOM = \(function \(\) \{/.test(html) && /const NET_HOST = \(function \(\) \{/.test(html) && /new WebSocket\(NET_PROTO \+ NET_HOST \+ '\/ws\/' \+ ROOM \+ '\?want=' \+ WANT\)/.test(html) && !/location\.hostname \+ ':3000'/.test(html));
console.log('页面可托管在别的域名(WS 指回部署主机) =>', /const DEPLOY_HOST = 'mjq2-pvp\.app\.workbuddy\.host'/.test(html) && /const q = new URLSearchParams\(location\.search\)\.get\('ws'\)/.test(html) && /LOCAL_HOST_RE\.test\(NET_HOST\) \? 'ws:\/\/' : 'wss:\/\/'/.test(html));
console.log('主页 home.html 就绪（3 按钮 + 房间输入框）=>', fs.existsSync('home.html') && (() => { const h = fs.readFileSync('home.html', 'utf8'); return /id="roomInput"/.test(h) && /\/doc/.test(h) && /deck_builder\.html/.test(h) && /\/play\//.test(h) && (h.match(/class="link-btn/g) || []).length >= 3; })());
console.log('文档渲染页 doc.html 就绪（自带 markdown 渲染）=>', fs.existsSync('doc.html') && /function renderMarkdown/.test(fs.readFileSync('doc.html', 'utf8')) && /项目详细说明文档\.md/.test(fs.readFileSync('doc.html', 'utf8')));
console.log('server.js 支持观战席（spectators）=>', /spectators: new Set\(\)/.test(serverJs) && /function pickRole\(room, want\)/.test(serverJs) && /function wantFromUrl\(url\)/.test(serverJs) && /MAX_SPECTATORS/.test(serverJs) && /msg\.sw/.test(serverJs));
console.log('server.js 新路由（主页/文档/自动分房）=>', /\/home'/.test(serverJs) && /sendFile\(res, 'home\.html'/.test(serverJs) && /sendFile\(res, 'doc\.html'/.test(serverJs) && /play\|room\|host\|join\|watch/.test(serverJs));
console.log('客户端支持 /play 自动分房与观战 =>', /const WANT = /.test(html) && /let isWatch = MODE === 'watch';/.test(html) && /function applyRole\(role, note\)/.test(html) && /function enterSpectatorMode\(note\)/.test(html) && /\?want=' \+ WANT/.test(html));
console.log('观战拿到完整状态（双方手牌/反制/全量战报）=>', /function buildStatePayload\(full\)/.test(html) && /redHand: full \? redHand\.map/.test(html) && /redReaction: full \? redReaction\.map/.test(html) && /log: full \? gameLog\.map/.test(html) && /if \(hasSpectators\) payload\.sw = buildStatePayload\(true\);/.test(html));
console.log('观战只读（无操作入口）=>', /if \(gameOver \|\| isWatch\) return;/.test(html) && /if \(isWatch\) return;\s+\/\/ 观战只读/.test(html) && /body\.spectating \.btn-row \{ display: none; \}/.test(html) && /function renderSpectatorHands\(zone\)/.test(html));
console.log('package.json 有 start 脚本 =>', /"start":\s*"node server\.js"/.test(packageJson) && /"main":\s*"server\.js"/.test(packageJson));
console.log('启动脚本指向主页 / 自动分房 / 观战 =>', /主页\(推荐入口\)/.test(batMain) && /\/play\/1/.test(batMain) && /观战/.test(batMain) && /\/doc/.test(batMain) && /房间号/.test(batMain));

// ===== 语言系统（表情快捷语句）=====
// 注意：btn-row 内 btnNext 之前可能插入其它按钮（如 #btnCancelTarget），故用宽松匹配
console.log('语言系统：下拉框在「下一回合」按钮上方 =>', /<div class="emote-bar">[\s\S]{0,400}?<div class="btn-row">[\s\S]{0,300}?<button class="btn btn-next" id="btnNext"/.test(html) && /id="emoteSelect"/.test(html));
console.log('语言系统：8 条固定语句齐全 =>', ['向你问好，我的朋友','开始战斗吧','好痛','诶哟','那是个错误','你在打什么主意','轮到我了吗','感谢带来这场比赛'].every(t => html.indexOf(t) !== -1) && /const EMOTE_LINES = \[/.test(html));
console.log('语言系统：红左蓝右飘向中间（keyframes）=>', /@keyframes emoteInLeft/.test(html) && /@keyframes emoteInRight/.test(html) && /\.emote-float\.red  \{ color: #ff6b6b;/.test(html) && /\.emote-float\.blue \{ color: #6bb6ff;/.test(html) && /translate\(-18vw, -50%\)/.test(html) && /translate\(18vw, -50%\)/.test(html));
console.log('语言系统：飘字不溢出屏幕（起点±60vw、终点±18vw，均在视口内）=>', /translate\(-60vw, -50%\) scale\(0\.35\)/.test(html) && /translate\(60vw, -50%\) scale\(0\.35\)/.test(html) && !/translate\(-9vw/.test(html) && !/translate\(9vw/.test(html));
console.log('语言系统：飘字层固定且 z-index 低于弹窗（不遮挡调度/卡组弹窗）=>', (() => { const m = html.match(/\.emote-layer \{([\s\S]*?)\}/); if (!m) return false; const r = m[1]; const z = parseInt((r.match(/z-index:\s*(\d+)/) || [])[1], 10); const modalZ = parseInt((html.match(/\.deck-modal \{[\s\S]*?z-index:\s*(\d+)/) || [])[1], 10); const vicZ = parseInt((html.match(/\.victory-overlay \{[\s\S]*?z-index:\s*(\d+)/) || [])[1], 10); return /position:\s*fixed/.test(r) && /overflow:\s*hidden/.test(r) && z < modalZ && z < vicZ; })());
console.log('语言系统：飘字 position:absolute + 居中锚点（不随滚动/不溢出）=>', /\.emote-float \{[\s\S]*?position: absolute;[\s\S]*?left: 50%;/.test(html));
console.log('语言系统：放大+渐变消失 =>', /scale\(1\.35\)/.test(html) && /scale\(0\.35\)/.test(html) && /100% \{ opacity: 0;/.test(html));
console.log('语言系统：不遮挡点击(pointer-events:none，层+单条双保险) =>', /\.emote-layer \{[^}]*pointer-events: none/.test(html) && /\.emote-float \{[\s\S]*?pointer-events: none;/.test(html));
console.log('语言系统：CD 8 秒 + 冷却期间下拉置灰 =>', /const EMOTE_CD_MS = 8 \* 1000;/.test(html) && /sel\.disabled = true;/.test(html) && /表情冷却中，还需/.test(html));
console.log('语言系统：三端（本地/房主/蓝方）都能发送 =>', /const side = MODE === 'local' \? round : \(isHost \? 'red' : 'blue'\);/.test(html) && /sendCardCmd\(\{ type: 'emote', index: idx \}\)/.test(html) && /cmd\.type === 'emote'/.test(html) && /showEmote\(cmd\.index, 'blue'\)/.test(html));
console.log('语言系统：观战者也能看到表情 =>', /sendEmoteToPeers\('blue', cmd\.index\)/.test(html) && /msg\.type === 'emote'/.test(html) && /if \(isJoin \|\| isWatch\) showEmote\(msg\.index, msg\.side\)/.test(html));
console.log('语言系统：观战置灰 + 重开重置 =>', /body\.spectating \.emote-bar \{ display: none; \}/.test(html) && /function resetEmote\(\)/.test(html) && /resetEmote\(\);         \/\/ 重开/.test(html) && /initEmoteOptions\(\);/.test(html));
console.log('语言系统：server.js 转发 emote 广播 =>', /msg\.type === 'emote'/.test(serverJs) && /send\(room\.blue, \{ type: 'emote', side: msg\.side, index: msg\.index \}\)/.test(serverJs) && /send\(sp, \{ type: 'emote', side: msg\.side, index: msg\.index \}\)/.test(serverJs));

// ===== 取消按钮（2026-10-12 第十七批）：取消指令的目标选择 =====
console.log('取消按钮：Markup + 处理器就位 =>', /id="btnCancelTarget"/.test(html) && /onclick="onBtnCancelTarget\(\)"/.test(html) && /disabled/.test(html) && /function onBtnCancelTarget\(\)/.test(html) && /function cancelTargetSelection\(\)/.test(html) && /function updateCancelTargetBtn\(\)/.test(html) && /function isTargeting\(\)/.test(html));
console.log('取消按钮：平时置灰、选目标后亮起（渲染点全覆盖）=>', (html.match(/updateCancelTargetBtn\(\)/g) || []).length >= 5 && /b\.disabled = !on;/.test(html) && /if \(cardTargetMode\) return true;/.test(html));
console.log('取消按钮：蓝方取消经 cmd 通知房主 =>', /sendCardCmd\(\{ type: 'cancelTarget' \}\)/.test(html) && /cmd\.type === 'cancelTarget'/.test(html) && /pendingBlueTarget = null;\s*\n\s*cardTargetMode = null;/.test(html));
console.log('取消按钮：空中优势行列选择复用 cancelRowCol =>', /if \(cardTargetMode && cardTargetMode\.rowcol\) \{ cancelRowCol\(\); return true; \}/.test(html));
console.log('取消按钮：观战隐藏 =>', /body\.spectating #btnCancelTarget \{ display: none; \}/.test(html) && /if \(isWatch\) return false;/.test(html));

// ============================================================
// 跨域托管行为验证（2026-10-05）：
// 页面若被托管在自定义域名（如 mjq.888.moe 的静态托管）下，
// WebSocket 必须自动指回已部署的主机；本地/平台部署则保持同源。
// ============================================================
function netHostProbe(loc, label) {
  const sb = Object.assign({}, sandbox);
  sb.location = loc;
  sb.globalThis = sb;
  let captured = null;
  sb.WebSocket = function (url) { captured = url; this.readyState = 3; };
  try {
    vm.createContext(sb);
    // let 声明不是沙箱属性，必须在同一个脚本作用域里读出来
    const roleProbe = '\n;globalThis.__probeRole = (typeof isWatch !== "undefined" && isWatch) ? "watch"' +
      ' : ((typeof isHost !== "undefined" && isHost) ? "host"' +
      ' : ((typeof isJoin !== "undefined" && isJoin) ? "join" : "local"))' +
      ';globalThis.__probeWant = (typeof WANT !== "undefined") ? WANT : "?";' +
      ';globalThis.__probeRoom = (typeof ROOM !== "undefined") ? ROOM : "?";\n';
    new vm.Script(code + roleProbe, { filename: 'probe-' + label }).runInContext(sb);
  } catch (e) {
    console.log('[probe] ' + label + ' => 运行异常: ' + e.message);
    return;
  }
  console.log('[probe] ' + label + ' => ' + captured +
    '   [WANT=' + sb.__probeWant + ' ROOM=' + sb.__probeRoom + ' 初始 MODE=' + sb.__probeRole + ']');
}
netHostProbe({ search: '', pathname: '/host/1', hostname: 'mjq.888.moe', protocol: 'https:', host: 'mjq.888.moe' }, '自定义域名(https) /host/1（应 wss://部署主机/ws/1?want=host）');
netHostProbe({ search: '', pathname: '/join/1', hostname: 'localhost', protocol: 'http:', host: 'localhost:3000' }, '本地脚本(http) /join/1（应 ws://localhost:3000/ws/1?want=join）');
netHostProbe({ search: '', pathname: '/play/1', hostname: 'mjq2-pvp.app.workbuddy.host', protocol: 'https:', host: 'mjq2-pvp.app.workbuddy.host' }, '主页按钮(https) /play/1（应同源 wss + want=auto）');
netHostProbe({ search: '', pathname: '/watch/abc', hostname: 'mjq2-pvp.app.workbuddy.host', protocol: 'https:', host: 'mjq2-pvp.app.workbuddy.host' }, '观战链接(https) /watch/abc（应同源 wss + want=watch）');
netHostProbe({ search: '?ws=example.com:9000', pathname: '/host/1', hostname: 'mjq.888.moe', protocol: 'https:', host: 'mjq.888.moe' }, '?ws= 手动指定（应 wss://example.com:9000/ws/1）');
