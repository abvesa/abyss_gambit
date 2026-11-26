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
  if (S.phase !== 'reward' && S.phase !== 'dead') put(S.player.x, S.player.y, 'player');
  for (const e of S.enemies) { if (e.dead) throw new Error('dead enemy kept'); put(e.x, e.y, e.type); }
  if (S.hp > S.maxHp) throw new Error('hp > max');
  const all = [...S.hand, ...S.draw, ...S.discard].sort((a, b) => a - b);
  const deck = S.deck.slice().sort((a, b) => a - b);
  if (S.phase === 'player' && JSON.stringify(all) !== JSON.stringify(deck)) throw new Error('card accounting ' + all + ' vs ' + deck);
}

function actions(S) {
  const out = E.canWait(S) ? [{ hi: -1 }] : [];
  S.hand.forEach((_, hi) => E.legalTargets(S, hi).forEach((t) => out.push({ hi, x: t.x, y: t.y })));
  return out;
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
  s -= p.dmg * 40;
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
  return -p.dmg * 40 + p.kills.length * 25 + (hpBefore - hpAfter) * 6 + (p.cont ? 10 : 0) - near * 2;
}

const CAP = +process.argv[3] || 15;
function runOne(seed, smart, hero) {
  const S = E.newRun({ seed, hero });
  let steps = 0;
  while (steps++ < 4000) {
    check(S);
    if (S.phase === 'dead') return S;
    if (S.phase === 'reward') {
      if (S.floor >= CAP) return S;
      const i = Math.floor(Math.random() * S.rewards.length);
      const o = S.rewards[i];
      let param;
      if (o.t === 'upgrade') param = S.deck.find((id) => !S.cards[id].plus);
      if (o.t === 'remove') param = S.deck[0];
      if (!E.applyReward(S, i, param)) throw new Error('reward failed ' + JSON.stringify(o));
      continue;
    }
    const acts = actions(S);
    let a;
    if (smart) {
      let best = -Infinity;
      for (const b of acts) { const v = evalAction(S, b); if (v > best) { best = v; a = b; } }
    } else a = acts[Math.floor(Math.random() * acts.length)];
    const ev = a.hi < 0 ? E.waitTurn(S) : E.playCard(S, a.hi, a.x, a.y);
    if (!ev) throw new Error('action rejected ' + JSON.stringify(a));
    if (S.turn > 80) return S; // 卡關保護
  }
  return S;
}

const N = +process.argv[2] || 60;
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
