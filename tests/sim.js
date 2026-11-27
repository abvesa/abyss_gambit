// 用機器人自動玩，檢查引擎不會崩潰並估計難度。用法：node tests/sim.js [局數]
require('../engine.js');
const E = globalThis.Engine;

function check(S) {
  const seen = new Set();
  const put = (x, y, who) => {
    if (!E.inb(x, y)) throw new Error(who + ' out of bounds');
    const t = E.tileAt(S, x, y);
    if (t !== '.') throw new Error(who + ' on non-floor ' + t + ' @' + x + ',' + y);
    const k = x + ',' + y;
    if (seen.has(k)) throw new Error('overlap @' + k + ' ' + who);
    seen.add(k);
  };
  if (!['reward', 'dead', 'draft', 'door'].includes(S.phase)) put(S.player.x, S.player.y, 'player');
  for (const e of S.enemies) { if (e.dead) throw new Error('dead enemy kept'); put(e.x, e.y, e.type); }
  if (S.hp > S.maxHp) throw new Error('hp > max');
  if (S.relics.length > E.RELIC_CAP) throw new Error('relics over cap ' + S.relics.length);
  if (S.maxHp > Math.max(E.HP_CAP, (S.build && S.build.hp) || 0)) throw new Error('maxHp over cap ' + S.maxHp);
  if (S.phase === 'player' && (S.mv < 0 || S.st < 0 || S.bonus < 0)) throw new Error('negative action slots');
  const all = [...S.hand, ...S.draw, ...S.discard].sort((a, b) => a - b);
  const deck = S.deck.slice().sort((a, b) => a - b);
  if (S.phase === 'player' && JSON.stringify(all) !== JSON.stringify(deck)) throw new Error('card accounting ' + all + ' vs ' + deck);
}

function actions(S) {
  const out = E.canWait(S) ? [{ hi: -1 }] : [];
  S.hand.forEach((_, hi) => E.legalTargets(S, hi).forEach((t) => out.push({ hi, x: t.x, y: t.y })));
  (S.skills || []).forEach((_, si) => E.skillTargets(S, si).forEach((t) => out.push({ hi: { si }, x: t.x, y: t.y })));
  return out;
}
function act(S, a) {
  if (a.hi === -1) return E.waitTurn(S);
  if (typeof a.hi === 'object') return E.useSkill(S, a.hi.si, a.x, a.y);
  return E.playCard(S, a.hi, a.x, a.y);
}

function evalAction(S, a) {
  const p = E.preview(S, a.hi, a.x, a.y);
  if (!p) return -1e9;
  if (p.cleared) return 1000;
  if (p.dead) return -1000;
  let s = 0;
  const hpBefore = S.enemies.reduce((a, e) => a + e.hp, 0);
  const hpAfter = p.T.enemies.reduce((a, e) => a + e.hp, 0);
  s += (hpBefore - hpAfter) * 6;
  s -= (p.dmg + S.hp - p.T.hp) * 40; // 回合結束的傷害 + 立即受到的傷害（被刺、爆炸）
  s += p.kills.length * 25;
  if (p.cont) {
    // 連鎖中：再往下看一步的最佳結果
    let best = -1e9;
    const T = p.T;
    for (const b of actions(T)) { const v = evalAction1(T, b); if (v > best) best = v; }
    s += Math.max(best, -200);
  }
  return s + Math.random();
}
function evalAction1(S, a) {
  const p = E.preview(S, a.hi, a.x, a.y);
  if (!p) return -1e9;
  if (p.cleared) return 1000;
  if (p.dead) return -1000;
  const foes = p.T.enemies;
  let near = 0;
  if (foes.length) near = Math.min(...foes.map((e) => Math.max(Math.abs(e.x - p.T.player.x), Math.abs(e.y - p.T.player.y))));
  const hpBefore = S.enemies.reduce((a, e) => a + e.hp, 0);
  const hpAfter = foes.reduce((a, e) => a + e.hp, 0);
  // 還能繼續出牌時，至少可以「現在就結束回合」：用它估計回合結束的傷害
  let endDmg = p.dmg;
  if (p.cont) { const w = E.preview(p.T, -1, 0, 0); endDmg = w ? w.dmg : 0; }
  return -(endDmg + S.hp - p.T.hp) * 40 + p.kills.length * 25 + (hpBefore - hpAfter) * 6 + (p.cont ? 10 : 0) - near * 2;
}

const CAP = +process.argv[3] || 15;
// DIAG=1：統計玩家受到的傷害來自哪裡
const DIAG = !!process.env.DIAG;
const dmgBy = {}, deathBy = {};
function attribute(ev, types, S) {
  let src = '?';
  for (const e of ev) {
    if (e.t === 'spawn') types[e.uid] = e.type + (e.affixes && e.affixes.length ? '[' + e.affixes.join('+') + ']' : '');
    if (e.t === 'atk') src = (types[e.uid] || '?').replace(/\[.*\]/, '') + ':' + e.k;
    if (e.t === 'text' && e.s === '被刺！') src = 'prick';
    if (e.t === 'collapse') src = 'collapse';
    if (e.t === 'burn') src = 'fire';
    if (e.t === 'text' && e.s === '擋下增援') src = 'blockspawn';
    if (e.t === 'phase' && e.p === 'player') src = '?';
    if (e.t === 'phit') dmgBy[src] = (dmgBy[src] || 0) + e.amt;
    if (e.t === 'pdie') deathBy[src] = (deathBy[src] || 0) + 1;
  }
}
process.on('exit', () => { if (DIAG) { console.log('dmg', JSON.stringify(Object.entries(dmgBy).sort((a, b) => b[1] - a[1]))); console.log('death', JSON.stringify(deathBy)); } });
// 機器人挑獎勵：優先拿構築想要的東西（模擬「朝某個流派走」的玩家）
function pickReward(S, build) {
  const want = (build && build.prefer) || [];
  const rv = (r) => (want.includes(r) ? 2 : 1) + (['satchel', 'aegis', 'heart', 'conduit'].includes(r) ? 0.5 : 0);
  const worst = S.relics.slice().sort((a, b) => rv(a) - rv(b))[0];
  const full = S.relics.length >= E.RELIC_CAP;
  let best = 0, bs = -1;
  S.rewards.forEach((o, i) => {
    let v = Math.random();
    // 牌組太大會稀釋好牌：想要的牌在牌組還小時才拿
    if (o.t === 'card') v += want.includes(o.k) ? (S.deck.length < 9 ? 4.5 : 1.5) : 0.3;
    if (o.t === 'relic') v += full ? (rv(o.r) > rv(worst) ? 6 : -5) : want.includes(o.r) ? 8 : 3;
    if (o.t === 'upgrade') v += 4;
    if (o.t === 'maxhp') v += 2.5;
    if (o.t === 'heal') v += S.hp <= S.maxHp - 2 ? 5 : 0.5;
    if (o.t === 'remove') v += 1.5;
    if (v > bs) { bs = v; best = i; }
  });
  const o = S.rewards[best];
  let param;
  if (o.t === 'upgrade') {
    const ids = S.deck.filter((id) => !S.cards[id].plus);
    param = ids.find((id) => want.includes(S.cards[id].k)) || ids[0];
  }
  if (o.t === 'remove') param = S.deck.find((id) => !want.includes(S.cards[id].k)) || S.deck[0];
  if (o.t === 'relic' && full) param = worst;
  return [best, param];
}
function runOne(seed, smart, hero, build) {
  const S = build ? E.newRun({ seed, mode: 'endless', build }) : E.newRun({ seed, hero });
  let steps = 0;
  while (steps++ < 6000) {
    check(S);
    if (S.phase === 'dead') return S;
    if (S.phase === 'door') {
      // 像玩家一樣選門：多半走平穩之門，偶爾冒險
      const r = Math.random(), want = r < 0.5 ? 0 : r < 0.85 ? 1 : 2;
      if (!E.chooseDoor(S, smart ? Math.min(want, S.doors.length - 1) : Math.floor(Math.random() * S.doors.length))) throw new Error('door failed');
      continue;
    }
    if (S.phase === 'reward' || S.phase === 'draft') {
      if (S.floor >= CAP) return S;
      let i, param;
      if (smart) [i, param] = pickReward(S, build);
      else {
        i = Math.floor(Math.random() * S.rewards.length);
        const o = S.rewards[i];
        if (o.t === 'upgrade') param = S.deck.find((id) => !S.cards[id].plus);
        if (o.t === 'remove') param = S.deck[0];
        if (o.t === 'relic' && S.relics.length >= E.RELIC_CAP) param = S.relics[0];
      }
      if (!E.applyReward(S, i, param)) throw new Error('reward failed ' + JSON.stringify(S.rewards[i]));
      continue;
    }
    const acts = actions(S);
    let a;
    if (smart) {
      let best = -Infinity;
      for (const b of acts) { const v = evalAction(S, b); if (v > best) { best = v; a = b; } }
    } else a = acts[Math.floor(Math.random() * acts.length)];
    const types = DIAG ? Object.fromEntries(S.enemies.map((e) => [e.uid, e.type + (e.affixes.length ? '[' + e.affixes.join('+') + ']' : '')])) : null;
    const ev = act(S, a);
    if (!ev) throw new Error('action rejected ' + JSON.stringify(a));
    if (DIAG) attribute(ev, types, S);
    if (S.turn > 80) return S; // 卡關保護
  }
  return S;
}

const N = +process.argv[2] || 60;
const C = (k, p) => [k, !!p];
// 各流派的構築（點數大致相同，約 22 點），從第 1 層出發
const BUILDS = {
  base: { hp: 5, hand: 0, undo: 0, deck: [C('king'), C('king'), C('knight'), C('rook'), C('slash'), C('lance')], relics: [], skills: ['redraw'], start: 1 },
  chain: { hp: 6, hand: 0, undo: 1, deck: [C('king', 1), C('king', 1), C('knight', 1), C('bishop', 1), C('slash'), C('slash'), C('execute')], relics: ['bell', 'spark'], skills: ['redraw'], start: 1,
    prefer: ['king', 'knight', 'queen', 'execute', 'slash', 'bell', 'spark', 'fang', 'berserk', 'momentum'] },
  push: { hp: 7, hand: 0, undo: 1, deck: [C('rook', 1), C('king'), C('knight'), C('shove', 1), C('shove'), C('hook'), C('slash', 1)], relics: ['ram', 'quake'], skills: ['shove'], start: 1,
    prefer: ['shove', 'hook', 'rook', 'slash', 'whirl', 'ram', 'quake', 'abyss'] },
  strike: { hp: 7, hand: 0, undo: 1, deck: [C('king'), C('knight'), C('rook'), C('lance', 1), C('lance'), C('bolt', 1), C('guard')], relics: ['rooted', 'conduit'], skills: ['lance'], start: 1,
    prefer: ['lance', 'bolt', 'whirl', 'guard', 'execute', 'rooted', 'conduit', 'bulwark', 'satchel'] },
  leap: { hp: 6, hand: 0, undo: 1, deck: [C('leap', 1), C('leap', 1), C('knight'), C('king'), C('slash'), C('lance'), C('guard')], relics: ['quake', 'conduit'], skills: ['blink'], start: 1,
    prefer: ['leap', 'knight', 'blink', 'quake', 'conduit', 'thorns', 'spark'] },
  redirect: { hp: 5, hand: 0, undo: 1, deck: [C('swap', 1), C('swap'), C('hook', 1), C('king'), C('knight'), C('guard'), C('bolt')], relics: ['puppet', 'aegis'], skills: ['seal'], start: 1,
    prefer: ['swap', 'hook', 'blink', 'guard', 'puppet', 'conduit', 'aegis'] },
  guard: { hp: 6, hand: 0, undo: 1, deck: [C('guard', 1), C('guard'), C('king'), C('knight'), C('rook'), C('slash'), C('whirl')], relics: ['bulwark', 'thorns', 'heart'], skills: ['mend'], start: 1,
    prefer: ['guard', 'whirl', 'slash', 'execute', 'bulwark', 'thorns', 'heart', 'aegis', 'fang'] },
};
module.exports = { actions, act, evalAction, runOne, BUILDS };
if (require.main === module) main();
function main() {
  if (process.argv[4] === 'tower') {
    // BUILD='{...}' 可以臨時測一個自訂構築（名稱 custom）
  if (process.env.BUILD) BUILDS.custom = JSON.parse(process.env.BUILD);
  const names = process.argv[5] ? process.argv[5].split(',') : Object.keys(BUILDS);
    for (const name of names) {
      const b = BUILDS[name];
      const floors = []; let stuck = 0; const t0 = Date.now();
      for (let i = 0; i < Math.ceil(N / 3); i++) {
        const S = runOne(3000 + i * 7919, true, null, JSON.parse(JSON.stringify(b)));
        if (S.turn > 80) stuck++;
        floors.push(S.floor);
      }
      floors.sort((a, b) => a - b);
      console.log('tower', name, 'median', floors[floors.length >> 1], 'min', floors[0], 'max', floors[floors.length - 1], 'stuck', stuck, JSON.stringify(floors), (Date.now() - t0) + 'ms');
    }
    if (!process.argv[5]) {
      const rf = [];
      for (let i = 0; i < N; i++) rf.push(runOne(5000 + i, false, null, JSON.parse(JSON.stringify(BUILDS.chain))).floor);
      console.log('tower random chain', JSON.stringify(rf));
    }
    process.exit(0);
  }
  for (const [label, smart] of [['random', false], ['greedy', true]]) {
    for (const hero of smart ? ['ranger', 'shade', 'warden', 'master'] : ['ranger']) {
      const floors = []; let t0 = Date.now(); const scores = []; let stuck = 0;
      for (let i = 0; i < (smart ? Math.ceil(N / 3) : N); i++) {
        const S = runOne(1000 + i * 7919, smart, hero);
        if (S.turn > 80) stuck++;
        floors.push(S.floor); scores.push(S.score);
      }
      floors.sort((a, b) => a - b);
      const avg = (floors.reduce((a, b) => a + b, 0) / floors.length).toFixed(2);
      const dist = {}; floors.forEach((f) => (dist[f] = (dist[f] || 0) + 1));
      console.log(label, hero, 'avg floor', avg, 'median', floors[floors.length >> 1], 'max', floors[floors.length - 1], 'stuck', stuck, JSON.stringify(dist), (Date.now() - t0) + 'ms');
    }
  }
}
