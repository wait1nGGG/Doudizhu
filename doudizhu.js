(function() {
'use strict';

// ==================== CONSTANTS ====================
const RANK_NAME = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小',17:'大'};
const SUIT_SYM = {spade:'♠',heart:'♥',club:'♣',diamond:'♦'};
const SUIT_COLOR = {spade:'black',heart:'red',club:'black',diamond:'red'};
const SUITS = ['spade','heart','club','diamond'];
const PHASE = { DEALING:'dealing', BIDDING:'bidding', PALM_BACK:'palm_back', RPS:'rps', PLAYING:'playing', FINISHED:'finished' };
const NAMES = ['你', '电脑A', '电脑B'];

// 牌面牌总数（用于记牌器）
const TOTAL_BY_RANK = {};
for (let v = 3; v <= 15; v++) TOTAL_BY_RANK[v] = 4;
TOTAL_BY_RANK[16] = 1;   // 小王
TOTAL_BY_RANK[17] = 1;   // 大王
const ALL_RANKS = Object.keys(TOTAL_BY_RANK).map(Number).sort((a, b) => a - b);

// ==================== CARD UTILS ====================
function createCard(suit, value) {
  const id = suit ? `${suit}_${value}` : `joker_${value}`;
  const displayRank = RANK_NAME[value];
  const displaySuit = suit ? SUIT_SYM[suit] : '';
  const color = suit ? SUIT_COLOR[suit] : (value === 17 ? 'red' : 'black');
  const isJoker = value >= 16;
  return { id, suit: suit || null, value, displayRank, displaySuit, color, isJoker };
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let v = 3; v <= 15; v++) deck.push(createCard(suit, v));
  }
  deck.push(createCard(null, 16));
  deck.push(createCard(null, 17));
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 造一张"重复牌"的王（用于全王炸开局，id 唯一避免同值互删）
function mkJoker(value, uid) {
  return { id: `joker_${value}_${uid}`, suit: null, value,
    displayRank: value === 16 ? '小' : '大', displaySuit: '',
    color: value === 17 ? 'red' : 'black', isJoker: true };
}

// ==================== COMBINATION DETECTION ====================
function detectCombination(cards) {
  if (!cards || cards.length === 0) return null;
  const n = cards.length;
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const values = sorted.map(c => c.value);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const uniqueRanks = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const rankCountEntries = uniqueRanks.map(r => [r, counts[r]]);

  // 王炸
  if (n === 2 && values[0] === 16 && values[1] === 17) return { type: 'rocket', mainRank: 17, length: 1 };
  // 炸弹
  if (n === 4 && uniqueRanks.length === 1 && counts[uniqueRanks[0]] === 4) return { type: 'bomb', mainRank: uniqueRanks[0], length: 1 };
  // 四带二单
  if (n === 6) {
    if (uniqueRanks.filter(r => counts[r] >= 4).length === 1) return { type: 'four_plus_two_singles', mainRank: uniqueRanks.find(r => counts[r] >= 4), length: 1 };
  }
  // 四带两对
  if (n === 8) {
    const qr = uniqueRanks.filter(r => counts[r] >= 4);
    if (qr.length === 1) {
      const taken = { [qr[0]]: 4 };
      const remCounts = {};
      for (const v of values) { if (v === qr[0] && taken[qr[0]] > 0) { taken[qr[0]]--; continue; } remCounts[v] = (remCounts[v] || 0) + 1; }
      const ru = Object.keys(remCounts).map(Number);
      if (ru.length === 2 && remCounts[ru[0]] === 2 && remCounts[ru[1]] === 2) return { type: 'four_plus_two_pairs', mainRank: qr[0], length: 1 };
    }
  }
  // 三带一
  if (n === 4 && uniqueRanks.length === 2) {
    const tr = uniqueRanks.find(r => counts[r] === 3);
    if (tr) return { type: 'three_plus_one', mainRank: tr, length: 1 };
  }
  // 三带二
  if (n === 5 && uniqueRanks.length === 2) {
    const tr = uniqueRanks.find(r => counts[r] === 3);
    const pr = uniqueRanks.find(r => counts[r] === 2);
    if (tr && pr) return { type: 'three_plus_two', mainRank: tr, length: 1 };
  }
  // 三张
  if (n === 3 && uniqueRanks.length === 1 && counts[uniqueRanks[0]] === 3) return { type: 'three', mainRank: uniqueRanks[0], length: 1 };
  // 对子
  if (n === 2 && uniqueRanks.length === 1 && counts[uniqueRanks[0]] === 2) return { type: 'pair', mainRank: uniqueRanks[0], length: 1 };
  // 单张
  if (n === 1) return { type: 'single', mainRank: values[0], length: 1 };
  // 顺子
  if (n >= 5 && uniqueRanks.length === n && uniqueRanks.every(r => r <= 14) && uniqueRanks[n-1] - uniqueRanks[0] === n - 1) {
    return { type: 'straight', mainRank: uniqueRanks[n-1], length: n };
  }
  // 连对
  if (n >= 6 && n % 2 === 0) {
    const pc = n / 2;
    if (uniqueRanks.length === pc && uniqueRanks.every(r => r <= 14 && counts[r] === 2) && uniqueRanks[pc-1] - uniqueRanks[0] === pc - 1) {
      return { type: 'straight_pairs', mainRank: uniqueRanks[pc-1], length: pc };
    }
  }
  // 飞机相关
  const tripleRanks = uniqueRanks.filter(r => counts[r] >= 3 && r <= 14);
  const groups = [];
  let grp = [];
  for (const r of tripleRanks) { if (grp.length === 0 || r === grp[grp.length-1] + 1) grp.push(r); else { if (grp.length >= 2) groups.push([...grp]); grp = [r]; } }
  if (grp.length >= 2) groups.push([...grp]);
  for (const g of groups) {
    for (let len = g.length; len >= 2; len--) {
      for (let s = 0; s <= g.length - len; s++) {
        const planeRanks = g.slice(s, s + len);
        const planeMin = len * 3;
        let planeCards = 0; const nonPlane = [];
        for (const v of values) { if (planeRanks.includes(v) && planeCards < planeMin) planeCards++; else nonPlane.push(v); }
        if (planeCards < planeMin) continue;
        if (nonPlane.length === 0) return { type: 'plane', mainRank: planeRanks[planeRanks.length-1], length: len };
        if (nonPlane.length === len) return { type: 'plane_plus_singles', mainRank: planeRanks[planeRanks.length-1], length: len };
        if (nonPlane.length === 2 * len) {
          const rc = {}; for (const v of nonPlane) rc[v] = (rc[v] || 0) + 1;
          if (Object.values(rc).every(c => c === 2)) return { type: 'plane_plus_pairs', mainRank: planeRanks[planeRanks.length-1], length: len };
        }
      }
    }
  }
  return null;
}

function canBeat(newPlay, lastPlay) {
  if (!lastPlay) return true;
  if (newPlay.type === 'rocket') return true;
  if (lastPlay.type === 'rocket') return false;
  if (newPlay.type === 'bomb') { if (lastPlay.type !== 'bomb') return true; return newPlay.mainRank > lastPlay.mainRank; }
  if (lastPlay.type === 'bomb') return false;
  const isPlane = t => t === 'plane' || t === 'plane_plus_singles' || t === 'plane_plus_pairs';
  const isThreePlus = t => t === 'three_plus_one' || t === 'three_plus_two';
  if (isPlane(newPlay.type) && isThreePlus(lastPlay.type)) return true;
  if (newPlay.type === lastPlay.type && newPlay.length === lastPlay.length) return newPlay.mainRank > lastPlay.mainRank;
  return false;
}

// ==================== COMBO ENUMERATION ====================
function generateCombos(hand) {
  const combos = [];
  const counts = {};
  for (const c of hand) counts[c.value] = (counts[c.value] || 0) + 1;
  const ranks = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const byRank = {};
  for (const c of hand) { if (!byRank[c.value]) byRank[c.value] = []; byRank[c.value].push(c); }

  function push(type, mainRank, length, cards) { if (cards && cards.length) combos.push({ type, mainRank, length, cards }); }

  // 单/对/三/炸
  for (const r of ranks) {
    if (counts[r] >= 1) push('single', r, 1, byRank[r].slice(0, 1));
    if (counts[r] >= 2) push('pair', r, 1, byRank[r].slice(0, 2));
    if (counts[r] >= 3) push('three', r, 1, byRank[r].slice(0, 3));
    if (counts[r] === 4) push('bomb', r, 1, byRank[r].slice(0, 4));
  }
  // 王炸
  if (counts[16] >= 1 && counts[17] >= 1) push('rocket', 17, 1, [byRank[16][0], byRank[17][0]]);

  // 三带一 / 三带二
  for (const r of ranks) {
    if (counts[r] >= 3) {
      const tri = byRank[r].slice(0, 3);
      for (const r2 of ranks) {
        if (r2 === r && counts[r] < 4) continue;
        const skip = (r2 === r) ? 3 : 0;
        if (byRank[r2].length > skip) push('three_plus_one', r, 1, [...tri, byRank[r2][skip]]);
        if (r2 !== r && counts[r2] >= 2) push('three_plus_two', r, 1, [...tri, ...byRank[r2].slice(0, 2)]);
      }
    }
  }
  // 四带二单 / 四带两对
  for (const r of ranks) {
    if (counts[r] === 4) {
      const quad = byRank[r].slice(0, 4);
      const others = [];
      for (const r2 of ranks) { const st = (r2 === r) ? 4 : 0; for (let i = st; i < byRank[r2].length && others.length < 2; i++) others.push(byRank[r2][i]); }
      if (others.length >= 2) push('four_plus_two_singles', r, 1, [...quad, others[0], others[1]]);
      const pairRanks = ranks.filter(r2 => r2 !== r && counts[r2] >= 2);
      if (pairRanks.length >= 2) push('four_plus_two_pairs', r, 1, [...quad, ...byRank[pairRanks[0]].slice(0, 2), ...byRank[pairRanks[1]].slice(0, 2)]);
    }
  }
  // 顺子
  for (let st = 3; st <= 10; st++) {
    for (let len = 5; len <= 14 - st + 1; len++) {
      let ok = true;
      for (let i = st; i < st + len; i++) if (!counts[i] || counts[i] < 1) { ok = false; break; }
      if (ok) { const cards = []; for (let i = st; i < st + len; i++) cards.push(byRank[i][0]); push('straight', st + len - 1, len, cards); }
    }
  }
  // 连对
  for (let st = 3; st <= 12; st++) {
    for (let len = 3; len <= 14 - st + 1; len++) {
      let ok = true;
      for (let i = st; i < st + len; i++) if (!counts[i] || counts[i] < 2) { ok = false; break; }
      if (ok) { const cards = []; for (let i = st; i < st + len; i++) cards.push(...byRank[i].slice(0, 2)); push('straight_pairs', st + len - 1, len, cards); }
    }
  }
  // 飞机（纯 / 带单 / 带对）
  const tripleRanks = ranks.filter(r => counts[r] >= 3 && r <= 14);
  const groups = []; let g2 = [];
  for (const r of tripleRanks) { if (g2.length === 0 || r === g2[g2.length-1] + 1) g2.push(r); else { if (g2.length >= 2) groups.push([...g2]); g2 = [r]; } }
  if (g2.length >= 2) groups.push([...g2]);
  for (const grp2 of groups) {
    for (let len = grp2.length; len >= 2; len--) {
      for (let s = 0; s <= grp2.length - len; s++) {
        const planeRanks = grp2.slice(s, s + len);
        const triCards = []; for (const r of planeRanks) triCards.push(...byRank[r].slice(0, 3));
        push('plane', planeRanks[planeRanks.length-1], len, [...triCards]);
        const usedRanks = new Set(planeRanks);
        const singles = [];
        for (const r of ranks) { const skip = usedRanks.has(r) ? 3 : 0; for (let i = skip; i < byRank[r].length && singles.length < len; i++) singles.push(byRank[r][i]); }
        if (singles.length === len) push('plane_plus_singles', planeRanks[planeRanks.length-1], len, [...triCards, ...singles]);
        const pairCands = ranks.filter(r => usedRanks.has(r) ? counts[r] >= 5 : counts[r] >= 2);
        if (pairCands.length >= len) {
          const pairs = []; for (let i = 0; i < len; i++) { const pr = pairCands[i]; const sti = usedRanks.has(pr) ? 3 : 0; pairs.push(...byRank[pr].slice(sti, sti + 2)); }
          push('plane_plus_pairs', planeRanks[planeRanks.length-1], len, [...triCards, ...pairs]);
        }
      }
    }
  }
  return combos;
}

function comboTypeName(combo) {
  const names = { single:'单张', pair:'对子', three:'三张', three_plus_one:'三带一', three_plus_two:'三带二',
    straight:'顺子', straight_pairs:'连对', plane:'飞机', plane_plus_singles:'飞机带单', plane_plus_pairs:'飞机带对',
    four_plus_two_singles:'四带二', four_plus_two_pairs:'四带两对', bomb:'炸弹', rocket:'王炸' };
  return names[combo.type] || combo.type;
}

// ==================== AI ENGINE（本地规则：评分 + 拆牌 + 策略栈 + 软采样 + 记牌） ====================
function rankCounts(hand) { const c = {}; for (const k of hand) c[k.value] = (c[k.value] || 0) + 1; return c; }
function cardsByRank(hand) { const m = {}; for (const k of hand) { if (!m[k.value]) m[k.value] = []; m[k.value].push(k); } return m; }

const TYPE_WEIGHT = { single:1, pair:1.4, three:1.9, three_plus_one:2.1, three_plus_two:2.2, straight:0.7, straight_pairs:1.1,
  plane:1.6, plane_plus_singles:1.8, plane_plus_pairs:1.9, four_plus_two_singles:2.4, four_plus_two_pairs:2.6, bomb:1000, rocket:3000 };
function baseCost(combo) { return (combo.mainRank || 1) * (TYPE_WEIGHT[combo.type] || 1); }

// 拆散结构代价：抽走某些牌会把手里的对/三/炸弄碎
function structPenalty(selCards, hand) {
  const hc = rankCounts(hand); const used = {};
  for (const c of selCards) used[c.value] = (used[c.value] || 0) + 1;
  let pen = 0;
  for (const v in used) {
    const have = hc[v] || 0, u = used[v], remain = have - u;
    if (have >= 2 && remain === 1) pen += 2;
    if (have === 4 && remain >= 1 && remain <= 3) pen += 3;
    if (have === 3 && remain === 1) pen += 3;
    if (have === 3 && remain === 2) pen += 1;
  }
  return pen;
}

// 手牌拆解（贪心）：尽量按"整块"来算出手数，评估强弱
function decomposeHand(hand) {
  const combos = generateCombos(hand);
  const prio = t => (t === 'bomb' || t === 'rocket') ? 0 : (t === 'straight' || t === 'straight_pairs' || t === 'plane' || t === 'plane_plus_singles' || t === 'plane_plus_pairs') ? 1 : (t === 'three' || t === 'three_plus_one' || t === 'three_plus_two' ? 2 : 3);
  const sorted = [...combos].sort((a, b) => {
    const dp = prio(a.type) - prio(b.type);
    if (dp) return dp;
    return b.cards.length - a.cards.length || a.mainRank - b.mainRank;
  });
  const used = new Set(); const sel = [];
  for (const cb of sorted) {
    if (cb.cards.some(c => used.has(c.id))) continue;
    sel.push(cb); cb.cards.forEach(c => used.add(c.id));
  }
  return sel;
}

// 手牌强度（用于叫地主 / 判断牌力）
function handStrength(hand) {
  let pts = 0;
  for (const c of hand) {
    if (c.value === 17) pts += 8; else if (c.value === 16) pts += 5.5;
    else if (c.value === 15) pts += 3.5; else if (c.value === 14) pts += 1.3; else if (c.value === 13) pts += 0.4;
  }
  const cnt = rankCounts(hand);
  for (const v in cnt) { if (cnt[v] === 4) pts += 6; if (cnt[v] === 3 && v >= 14) pts += 1; }
  const handCount = decomposeHand(hand).length;
  pts += Math.max(0, (7 - handCount));
  if (cnt[16] && cnt[17]) pts += 2;
  return pts;
}

function aiShouldBid(hand) {
  const s = handStrength(hand);
  if (s >= 15) return true;
  if (s >= 10) return Math.random() < 0.5;
  return false;
}

// 玩家是否队友
function isTeammate(game, a, b) {
  if (game.landlord === null) return false;
  if (a === game.landlord || b === game.landlord) return a === b;
  return true;
}
// 最近威胁的对手（手牌最少的那家）
function nearestOpponent(game, idx) {
  let best = null, bc = Infinity;
  for (let p = 0; p < 3; p++) {
    if (p === idx || isTeammate(game, idx, p)) continue;
    if (game.hands[p].length < bc) { bc = game.hands[p].length; best = p; }
  }
  return best == null ? idx : best;
}

// 软概率采样：不总选最优（温度越高越容易"失误"）
function softChoose(scored, temp) {
  if (!scored.length) return null;
  const K = 5;
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, K);
  const max = Math.max(...top.map(x => x.score));
  const ws = top.map(x => Math.exp((x.score - max) / Math.max(temp || 0, 0.4)));
  const tot = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < top.length; i++) { r -= ws[i]; if (r <= 0) return top[i].combo; }
  return top[top.length - 1].combo;
}

function leadScore(combo, hand, game, idx) {
  let s = combo.cards.length * 2.0;
  s -= baseCost(combo);
  s -= structPenalty(combo.cards, hand);
  if (combo.type === 'single' && (rankCounts(hand)[combo.mainRank] || 0) === 1) s += 3;
  if (combo.mainRank >= 14 && hand.length > 7) s -= 5;
  if (combo.type === 'bomb' || combo.type === 'rocket') s -= 15;
  return s;
}

function aiLead(hand, idx, game) {
  const combos = generateCombos(hand);
  for (const c of combos) if (c.cards.length === hand.length) return c;
  const nonBomb = combos.filter(c => c.type !== 'bomb' && c.type !== 'rocket');
  const pool = nonBomb.length ? nonBomb : combos;
  return softChoose(pool.map(c => ({ combo: c, score: leadScore(c, hand, game, idx) })), game.aiTemp);
}

function followScore(combo, hand, lastPlay, game, idx) {
  let s = 26 - baseCost(combo) * 1.2;
  s -= structPenalty(combo.cards, hand);
  const opp = nearestOpponent(game, idx);
  const oppCount = game.hands[opp].length;
  const selfCount = hand.length;
  if (oppCount <= 3) s += 24;
  if (oppCount <= 5 && lastPlay.mainRank >= 14) s += 8;
  if (combo.type === 'bomb') s += (oppCount <= 6 && selfCount <= 6) ? 12 : -8;
  if (combo.type === 'single' && combo.mainRank >= 14 && lastPlay.mainRank <= 10) s -= 9;
  if (selfCount <= 4 && combo.cards.length === selfCount) s += 26;
  return s;
}

function aiFollow(hand, lastPlay, idx, game) {
  const lastBy = game.lastPlayedBy;
  if (lastBy !== idx && isTeammate(game, idx, lastBy) && hand.length > 4) return null; // 队友的让一让
  const cands = generateCombos(hand).filter(c => canBeat(c, lastPlay));
  if (!cands.length) return null;
  const opp = nearestOpponent(game, idx);
  const oppCount = game.hands[opp].length;
  const selfCount = hand.length;
  const scored = cands.map(c => ({ combo: c, score: followScore(c, hand, lastPlay, game, idx) }));
  let passScore = 0;
  if (oppCount <= 3) passScore -= 16;
  if (selfCount <= 4) passScore -= 20;
  scored.push({ combo: null, score: passScore });
  return softChoose(scored, game.aiTemp);
}

// 本地 AI 决策入口
function localAI(hand, leading, lastPlay, idx, game) {
  if (leading) return aiLead(hand, idx, game);
  return aiFollow(hand, lastPlay, idx, game);
}

// ==================== GAME CLASS ====================
class Game {
  constructor() {
    this.phase = PHASE.DEALING;
    this.hands = [[], [], []];
    this.bottomCards = [];
    this.landlord = null;
    this.currentPlayer = null;
    this.lastPlayedBy = null;
    this.lastPlay = null;
    this.lastPlayCards = [];
    this.passCount = 0;
    this.bids = [];
    this.bidResponses = [];
    this.winner = null;
    this.showAICards = false;
    this.rpsPlayers = [];
    this.rpsChoices = {};
    this.palmBackPlayers = [];
    this.palmBackChoices = {};
    this.rpsRound = 0;
    this.selectedCards = [];
    this.firstPlayDone = false;
    this.lastPlayByPlayer = [null, null, null];
    this._timeouts = [];
    this.playHistory = [];
    // 记牌器：已出的各牌数量
    this.playedByRank = {};
    for (const r of ALL_RANKS) this.playedByRank[r] = 0;
    // 复杂但不够聪明：温度越低越"聪明"，越高越容易失误
    this.aiTemp = 8;
  }

  _schedule(fn, ms) {
    const id = setTimeout(() => { this._timeouts = this._timeouts.filter(t => t !== id); fn(); }, ms);
    this._timeouts.push(id);
    return id;
  }
  _clearTimeouts() { for (const id of this._timeouts) clearTimeout(id); this._timeouts = []; }

  startNewGame() {
    this._clearTimeouts();
    this.phase = PHASE.DEALING;
    this.hands = [[], [], []];
    this.bottomCards = [];
    this.landlord = null;
    this.currentPlayer = null;
    this.lastPlayedBy = null;
    this.lastPlay = null;
    this.lastPlayCards = [];
    this.passCount = 0;
    this.bids = [];
    this.bidResponses = [];
    this.winner = null;
    this.rpsPlayers = [];
    this.rpsChoices = {};
    this.palmBackPlayers = [];
    this.palmBackChoices = {};
    this.rpsRound = 0;
    this.selectedCards = [];
    this.firstPlayDone = false;
    this.lastPlayByPlayer = [null, null, null];
    this.playHistory = [];
    this.playedByRank = {};
    for (const r of ALL_RANKS) this.playedByRank[r] = 0;

    const deck = shuffle(createDeck());
    for (let i = 0; i < 51; i++) this.hands[i % 3].push(deck[i]);
    this.bottomCards = [deck[51], deck[52], deck[53]];
    for (let i = 0; i < 3; i++) this.hands[i].sort((a, b) => b.value - a.value);

    this.phase = PHASE.BIDDING;
    renderAll(this);
    updateUI(this);
    updateStatus(this, '请选择是否抢地主');
    this._processBidding();
  }

  // OP：固定刷出特殊牌型的一局，玩家当地主先手
  startOPGame(mode) {
    this._clearTimeouts();
    this.phase = PHASE.DEALING;
    this.hands = [[], [], []];
    this.bottomCards = [];
    this.landlord = null;
    this.currentPlayer = null;
    this.lastPlayedBy = null;
    this.lastPlay = null;
    this.lastPlayCards = [];
    this.passCount = 0;
    this.bids = [];
    this.bidResponses = [];
    this.winner = null;
    this.rpsPlayers = [];
    this.rpsChoices = {};
    this.palmBackPlayers = [];
    this.palmBackChoices = {};
    this.rpsRound = 0;
    this.selectedCards = [];
    this.firstPlayDone = false;
    this.lastPlayByPlayer = [null, null, null];
    this.playHistory = [];
    this.playedByRank = {};
    for (const r of ALL_RANKS) this.playedByRank[r] = 0;

    // ---- 整手枪型：五炸 / 全王炸（一手20张即为整个地主手牌）----
    if (mode === 'bomb5' || mode === 'rockets') {
      if (mode === 'bomb5') {
        const ranks = [3, 5, 7, 9, 11];
        this.hands[0] = [];
        for (const r of ranks) for (const s of SUITS) this.hands[0].push(createCard(s, r));
      } else {
        this.hands[0] = [];
        for (let i = 0; i < 10; i++) {
          this.hands[0].push(mkJoker(16, i));          // 10 张小王
          this.hands[0].push(mkJoker(17, 10 + i));      // 10 张大王
        }
      }
      this.hands[0].sort((a, b) => b.value - a.value);
      this.bottomCards = this.hands[0].slice(0, 3);
      // 电脑：从一副真牌里取（排除与玩家重复的id）
      let d = shuffle(createDeck());
      const pIds = new Set(this.hands[0].map(c => c.id));
      d = d.filter(c => !pIds.has(c.id));
      this.hands[1] = d.slice(0, 17);
      this.hands[2] = d.slice(17, 34);

      this.landlord = 0;
      this.phase = PHASE.PLAYING;
      this.currentPlayer = 0;
      this.lastPlay = null;
      this.lastPlayedBy = null;
      this.passCount = 0;
      this.selectedCards = [];
      const flabel = mode === 'bomb5' ? '五炸' : '全王炸';
      updateStatus(this, `OP：固定「${flabel}」！你是地主，请出牌`);
      renderAll(this);
      updateUI(this);
      return;
    }

    // 构造固定特殊牌型
    let deck = createDeck();
    const special = [];
    if (mode === 'bomb') {
      const rank = 8 + Math.floor(Math.random() * 7); // 8..14，够大的炸弹
      for (const s of SUITS) special.push(createCard(s, rank));
    } else if (mode === 'plane') {
      const r = 6 + Math.floor(Math.random() * 6); // 6..11，保证 r+1<=12<=14
      for (const rk of [r, r + 1]) {
        for (const s of SUITS) {
          special.push(createCard(s, rk));
          if (special.filter(c => c.value === rk).length >= 3) break; // 每排正好3张
        }
      }
      // 飞机 = 2 个连续三张
    } else if (mode === 'rocket') {
      special.push(createCard(null, 16), createCard(null, 17));
    }
    const spIds = new Set(special.map(c => c.id));
    deck = deck.filter(c => !spIds.has(c.id));
    deck = shuffle(deck);

    // 玩家：特殊牌 + 补齐到17张
    const take = 17 - special.length;
    const humanHand = special.concat(deck.slice(0, take));
    deck = deck.slice(take);
    const bottom = deck.slice(0, 3); // 玩家当地主拿底牌
    deck = deck.slice(3);
    this.hands[1] = deck.slice(0, 17);
    deck = deck.slice(17);
    this.hands[2] = deck.slice(0, 17);
    this.hands[0] = humanHand.concat(bottom);
    this.bottomCards = bottom;
    for (let i = 0; i < 3; i++) this.hands[i].sort((a, b) => b.value - a.value);

    this.landlord = 0;
    this.phase = PHASE.PLAYING;
    this.currentPlayer = 0;
    this.lastPlay = null;
    this.lastPlayedBy = null;
    this.passCount = 0;
    this.selectedCards = [];

    const label = mode === 'bomb' ? '炸弹' : mode === 'plane' ? '飞机' : '王炸';
    updateStatus(this, `OP：固定「${label}」！你是地主，请出牌`);
    renderAll(this);
    updateUI(this);
  }

  _processBidding() {
    for (let i = 1; i <= 2; i++) {
      this._schedule(() => {
        const bid = aiShouldBid(this.hands[i]);
        this.bidResponses.push({ playerIdx: i, bid });
        updateStatus(this, `电脑${i === 1 ? 'A' : 'B'} ${bid ? '抢地主!' : '不抢'}`);
        renderAll(this);
        updateUI(this);
        this._checkBiddingDone();
      }, i * 1600);
    }
  }

  humanBid(bid) {
    if (this.phase !== PHASE.BIDDING) return;
    if (this.bidResponses.find(r => r.playerIdx === 0)) return;
    this.bidResponses.push({ playerIdx: 0, bid });
    this._checkBiddingDone();
  }

  _checkBiddingDone() {
    if (this.bidResponses.length < 3) return;
    this.bids = this.bidResponses.filter(r => r.bid).map(r => r.playerIdx);
    if (this.bids.length === 1) this._setLandlord(this.bids[0]);
    else if (this.bids.length === 2) this._startRPS(this.bids);
    else if (this.bids.length === 3) this._startPalmBack();
    else { updateStatus(this, '无人抢地主，重新发牌...'); this._schedule(() => this.startNewGame(), 2200); }
  }

  _setLandlord(playerIdx) {
    this.landlord = playerIdx;
    this.hands[playerIdx].push(...this.bottomCards);
    this.hands[playerIdx].sort((a, b) => b.value - a.value);
    this.phase = PHASE.PLAYING;
    this.currentPlayer = playerIdx;
    this.lastPlay = null;
    this.lastPlayedBy = null;
    this.passCount = 0;
    this.selectedCards = [];
    updateStatus(this, `${NAMES[playerIdx]} 是地主！`);
    renderAll(this);
    updateUI(this);
    if (playerIdx !== 0) this._schedule(() => this._aiTurn(), 1300);
  }

  _startPalmBack() {
    this.phase = PHASE.PALM_BACK;
    this.palmBackPlayers = [...this.bids];
    this.palmBackChoices = {};
    for (const p of this.palmBackPlayers) if (p !== 0) this.palmBackChoices[p] = Math.random() < 0.5 ? 'palm' : 'back';
    showPalmBackUI(this);
  }

  resolvePalmBack(humanChoice) {
    if (this.phase !== PHASE.PALM_BACK) return;
    this.palmBackChoices[0] = humanChoice;
    const emoji = { palm: '✋', back: '✊' };
    for (const p of this.palmBackPlayers) {
      const el = document.getElementById(`palm-choice-${p}`);
      if (el) { el.textContent = emoji[this.palmBackChoices[p]]; el.classList.add('pop-in'); }
    }
    document.getElementById('overlay-buttons').innerHTML = '';
    const players = this.palmBackPlayers;
    const choices = players.map(p => this.palmBackChoices[p]);
    if (choices[0] === choices[1] && choices[1] === choices[2]) {
      this.palmBackChoices = {};
      for (const p of players) if (p !== 0) this.palmBackChoices[p] = Math.random() < 0.5 ? 'palm' : 'back';
      updateStatus(this, '都一样！再来一次手心手背...');
      this._schedule(() => showPalmBackUI(this), 1500);
      return;
    }
    const countPalm = choices.filter(c => c === 'palm').length;
    const oddChoice = countPalm === 1 ? 'palm' : 'back';
    const eliminated = players[choices.indexOf(oddChoice)];
    const remaining = players.filter(p => p !== eliminated);
    for (const p of players) {
      const el = document.getElementById(`palm-choice-${p}`);
      if (el) { if (p === eliminated) el.classList.add('eliminated'); else el.classList.add('winner'); }
    }
    document.getElementById('overlay-info').textContent = `${NAMES[eliminated]} 被淘汰！`;
    this._schedule(() => { hideOverlay(); this._startRPS(remaining); }, 2500);
  }

  _startRPS(players) {
    this.phase = PHASE.RPS;
    this.rpsPlayers = players;
    this.rpsChoices = {};
    this.rpsRound = 0;
    for (const p of players) if (p !== 0) this.rpsChoices[p] = ['rock', 'scissors', 'paper'][Math.floor(Math.random() * 3)];
    showRPSUI(this);
  }

  resolveRPS(humanChoice) {
    if (this.phase !== PHASE.RPS) return;
    this.rpsChoices[0] = humanChoice;
    this.rpsRound++;
    const [p1, p2] = this.rpsPlayers;
    const c1 = this.rpsChoices[p1], c2 = this.rpsChoices[p2];
    const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    if (c1 === c2) {
      updateStatus(this, `${NAMES[p1]}：${rpsName(c1)}，${NAMES[p2]}：${rpsName(c2)} — 平局！`);
      if (this.rpsRound >= 5) {
        const winner = this.rpsPlayers[Math.random() < 0.5 ? 0 : 1];
        this._schedule(() => { hideOverlay(); this._setLandlord(winner); }, 1600);
        return;
      }
      this.rpsChoices = {};
      for (const p of this.rpsPlayers) if (p !== 0) this.rpsChoices[p] = ['rock', 'scissors', 'paper'][Math.floor(Math.random() * 3)];
      this._schedule(() => showRPSUI(this), 1500);
      return;
    }
    const winner = beats[c1] === c2 ? p1 : p2;
    updateStatus(this, `${NAMES[p1]}：${rpsName(c1)}，${NAMES[p2]}：${rpsName(c2)} — ${NAMES[winner]} 胜！`);
    showRPSResult(this, p1, p2, c1, c2, winner);
  }

  humanPlayCards(cards) {
    if (this.phase !== PHASE.PLAYING || this.currentPlayer !== 0) return;
    const combo = detectCombination(cards);
    if (!combo) { updateStatus(this, '无效的牌型，请重新选择'); return; }
    combo.cards = cards;
    const leading = (this.lastPlay === null || this.lastPlayedBy === 0);
    if (!leading && !canBeat(combo, this.lastPlay)) { updateStatus(this, '打不过，请重新选择或不出'); return; }
    this._executePlay(0, combo);
  }

  humanPass() {
    if (this.phase !== PHASE.PLAYING || this.currentPlayer !== 0) return;
    if (this.lastPlay === null || this.lastPlayedBy === 0) { updateStatus(this, '你是主动出牌方，必须出牌'); return; }
    this._executePass(0);
  }

  // 提示：给玩家推荐一手可出的
  applyHint() {
    if (this.phase !== PHASE.PLAYING || this.currentPlayer !== 0) return;
    const hand = this.hands[0];
    const leading = (this.lastPlay === null || this.lastPlayedBy === 0);
    let combo = null;
    if (leading) {
      const combos = generateCombos(hand);
      for (const c of combos) if (c.cards.length === hand.length) { combo = c; break; }
      if (!combo) {
        const pool = combos.filter(c => c.type !== 'bomb' && c.type !== 'rocket').length ? combos.filter(c => c.type !== 'bomb' && c.type !== 'rocket') : combos;
        let bs = -Infinity;
        for (const c of pool) { const s = leadScore(c, hand, this, 0); if (s > bs) { bs = s; combo = c; } }
      }
    } else {
      const cands = generateCombos(hand).filter(c => canBeat(c, this.lastPlay));
      if (cands.length) cands.sort((a, b) => baseCost(a) - baseCost(b));
      combo = cands[0] || null;
    }
    if (!combo) { updateStatus(this, '无有效出牌，只能不出'); return; }
    this.selectedCards = combo.cards.map(c => hand.find(x => x.id === c.id)).sort((a, b) => a.value - b.value);
    renderPlayerCards(this, 0);
    updateUI(this);
    updateStatus(this, `提示：${comboTypeName(combo)}`);
  }

  _executePlay(playerIdx, combo) {
    this.firstPlayDone = true;
    const cardIds = new Set(combo.cards.map(c => c.id));
    this.hands[playerIdx] = this.hands[playerIdx].filter(c => !cardIds.has(c.id));
    // 记牌器：记录已出
    for (const c of combo.cards) if (this.playedByRank[c.value] != null) this.playedByRank[c.value]++;
    // 特殊牌型动效
    const t = combo.type;
    if (t === 'bomb' || t === 'rocket' || t === 'plane' || t === 'plane_plus_singles' || t === 'plane_plus_pairs') {
      triggerFX(t === 'plane' || t === 'plane_plus_singles' || t === 'plane_plus_pairs' ? 'plane' : t);
    }

    this.lastPlay = combo;
    this.lastPlayCards = combo.cards;
    this.lastPlayedBy = playerIdx;
    this.passCount = 0;
    this.selectedCards = [];
    this.lastPlayByPlayer[playerIdx] = combo.cards;
    this.playHistory.push({ playerIdx, playerName: NAMES[playerIdx], action: 'play', cards: combo.cards, comboType: comboTypeName(combo) });

    renderAll(this);
    renderPlayAreas(this, playerIdx);

    if (this.hands[playerIdx].length === 0) { this._endGame(playerIdx); return; }

    this.currentPlayer = (this.currentPlayer + 1) % 3;
    updateUI(this);
    updateStatus(this, `${NAMES[playerIdx]} 出了 ${comboTypeName(combo)}`);
    if (this.currentPlayer !== 0) this._schedule(() => this._aiTurn(), 1100);
  }

  _executePass(playerIdx) {
    this.passCount++;
    this.lastPlayByPlayer[playerIdx] = 'pass';
    this.playHistory.push({ playerIdx, playerName: NAMES[playerIdx], action: 'pass' });
    updateStatus(this, `${NAMES[playerIdx]} 不出`);
    if (this.passCount >= 2) {
      this.lastPlay = null;
      this.lastPlayCards = [];
      this.lastPlayedBy = null;
      this.passCount = 0;
      this.currentPlayer = (this.currentPlayer + 1) % 3;
      this.lastPlayByPlayer = [null, null, null];
      this.playHistory = [];
      updateStatus(this, `${NAMES[this.currentPlayer]} 重新出牌`);
    } else {
      this.currentPlayer = (this.currentPlayer + 1) % 3;
    }
    renderAll(this);
    updateUI(this);
    if (this.currentPlayer !== 0) this._schedule(() => this._aiTurn(), 1100);
  }

  _aiTurn() {
    if (this.phase !== PHASE.PLAYING) return;
    const aiIdx = this.currentPlayer;
    if (aiIdx === 0) return;
    updateStatus(this, `${NAMES[aiIdx]} 思考中...`);
    this._schedule(() => {
      const leading = (this.lastPlay === null || this.lastPlayedBy === aiIdx);
      const combo = localAI(this.hands[aiIdx], leading, this.lastPlay, aiIdx, this);
      if (combo) {
        const valid = detectCombination(combo.cards);
        if (!valid || (!leading && !canBeat(valid, this.lastPlay))) { this._executePass(aiIdx); return; }
        this._executePlay(aiIdx, combo);
      } else {
        this._executePass(aiIdx);
      }
    }, 700);
  }

  _endGame(winnerIdx) {
    this.phase = PHASE.FINISHED;
    this.winner = winnerIdx;
    const isLandlordWin = winnerIdx === this.landlord;
    const humanWins = (winnerIdx === 0) || (!isLandlordWin && this.landlord !== 0);
    showWinScreen(humanWins, isLandlordWin, winnerIdx);
  }
}

function rpsName(c) { return { rock: '石头', scissors: '剪刀', paper: '布' }[c]; }

// 特殊牌型动效：屏幕轻震 + 闪光
function triggerFX(type) {
  const c = document.getElementById('game-container');
  const f = document.getElementById('fx-flash');
  if (!c || !f) return;
  const cls = type === 'rocket' ? 'fx-rocket' : type === 'plane' ? 'fx-plane' : 'fx-bomb';
  c.classList.remove('fx-bomb', 'fx-rocket', 'fx-plane');
  f.classList.remove('fx-bomb', 'fx-rocket', 'fx-plane', 'fx-on');
  void f.offsetWidth; // 强制回流，重新触发动画
  c.classList.add(cls);
  f.classList.add(cls, 'fx-on');
  setTimeout(() => { c.classList.remove('fx-bomb', 'fx-rocket', 'fx-plane'); f.classList.remove('fx-on'); }, 650);
}

// ==================== RENDERER ====================
let game = new Game();

function createCardElement(card, opts = {}) {
  const div = document.createElement('div');
  div.className = `card ${card.color}${card.isJoker ? ' joker' : ''}${opts.faceDown ? ' face-down' : ''}`;
  div.dataset.cardId = card.id;
  if (!opts.faceDown) {
    if (card.isJoker) {
      const label = card.displayRank === '小' ? '小' : '大';
      const icon = card.value === 17 ? '🌟🌟' : '⭐'; // 大王/小王
      div.innerHTML = `<span class="corner"><span class="cr">${label}</span><span class="cs">${icon}</span></span><span class="corner-bot"><span class="cr">${label}</span><span class="cs">${icon}</span></span>`;
    } else {
      div.innerHTML = `<span class="corner"><span class="cr">${card.displayRank}</span><span class="cs">${card.displaySuit}</span></span><span class="corner-bot"><span class="cr">${card.displayRank}</span><span class="cs">${card.displaySuit}</span></span>`;
    }
  }
  return div;
}

function renderPlayerCards(game, playerIdx) {
  const container = document.getElementById(`cards-${playerIdx}`);
  if (!container) return;
  container.innerHTML = '';
  const hand = game.hands[playerIdx];
  const faceDown = (playerIdx !== 0) && !game.showAICards;
  for (const card of hand) {
    const el = createCardElement(card, { faceDown });
    if (playerIdx === 0 && game.selectedCards.find(c => c.id === card.id)) el.classList.add('selected');
    container.appendChild(el);
  }
  const countEl = document.getElementById(`count-${playerIdx}`);
  if (countEl && playerIdx !== 0) countEl.textContent = `${hand.length}张`;
  const labelEl = document.getElementById(`label-${playerIdx}`);
  if (labelEl) {
    labelEl.classList.remove('landlord', 'farmer', 'active');
    if (game.landlord === playerIdx) { labelEl.classList.add('landlord'); labelEl.textContent = (playerIdx === 0) ? '你（地主）' : '👑 地主'; }
    else if (game.landlord !== null) { labelEl.classList.add('farmer'); labelEl.textContent = (playerIdx === 0) ? '你（农民）' : '🌾 农民'; }
    if (game.currentPlayer === playerIdx && game.phase === PHASE.PLAYING) labelEl.classList.add('active');
  }
}

function renderBottomCards(game) {
  const container = document.getElementById('bottom-cards-area');
  if (!container) return;
  container.innerHTML = '';
  if (game.firstPlayDone) container.classList.add('moved-up');
  else container.classList.remove('moved-up');
  if (game.landlord !== null) {
    for (const card of game.bottomCards) container.appendChild(createCardElement(card));
  } else {
    for (const card of game.bottomCards) container.appendChild(createCardElement(card, { faceDown: true }));
  }
}

function renderPlayAreas(game, animPlayerIdx) {
  for (let i = 0; i < 3; i++) {
    const container = document.getElementById(`play-area-${i}`);
    if (!container) continue;
    container.innerHTML = '';
    const last = game.lastPlayByPlayer[i];
    if (!last) continue;
    if (last === 'pass') {
      const span = document.createElement('span');
      span.className = 'pass-tag';
      span.textContent = '不出';
      container.appendChild(span);
    } else if (Array.isArray(last) && last.length > 0) {
      for (const card of last) { const el = createCardElement(card); if (i === animPlayerIdx) el.classList.add('slapped'); container.appendChild(el); }
    }
  }
}

function renderCounter(game) {
  const panel = document.getElementById('counter-panel');
  if (!panel) return;
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'counter-head';
  head.textContent = '🧠 记牌器';
  panel.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'counter-grid';
  for (const r of ALL_RANKS) {
    const played = game.playedByRank[r] || 0;
    const total = TOTAL_BY_RANK[r];
    const mine = (game.hands[0] || []).filter(c => c.value === r).length;
    const outside = Math.max(0, total - played - mine); // 外面（对手手里）还有多少
    const cell = document.createElement('div');
    cell.className = 'counter-cell';
    const dim = outside <= 0;
    const bombRisk = outside === 4;
    if (dim) cell.classList.add('dim');
    if (bombRisk) cell.classList.add('bomb');
    const rLabel = RANK_NAME[r];
    const sym = r >= 16 ? (r === 16 ? '小王' : '大王') : rLabel;
    cell.innerHTML = `<span class="c-rank">${sym}</span><span class="c-out">${outside}</span>`;
    cell.title = `${sym}：外面剩 ${outside} 张 / 共 ${total} 张`;
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
}

function renderAll(game) {
  for (let i = 0; i < 3; i++) renderPlayerCards(game, i);
  renderBottomCards(game);
  renderPlayAreas(game, -1);
  renderCounter(game);
}

function updateUI(game) {
  const btnBid = document.getElementById('btn-bid');
  const btnNoBid = document.getElementById('btn-no-bid');
  const btnPlay = document.getElementById('btn-play');
  const btnPass = document.getElementById('btn-pass');
  const btnHint = document.getElementById('btn-hint');
  const showBidBtns = (game.phase === PHASE.BIDDING) && !game.bidResponses.find(r => r.playerIdx === 0);
  const showPlayBtns = (game.phase === PHASE.PLAYING) && game.currentPlayer === 0;
  btnBid.style.display = showBidBtns ? '' : 'none';
  btnNoBid.style.display = showBidBtns ? '' : 'none';
  btnPlay.style.display = showPlayBtns ? '' : 'none';
  btnPass.style.display = showPlayBtns ? '' : 'none';
  btnHint.style.display = showPlayBtns ? '' : 'none';
  if (showPlayBtns) {
    const leading = (game.lastPlay === null || game.lastPlayedBy === 0);
    btnPass.disabled = leading;
    const selected = game.selectedCards;
    if (selected.length === 0) btnPlay.disabled = true;
    else {
      const combo = detectCombination(selected);
      if (!combo) btnPlay.disabled = true;
      else if (!leading && !canBeat(combo, game.lastPlay)) btnPlay.disabled = true;
      else btnPlay.disabled = false;
    }
  }
}

function updateStatus(game, msg) { const el = document.getElementById('status-text'); if (el) el.textContent = msg; }

function toggleCardSelection(game, card) {
  if (game.phase !== PHASE.PLAYING || game.currentPlayer !== 0) return;
  const idx = game.selectedCards.findIndex(c => c.id === card.id);
  if (idx >= 0) game.selectedCards.splice(idx, 1);
  else game.selectedCards.push(card);
  game.selectedCards.sort((a, b) => a.value - b.value);
  renderPlayerCards(game, 0);
  updateUI(game);
}

// ==================== OVERLAY / ANIMATIONS ====================
function hideOverlay() { document.getElementById('overlay').classList.add('hidden'); document.getElementById('overlay-buttons').innerHTML = ''; }

function showPalmBackUI(game) {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const content = document.getElementById('overlay-content');
  const info = document.getElementById('overlay-info');
  const buttons = document.getElementById('overlay-buttons');
  overlay.classList.remove('hidden');
  title.textContent = '手心手背！';
  info.textContent = '选手心或手背，淘汰的人退出争夺地主权';
  buttons.innerHTML = '';
  const players = game.palmBackPlayers;
  content.innerHTML = players.map(p => `<div class="overlay-player"><div class="name">${NAMES[p]}</div><div class="choice" id="palm-choice-${p}">❓</div></div>`).join('');
  buttons.innerHTML = `<button class="btn-palm" id="btn-palm-palm">✋ 手心</button><button class="btn-palm" id="btn-palm-back">✊ 手背</button>`;
  document.getElementById('btn-palm-palm').addEventListener('click', () => game.resolvePalmBack('palm'));
  document.getElementById('btn-palm-back').addEventListener('click', () => game.resolvePalmBack('back'));
}

function showRPSUI(game) {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const content = document.getElementById('overlay-content');
  const info = document.getElementById('overlay-info');
  const buttons = document.getElementById('overlay-buttons');
  overlay.classList.remove('hidden');
  title.textContent = '石头剪刀布！';
  info.textContent = '选石头、剪刀或布，胜者当地的开始叫地主';
  buttons.innerHTML = '';
  const players = game.rpsPlayers;
  content.innerHTML = players.map(p => `<div class="overlay-player"><div class="name">${NAMES[p]}</div><div class="choice shaking" id="rps-choice-${p}">✊</div></div>`).join('');
  if (players.includes(0)) {
    buttons.innerHTML = `<button class="btn-rps" id="btn-rps-rock">✊ 石头</button><button class="btn-rps" id="btn-rps-scissors">✌️ 剪刀</button><button class="btn-rps" id="btn-rps-paper">✋ 布</button>`;
    document.getElementById('btn-rps-rock').addEventListener('click', () => revealRPS(game, 'rock'));
    document.getElementById('btn-rps-scissors').addEventListener('click', () => revealRPS(game, 'scissors'));
    document.getElementById('btn-rps-paper').addEventListener('click', () => revealRPS(game, 'paper'));
  } else {
    game._schedule(() => revealRPS(game, null), 2000);
  }
}

function revealRPS(game, humanChoice) {
  if (humanChoice) game.rpsChoices[0] = humanChoice;
  const players = game.rpsPlayers;
  const emoji = { rock: '✊', scissors: '✌️', paper: '✋' };
  for (const p of players) { const el = document.getElementById(`rps-choice-${p}`); if (el) { el.classList.remove('shaking'); el.textContent = emoji[game.rpsChoices[p]]; el.classList.add('pop-in'); } }
  document.getElementById('overlay-buttons').innerHTML = '';
  const [p1, p2] = players;
  const c1 = game.rpsChoices[p1], c2 = game.rpsChoices[p2];
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  if (c1 === c2) {
    document.getElementById('overlay-info').textContent = '平局！再来一次...';
    game.rpsRound++;
    if (game.rpsRound >= 5) {
      const winner = players[Math.random() < 0.5 ? 0 : 1];
      document.getElementById('overlay-info').textContent = '已达最大回合数，随机选择...';
      const wel = document.getElementById(`rps-choice-${winner}`); if (wel) wel.classList.add('winner');
      game._schedule(() => { hideOverlay(); game._setLandlord(winner); }, 2000);
    } else {
      game.rpsChoices = {};
      for (const p of players) if (p !== 0) game.rpsChoices[p] = ['rock', 'scissors', 'paper'][Math.floor(Math.random() * 3)];
      game._schedule(() => showRPSUI(game), 1500);
    }
    return;
  }
  const winner = beats[c1] === c2 ? p1 : p2;
  const el = document.getElementById(`rps-choice-${winner}`); if (el) el.classList.add('winner');
  document.getElementById('overlay-info').textContent = `${NAMES[p1]}：${rpsName(c1)}，${NAMES[p2]}：${rpsName(c2)} — ${NAMES[winner]} 胜！`;
  game._schedule(() => { hideOverlay(); game._setLandlord(winner); }, 2000);
}

function showRPSResult(game, p1, p2, c1, c2, winner) {
  const emoji = { rock: '✊', scissors: '✌️', paper: '✋' };
  for (const p of [p1, p2]) {
    const el = document.getElementById(`rps-choice-${p}`);
    if (el) { el.classList.remove('shaking'); el.textContent = emoji[game.rpsChoices[p]]; if (p === winner) el.classList.add('winner'); }
  }
  document.getElementById('overlay-buttons').innerHTML = '';
  setTimeout(() => { hideOverlay(); game._setLandlord(winner); }, 2000);
}

function showWinScreen(humanWins, isLandlordWin, winnerIdx) {
  const overlay = document.getElementById('win-overlay');
  const text = document.getElementById('win-text');
  overlay.classList.remove('hidden');
  text.className = humanWins ? 'win' : 'lose';
  if (humanWins) text.textContent = '你赢了！';
  else text.textContent = NAMES[winnerIdx] + ' 赢了，你输了！';
  updateStatus(game, isLandlordWin ? '地主获胜！' : '农民获胜！');
}

// ==================== EVENT HANDLERS ====================
function bindButtons() {
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  bind('btn-bid', () => { game.humanBid(true); updateStatus(game, '你：抢地主！'); });
  bind('btn-no-bid', () => { game.humanBid(false); updateStatus(game, '你：不抢'); });
  bind('btn-play', () => game.humanPlayCards([...game.selectedCards]));
  bind('btn-pass', () => game.humanPass());
  bind('btn-hint', () => game.applyHint());
  bind('btn-toggle-ai', function () { game.showAICards = !game.showAICards; this.textContent = game.showAICards ? '隐藏电脑手牌' : '查看电脑手牌'; renderAll(game); });
  bind('btn-restart', () => { resetGame(); });
  bind('btn-win-restart', () => { resetGame(); });
  bind('counter-toggle', function () {
    const panel = document.getElementById('counter-panel');
    panel.classList.toggle('counter-closed');
    this.textContent = panel.classList.contains('counter-closed') ? '🧠 记牌器' : '🧠 记牌器 (收起)';
  });
  const runOP = (mode) => {
    document.getElementById('op-panel').classList.add('op-closed');
    const wo = document.getElementById('win-overlay'); if (wo) wo.classList.add('hidden');
    hideOverlay();
    game.startOPGame(mode);
  };
  bind('op-toggle', function () {
    document.getElementById('op-panel').classList.toggle('op-closed');
    this.textContent = document.getElementById('op-panel').classList.contains('op-closed') ? '⚡ OP' : '⚡ OP (收起)';
  });
  bind('op-bomb', () => runOP('bomb'));
  bind('op-plane', () => runOP('plane'));
  bind('op-rocket', () => runOP('rocket'));
  bind('op-bomb5', () => runOP('bomb5'));
  bind('op-rockets', () => runOP('rockets'));
}

function resetGame() {
  document.getElementById('win-overlay').classList.add('hidden');
  hideOverlay();
  game = new Game();
  window.game = game;
  game.startNewGame();
}

// ==================== DRAG SELECTION ====================
let dragState = { active: false, toggled: new Set() };
function getCardFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cardEl = el.closest('#cards-0 .card');
  return cardEl ? cardEl.dataset.cardId : null;
}
function onDragStart(cardId) {
  if (game.phase !== PHASE.PLAYING || game.currentPlayer !== 0) return;
  const card = game.hands[0].find(c => c.id === cardId); if (!card) return;
  dragState.active = true; dragState.toggled = new Set([cardId]);
  toggleCardSelection(game, card);
}
function onDragMove(x, y) {
  if (!dragState.active) return;
  const cardId = getCardFromPoint(x, y);
  if (!cardId || dragState.toggled.has(cardId)) return;
  const card = game.hands[0].find(c => c.id === cardId); if (!card) return;
  dragState.toggled.add(cardId);
  toggleCardSelection(game, card);
}
function onDragEnd() { dragState.active = false; dragState.toggled.clear(); }

function setupDrag() {
  const cards0 = document.getElementById('cards-0');
  if (!cards0) return;
  cards0.addEventListener('mousedown', (e) => { const cardEl = e.target.closest('.card'); if (cardEl) { onDragStart(cardEl.dataset.cardId); e.preventDefault(); } });
  document.addEventListener('mousemove', (e) => { if (dragState.active) onDragMove(e.clientX, e.clientY); });
  document.addEventListener('mouseup', () => { if (dragState.active) onDragEnd(); });
  cards0.addEventListener('touchstart', (e) => { const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY); if (el) { const c = el.closest('.card'); if (c) { onDragStart(c.dataset.cardId); e.preventDefault(); } } }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (dragState.active) { const t = e.touches[0]; onDragMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
  document.addEventListener('touchend', () => { if (dragState.active) onDragEnd(); });
}

// ==================== INIT ====================
window.game = game;
bindButtons();
setupDrag();
game.startNewGame();

})();
