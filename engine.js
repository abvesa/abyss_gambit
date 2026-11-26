/* 棋淵 Abyss Gambit — 遊戲引擎（純邏輯，不碰 DOM，可在 Node 中測試） */
(function (root) {
  'use strict';

  const W = 7, H = 7;
  const D8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  const D4 = D8.slice(0, 4), DG = D8.slice(4);
  const KN = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const idx = (x, y) => y * W + x;
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  /* ---------- 亂數（狀態存在 S.rng，方便存檔 / 回溯） ---------- */
  function rnd(S) {
    let t = (S.rng = (S.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rint = (S, n) => Math.floor(rnd(S) * n);
  const pick = (S, a) => a[rint(S, a.length)];
  function shuffle(S, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = rint(S, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function weighted(S, list) { // [[value, weight]]
    let tot = 0; for (const [, w] of list) tot += w;
    let r = rnd(S) * tot;
    for (const [v, w] of list) { if ((r -= w) < 0) return v; }
    return list[list.length - 1][0];
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  /* ---------- 資料 ---------- */
  const CARDS = {
    king:   { n: '王', name: '王步', r: 0, desc: '移動 1 格（八方向）。', plus: '攻擊傷害變為 2。' },
    knight: { n: '騎', name: '騎跳', r: 0, desc: '走「日」字，可越過任何東西。', plus: '落地時對相鄰敵人各造成 1 傷害。' },
    rook:   { n: '車', name: '車衝', r: 0, desc: '沿直線滑行任意格。', plus: '擊中後把存活的目標擊退 1 格。' },
    bishop: { n: '象', name: '象斜', r: 0, desc: '沿斜線滑行任意格。', plus: '變為迅捷。' },
    lance:  { n: '槍', name: '長槍', r: 0, desc: '原地刺擊直線 2 格內的第一個敵人，造成 2 傷害。', plus: '射程 3，貫穿線上所有敵人。' },
    shove:  { n: '推', name: '掌推', r: 0, quick: true, desc: '把相鄰敵人推開 1 格。撞牆或撞到敵人各受 1 傷害；推進深淵直接死亡。', plus: '一路推到撞上東西為止。' },
    leap:   { n: '躍', name: '飛躍', r: 1, desc: '朝八方向跳出正好 2 格，越過中間的東西。', plus: '落地時對相鄰敵人各造成 1 傷害。' },
    whirl:  { n: '旋', name: '迴旋', r: 1, desc: '原地迴旋，對周圍 8 格的敵人各造成 1 傷害。', plus: '並把存活的敵人推開 1 格。' },
    swap:   { n: '換', name: '移形', r: 1, desc: '與 3 格內任一敵人交換位置（首領除外）。', plus: '變為迅捷。' },
    blink:  { n: '影', name: '影遁', r: 1, quick: true, desc: '瞬移到 2 格內任一空地。', plus: '範圍變為 3。' },
    queen:  { n: '后', name: '后行', r: 2, desc: '沿八方向滑行任意格。', plus: '攻擊傷害變為 2。' },
  };

  const ENEMIES = {
    imp:     { name: '小鬼', icon: '鬼', hp: 1, cost: 1, desc: '走向你，朝你的方向橫掃面前 3 格（1 傷害，同伴也會被掃到）。攻擊方向跟著它本身：把它推開，它就會掃到別處。' },
    spiker:  { name: '刺蝟', icon: '刺', hp: 2, cost: 2, desc: '走向你並攻擊相鄰一格。直接撞上它（王、車、象、后、騎、躍的攻擊）時你也會被刺傷 1 點；改用長槍、推擠或借刀。' },
    puffer:  { name: '河豚', icon: '豚', hp: 1, cost: 2, desc: '貼近你之後自爆，周圍 8 格 1 傷害。被打死時也會立刻爆開。別在它身邊殺它，或者讓它在敵群裡炸開。' },
    archer:  { name: '弓手', icon: '弓', hp: 1, cost: 2, desc: '與你同行或同列且中間無阻擋時放箭，箭會射中飛行路徑上的第一個目標（1 傷害）。你閃開，箭就繼續飛。' },
    brute:   { name: '蠻牛', icon: '牛', hp: 3, cost: 3, desc: '對齊你後直線衝鋒，撞到的目標受 2 傷害。撞牆會暈眩一回合，衝進深淵會摔死。' },
    bomber:  { name: '炸彈魔', icon: '爆', hp: 2, cost: 2, desc: '朝你所在的格子丟炸彈，十字範圍 1 傷害（炸彈落點固定）。丟完要休息一回合。' },
    golem:   { name: '石像', icon: '石', hp: 4, cost: 3, heavy: true, desc: '每兩回合才移動一次。貼近你時重擊周圍 8 格（2 傷害，連同伴一起打）。無法被推動。' },
    warlock: { name: '術士', icon: '巫', hp: 2, cost: 3, desc: '和你保持距離，每 4 回合召喚一隻小鬼。優先處理！' },
    kboss:   { name: '深淵騎士', icon: '♞', hp: 9, boss: true, heavy: true, desc: '首領。以「日」字跳躍砸向你：落點 2 傷害、周圍 8 格 1 傷害。每 4 回合召喚小鬼。擊敗它，所有爪牙一同消散。' },
    qboss:   { name: '虛空女王', icon: '♛', hp: 11, boss: true, heavy: true, desc: '首領。從自身射出四道貫穿光束（直向或斜向），擊中線上所有目標。每 3 回合瞬移並召喚爪牙。' },
  };

  const RELICS = {
    fang:      { icon: '牙', name: '嗜血之牙', desc: '每擊殺 5 個敵人，回復 1 生命。' },
    thorns:    { icon: '棘', name: '荊棘甲', desc: '你受到傷害時，對相鄰敵人各造成 1 傷害。' },
    satchel:   { icon: '囊', name: '戰術腰包', desc: '手牌上限 +1。' },
    bell:      { icon: '鈴', name: '回響之鈴', desc: '每回合第一次擊殺時，打出的那張牌回到手中。' },
    heart:     { icon: '心', name: '鋼鐵之心', desc: '生命上限 +2，並回復 2 生命。' },
    spark:     { icon: '雷', name: '連鎖閃電', desc: '一回合內第 3 次擊殺時，對所有敵人造成 1 傷害。' },
    quake:     { icon: '震', name: '震地靴', desc: '跳躍（騎、躍）落地後，把相鄰敵人推開 1 格。' },
    conduit:   { icon: '魂', name: '靈魂導管', desc: '任何敵人死亡時，對離它最近的另一個敵人造成 1 傷害。' },
    aegis:     { icon: '盾', name: '守護聖印', desc: '每層樓第一次受到的傷害無效。' },
    hourglass: { icon: '沙', name: '時之沙漏', desc: '每層樓的回溯次數 +2。' },
    berserk:   { icon: '狂', name: '狂戰之血', desc: '生命 ≤ 2 時，所有攻擊牌傷害 +1。' },
    momentum:  { icon: '疾', name: '衝勁', desc: '滑行 3 格以上才擊中的攻擊，傷害 +1。' },
    gambler:   { icon: '骰', name: '賭徒骰', desc: '每次選獎勵時多一個選項。' },
    gate:      { icon: '門', name: '守門人', desc: '站在增援點上阻擋敵人時不會受傷。' },
    lantern:   { icon: '燈', name: '先知之燈', desc: '可以看到牌庫接下來會抽到的牌。' },
  };

  const HEROES = {
    ranger: { name: '遊俠', hp: 5, deck: ['king', 'king', 'knight', 'knight', 'rook', 'bishop'], relics: [], desc: '均衡的起手牌組，最適合第一次下淵。', unlock: null },
    shade:  { name: '影刺客', hp: 4, deck: ['king', 'knight', 'blink', 'swap', 'bishop', 'lance'], relics: ['bell'], desc: '生命較低，但擅長換位與連鎖。', unlock: '抵達第 4 層' },
    warden: { name: '鐵衛', hp: 7, deck: ['king', 'knight', 'shove', 'shove', 'whirl', 'rook'], relics: ['thorns'], desc: '皮粗肉厚，把敵人推進深淵是拿手好戲。', unlock: '擊敗第 5 層首領' },
    master: { name: '棋聖', hp: 4, deck: ['queen', 'knight', 'knight', 'rook', 'bishop', 'king'], relics: ['lantern'], desc: '持有皇后與先知之燈，能預讀牌序。', unlock: '通關第 10 層' },
  };

  /* ---------- 基本查詢 ---------- */
  const has = (S, r) => S.relics.includes(r);
  const handSize = (S) => 3 + (has(S, 'satchel') ? 1 : 0);
  const tileAt = (S, x, y) => (inb(x, y) ? S.tiles[idx(x, y)] : '#');
  const isFloor = (S, x, y) => tileAt(S, x, y) === '.';
  function enemyAt(S, x, y) {
    for (const e of S.enemies) if (!e.dead && e.x === x && e.y === y) return e;
    return null;
  }
  function entityAt(S, x, y) {
    if (S.player.x === x && S.player.y === y) return 'P';
    return enemyAt(S, x, y);
  }
  const isEmpty = (S, x, y) => isFloor(S, x, y) && !entityAt(S, x, y);
  const spawnAt = (S, x, y) => S.spawns.some((s) => s.x === x && s.y === y);
  const alive = (S) => S.enemies.filter((e) => !e.dead);
  function isQuick(c) {
    return !!CARDS[c.k].quick || (c.plus && (c.k === 'bishop' || c.k === 'swap'));
  }
  function cleanup(S) { S.enemies = S.enemies.filter((e) => !e.dead); }

  function randomEmpty(S, pred) {
    const c = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isEmpty(S, x, y) && !spawnAt(S, x, y) && (!pred || pred(x, y))) c.push({ x, y });
    }
    return c.length ? pick(S, c) : null;
  }

  /* ---------- 牌組 ---------- */
  function addCard(S, k, plus) {
    const id = S.nextCard++;
    S.cards[id] = { id, k, plus: !!plus };
    S.deck.push(id);
    return id;
  }
  function addRelic(S, r) {
    if (has(S, r)) return;
    S.relics.push(r);
    if (r === 'heart') { S.maxHp += 2; S.hp = Math.min(S.maxHp, S.hp + 2); }
    if (r === 'hourglass') S.undoLeft += 2;
  }
  function drawTo(S, n, ev) {
    while (S.hand.length < n) {
      if (!S.draw.length) {
        if (!S.discard.length) break;
        S.draw = shuffle(S, S.discard);
        S.discard = [];
        ev.push({ t: 'shuffle' });
      }
      S.hand.push(S.draw.pop());
    }
  }

  /* ---------- 新的一局 ---------- */
  function newRun(o) {
    const heroId = HEROES[o.hero] ? o.hero : 'ranger';
    const hero = HEROES[heroId];
    const seed = (o.seed >>> 0) || 1;
    const S = {
      v: 1, seed, rng: seed, daily: !!o.daily, hero: heroId,
      floor: 0, hp: hero.hp, maxHp: hero.hp,
      cards: {}, deck: [], nextCard: 1, draw: [], hand: [], discard: [],
      relics: [], tiles: [], player: { x: 3, y: 6 }, enemies: [], spawns: [], reserve: [], cracks: [], nextUid: 1,
      turn: 1, par: 0, turnKills: 0, chain: 0, echoUsed: false, aegisUsed: false, undoLeft: 1, fangCount: 0,
      phase: 'player', rewards: null, boss: false, won: false, justWon: false,
      score: 0, floorDmg: 0, lastPar: false, lastFlawless: false,
      stats: { kills: 0, friendly: 0, pit: 0, bestChain: 0, dmgTaken: 0, turns: 0, floors: 0, blocked: 0 },
    };
    hero.deck.forEach((k) => addCard(S, k, false));
    hero.relics.forEach((r) => addRelic(S, r));
    startFloor(S, 1, []);
    return S;
  }

  function connected(t) {
    let start = -1, total = 0;
    for (let i = 0; i < t.length; i++) if (t[i] === '.') { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    const seen = new Set([start]); const q = [start];
    while (q.length) {
      const i = q.shift(); const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (t[j] === '.' && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    return seen.size === total;
  }

  function genTiles(S) {
    for (let tries = 0; tries < 200; tries++) {
      const t = new Array(W * H).fill('.');
      const nw = S.boss ? 2 + rint(S, 3) : 3 + rint(S, 4);
      const np = S.floor === 1 ? rint(S, 2) : 1 + rint(S, 3);
      const mirror = rnd(S) < 0.4;
      const put = (ch, n) => {
        for (let k = 0; k < n; k++) {
          const x = rint(S, W), y = 1 + rint(S, H - 2);
          t[idx(x, y)] = ch;
          if (mirror) t[idx(W - 1 - x, y)] = ch;
        }
      };
      put('#', mirror ? Math.ceil(nw / 2) : nw);
      put('o', mirror ? Math.ceil(np / 2) : np);
      const floors = t.filter((c) => c === '.').length;
      if (floors >= 36 && connected(t)) { S.tiles = t; return; }
    }
    S.tiles = new Array(W * H).fill('.');
  }

  function enemyPool(f) {
    const p = [['imp', 3], ['archer', 2]];
    if (f >= 2) p.push(['brute', 2]);
    if (f >= 3) p.push(['bomber', 2], ['spiker', 1.5]);
    if (f >= 4) p.push(['golem', 1.5], ['puffer', 1.5]);
    if (f >= 6) p.push(['warlock', 1.5]);
    return p;
  }
  const maxActive = (S) => Math.min(7, 3 + Math.floor((S.floor + 1) / 3));

  function startFloor(S, f, ev) {
    S.floor = f;
    S.boss = f % 5 === 0;
    genTiles(S);
    S.enemies = []; S.spawns = []; S.reserve = []; S.cracks = [];
    S.player = { x: -9, y: -9 };
    const p = randomEmpty(S, (x, y) => y >= H - 2) || randomEmpty(S);
    S.player = { x: p.x, y: p.y };
    const far = (x, y) => y <= 3 && cheb({ x, y }, S.player) >= 3;

    if (S.boss) {
      const bossType = (f / 5) % 2 === 1 ? 'kboss' : 'qboss';
      const b = randomEmpty(S, (x, y) => y <= 1 && cheb({ x, y }, S.player) >= 4) || randomEmpty(S, far) || randomEmpty(S);
      spawnEnemy(S, bossType, b.x, b.y, ev, true);
      const minions = f >= 10 ? ['imp', 'imp', 'archer'] : ['imp', 'imp'];
      for (const m of minions) { const t = randomEmpty(S, far) || randomEmpty(S); if (t) spawnEnemy(S, m, t.x, t.y, ev, true); }
      S.par = 14;
    } else {
      let budget = 3 + Math.round(f * 1.25 + Math.max(0, f - 5) * 0.4);
      const pool = enemyPool(f); const list = [];
      while (budget > 0) {
        const opts = pool.filter(([k]) => ENEMIES[k].cost <= budget);
        if (!opts.length) break;
        const k = weighted(S, opts);
        list.push(k); budget -= ENEMIES[k].cost;
      }
      shuffle(S, list);
      const nInit = Math.min(list.length, maxActive(S), Math.max(2, Math.ceil(list.length / 2)));
      for (let i = 0; i < nInit; i++) {
        const t = randomEmpty(S, far) || randomEmpty(S, (x, y) => cheb({ x, y }, S.player) >= 2);
        if (t) spawnEnemy(S, list[i], t.x, t.y, ev, true, true);
      }
      S.reserve = list.slice(nInit);
      S.par = list.length + 2;
    }

    S.turn = 1; S.played = 0; S.turnKills = 0; S.chain = 0; S.echoUsed = false; S.aegisUsed = false; S.floorDmg = 0;
    S.undoLeft = 1 + (has(S, 'hourglass') ? 2 : 0);
    S.draw = shuffle(S, S.deck.slice()); S.hand = []; S.discard = [];
    drawTo(S, handSize(S), ev);
    for (const e of S.enemies.slice().sort((a, b) => a.uid - b.uid)) { e.fresh = false; enemyTurn(S, e, ev, false); }
    placeSpawnMarkers(S, ev);
    S.phase = 'player';
    S.rewards = null;
  }

  function spawnEnemy(S, type, x, y, ev, fresh, canElite) {
    const d = ENEMIES[type];
    const extra = S.floor > 10 ? (d.boss ? (S.floor - 10) : Math.floor((S.floor - 8) / 4)) : 0;
    const elite = !!canElite && !d.boss && S.floor >= 2 && rnd(S) < Math.min(0.6, 0.2 + 0.07 * (S.floor - 2));
    const hp = d.hp + extra + (elite ? 1 : 0);
    const e = { uid: S.nextUid++, type, x, y, hp, maxHp: hp, elite, intent: null, cd: type === 'warlock' ? 2 : 0, tick: 0, stun: false, fresh: !!fresh };
    S.enemies.push(e);
    ev.push({ t: 'spawn', uid: e.uid, type, x, y, hp, elite });
    return e;
  }

  function placeSpawnMarkers(S, ev) {
    const active = alive(S).length + S.spawns.length;
    const n = Math.min(S.reserve.length, maxActive(S) - active, S.floor >= 4 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const t = randomEmpty(S, (x, y) => cheb({ x, y }, S.player) >= 2);
      if (!t) break;
      const sp = { x: t.x, y: t.y, type: S.reserve.shift() };
      S.spawns.push(sp);
      ev.push({ t: 'marker', x: sp.x, y: sp.y, type: sp.type });
    }
  }

  /* ---------- 玩家可下的位置 ---------- */
  function legalTargets(S, hi) {
    const c = S.cards[S.hand[hi]];
    const out = [];
    if (!c || S.phase !== 'player') return out;
    const P = S.player;
    const add = (x, y, kind, extra) => out.push(Object.assign({ x, y, kind }, extra));
    switch (c.k) {
      case 'king': case 'rook': case 'bishop': case 'queen': {
        const dirs = c.k === 'rook' ? D4 : c.k === 'bishop' ? DG : D8;
        const range = c.k === 'king' ? 1 : 99;
        for (const d of dirs) {
          for (let i = 1; i <= range; i++) {
            const x = P.x + d[0] * i, y = P.y + d[1] * i;
            if (!isFloor(S, x, y)) break;
            if (enemyAt(S, x, y)) { add(x, y, 'attack', { dir: d }); break; }
            add(x, y, 'move', { dir: d });
          }
        }
        break;
      }
      case 'knight': case 'leap': {
        const offs = c.k === 'knight' ? KN : D8.map(([dx, dy]) => [dx * 2, dy * 2]);
        for (const [dx, dy] of offs) {
          const x = P.x + dx, y = P.y + dy;
          if (!isFloor(S, x, y)) continue;
          add(x, y, enemyAt(S, x, y) ? 'attack' : 'move');
        }
        break;
      }
      case 'shove':
        for (const [dx, dy] of D8) {
          const e = enemyAt(S, P.x + dx, P.y + dy);
          if (e && !ENEMIES[e.type].heavy) add(e.x, e.y, 'push');
        }
        break;
      case 'swap':
        for (const e of alive(S)) if (!ENEMIES[e.type].boss && cheb(e, P) <= 3) add(e.x, e.y, 'swap');
        break;
      case 'whirl':
        add(P.x, P.y, 'self');
        break;
      case 'lance': {
        const range = c.plus ? 3 : 2;
        for (const d of D4) {
          for (let i = 1; i <= range; i++) {
            const x = P.x + d[0] * i, y = P.y + d[1] * i;
            if (!inb(x, y) || tileAt(S, x, y) === '#') break;
            if (enemyAt(S, x, y)) { add(x, y, 'attack', { dir: d }); if (!c.plus) break; }
          }
        }
        break;
      }
      case 'blink': {
        const range = c.plus ? 3 : 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if ((x !== P.x || y !== P.y) && cheb({ x, y }, P) <= range && isEmpty(S, x, y)) add(x, y, 'move');
        }
        break;
      }
    }
    return out;
  }

  function cardDmg(S, c, ctx) {
    let d = c.k === 'lance' ? 2 : ((c.k === 'king' || c.k === 'queen') && c.plus ? 2 : 1);
    if (has(S, 'berserk') && S.hp <= 2) d++;
    if (ctx && ctx.dist >= 3 && has(S, 'momentum')) d++;
    return d;
  }

  /* ---------- 傷害 / 擊殺 / 推動 ---------- */
  function movePlayer(S, x, y, ev, kind) {
    S.player.x = x; S.player.y = y;
    ev.push({ t: 'pmove', x, y, kind });
  }
  function healPlayer(S, n, ev) {
    const b = S.hp; S.hp = Math.min(S.maxHp, S.hp + n);
    if (S.hp > b) ev.push({ t: 'heal', n: S.hp - b, x: S.player.x, y: S.player.y });
  }
  function damagePlayer(S, amt, ev) {
    if (S.hp <= 0 || amt <= 0) return;
    if (has(S, 'aegis') && !S.aegisUsed) {
      S.aegisUsed = true;
      ev.push({ t: 'block', x: S.player.x, y: S.player.y });
      return;
    }
    S.hp -= amt; S.stats.dmgTaken += amt; S.floorDmg += amt;
    ev.push({ t: 'phit', amt, x: S.player.x, y: S.player.y });
    if (S.hp <= 0) { S.hp = 0; S.phase = 'dead'; ev.push({ t: 'pdie' }); return; }
    if (has(S, 'thorns')) {
      const adj = D8.map(([dx, dy]) => enemyAt(S, S.player.x + dx, S.player.y + dy)).filter(Boolean);
      for (const e of adj) damageEnemy(S, e, 1, ev, 'thorns');
    }
  }
  function damageEnemy(S, e, amt, ev, how) {
    if (!e || e.dead) return false;
    e.hp -= amt;
    ev.push({ t: 'hit', uid: e.uid, x: e.x, y: e.y, amt });
    if (e.hp <= 0) { killEnemy(S, e, ev, how || 'player'); return true; }
    return false;
  }
  function killEnemy(S, e, ev, how) {
    if (e.dead) return;
    e.dead = true; e.hp = 0; e.intent = null;
    const enemyPhase = S.phase === 'enemy';
    ev.push({ t: 'die', uid: e.uid, x: e.x, y: e.y, how });
    if (e.type === 'puffer' && how !== 'pit' && how !== 'boss') {
      const tiles = D8.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
      ev.push({ t: 'atk', uid: e.uid, k: 'burst', tiles });
      ev.push({ t: 'text', x: e.x, y: e.y, s: '砰！', c: 'gold' });
      const dmg = e.burstDmg || 1;
      for (const [x, y] of tiles) {
        const o = entityAt(S, x, y);
        if (o === 'P') damagePlayer(S, dmg, ev);
        else if (o) damageEnemy(S, o, dmg, ev, enemyPhase ? 'enemy' : 'player');
      }
    }
    if (how === 'self') return;
    S.stats.kills++;
    let pts = 10;
    if (how === 'pit') {
      S.stats.pit++; pts += 10;
      ev.push({ t: 'text', x: e.x, y: e.y, s: '墜入深淵', c: 'violet' });
    }
    if (how === 'enemy') {
      S.stats.friendly++; pts += 15;
      ev.push({ t: 'text', x: e.x, y: e.y, s: '借刀殺人！', c: 'gold' });
      ev.push({ t: 'log', s: ENEMIES[e.type].name + ' 被同伴打倒了。' });
    }
    if (!enemyPhase) S.turnKills++;
    S.score += pts;

    if (ENEMIES[e.type].boss) {
      S.score += 300;
      ev.push({ t: 'text', x: e.x, y: e.y, s: '首領倒下！', c: 'gold', big: true });
      ev.push({ t: 'log', s: ENEMIES[e.type].name + ' 倒下了，爪牙隨之消散。' });
      S.reserve = []; S.spawns = [];
      for (const o of alive(S)) killEnemy(S, o, ev, 'boss');
      return;
    }
    if (how === 'boss') return;
    if (has(S, 'fang')) {
      S.fangCount++;
      if (S.fangCount >= 5) { S.fangCount = 0; healPlayer(S, 1, ev); }
    }
    if (has(S, 'conduit')) {
      let best = null, bd = 99;
      for (const o of alive(S)) {
        const d = cheb(o, e);
        if (d < bd || (d === bd && best && o.uid < best.uid)) { bd = d; best = o; }
      }
      if (best) { ev.push({ t: 'zap', x1: e.x, y1: e.y, x2: best.x, y2: best.y }); damageEnemy(S, best, 1, ev, enemyPhase ? 'conduit' : 'player'); }
    }
    if (has(S, 'spark') && !enemyPhase && S.turnKills === 3) {
      ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '連鎖閃電！', c: 'gold', big: true });
      ev.push({ t: 'spark' });
      for (const o of alive(S)) damageEnemy(S, o, 1, ev, 'player');
    }
  }
  function pushEnemy(S, e, dx, dy, dist, ev) {
    if (!e || e.dead) return;
    if (ENEMIES[e.type].heavy) { ev.push({ t: 'text', x: e.x, y: e.y, s: '紋風不動' }); return; }
    const how = S.phase === 'enemy' ? 'enemy' : 'player';
    for (let m = 0; m < dist; m++) {
      const nx = e.x + dx, ny = e.y + dy;
      const t = tileAt(S, nx, ny);
      if (t === '#') { ev.push({ t: 'bump', uid: e.uid, dx, dy }); damageEnemy(S, e, 1, ev, how); return; }
      if (t === 'o') {
        e.x = nx; e.y = ny; ev.push({ t: 'move', uid: e.uid, x: nx, y: ny });
        killEnemy(S, e, ev, 'pit'); return;
      }
      const o = entityAt(S, nx, ny);
      if (o === 'P') { ev.push({ t: 'bump', uid: e.uid, dx, dy }); damageEnemy(S, e, 1, ev, how); return; }
      if (o) {
        ev.push({ t: 'bump', uid: e.uid, dx, dy });
        damageEnemy(S, e, 1, ev, how); damageEnemy(S, o, 1, ev, how); return;
      }
      e.x = nx; e.y = ny;
      ev.push({ t: 'move', uid: e.uid, x: nx, y: ny });
    }
  }
  function hitTile(S, x, y, dmg, ev, src) {
    const o = entityAt(S, x, y);
    if (o === 'P') damagePlayer(S, dmg, ev);
    else if (o && o !== src) damageEnemy(S, o, dmg, ev, 'enemy');
  }

  function prick(S, e, ev) {
    if (e.type !== 'spiker') return;
    ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '被刺！' });
    damagePlayer(S, 1, ev);
  }

  /* ---------- 出牌 ---------- */
  function doCard(S, c, tg, ev) {
    const P = S.player;
    switch (c.k) {
      case 'king': case 'rook': case 'bishop': case 'queen': {
        const [dx, dy] = tg.dir; const dist = cheb(P, tg);
        if (tg.kind === 'attack') {
          const e = enemyAt(S, tg.x, tg.y);
          if (dist > 1) movePlayer(S, tg.x - dx, tg.y - dy, ev, 'slide');
          ev.push({ t: 'lunge', x: tg.x, y: tg.y });
          const killed = damageEnemy(S, e, cardDmg(S, c, { dist }), ev);
          prick(S, e, ev);
          if (S.hp <= 0) break;
          if (killed) movePlayer(S, tg.x, tg.y, ev, 'step');
          else if (c.k === 'rook' && c.plus) pushEnemy(S, e, dx, dy, 1, ev);
        } else movePlayer(S, tg.x, tg.y, ev, 'slide');
        break;
      }
      case 'knight': case 'leap': {
        let landed = false;
        if (tg.kind === 'attack') {
          const e = enemyAt(S, tg.x, tg.y);
          ev.push({ t: 'lunge', x: tg.x, y: tg.y });
          const killed = damageEnemy(S, e, cardDmg(S, c, {}), ev);
          prick(S, e, ev);
          if (S.hp <= 0) break;
          if (killed) { movePlayer(S, tg.x, tg.y, ev, 'jump'); landed = true; }
        } else { movePlayer(S, tg.x, tg.y, ev, 'jump'); landed = true; }
        if (landed) {
          if (c.plus) {
            ev.push({ t: 'ring', x: P.x, y: P.y });
            const adj = D8.map(([dx, dy]) => enemyAt(S, P.x + dx, P.y + dy)).filter(Boolean);
            for (const e of adj) damageEnemy(S, e, 1, ev);
          }
          if (has(S, 'quake')) {
            const adj = D8.map((d) => [d, enemyAt(S, P.x + d[0], P.y + d[1])]).filter((a) => a[1]);
            for (const [d, e] of adj) pushEnemy(S, e, d[0], d[1], 1, ev);
          }
        }
        break;
      }
      case 'shove': {
        const e = enemyAt(S, tg.x, tg.y);
        ev.push({ t: 'lunge', x: tg.x, y: tg.y });
        pushEnemy(S, e, tg.x - P.x, tg.y - P.y, c.plus ? 99 : 1, ev);
        break;
      }
      case 'swap': {
        const e = enemyAt(S, tg.x, tg.y);
        const ox = P.x, oy = P.y;
        movePlayer(S, e.x, e.y, ev, 'blink');
        e.x = ox; e.y = oy;
        ev.push({ t: 'move', uid: e.uid, x: ox, y: oy, blink: true });
        break;
      }
      case 'whirl': {
        ev.push({ t: 'ring', x: P.x, y: P.y });
        const adj = D8.map((d) => [d, enemyAt(S, P.x + d[0], P.y + d[1])]).filter((a) => a[1]);
        for (const [d, e] of adj) {
          const k = damageEnemy(S, e, cardDmg(S, c, {}), ev);
          if (!k && c.plus) pushEnemy(S, e, d[0], d[1], 1, ev);
        }
        break;
      }
      case 'lance': {
        const [dx, dy] = tg.dir; const range = c.plus ? 3 : 2;
        ev.push({ t: 'lance', x: P.x, y: P.y, dx, dy, range });
        const hits = [];
        for (let i = 1; i <= range; i++) {
          const x = P.x + dx * i, y = P.y + dy * i;
          if (!inb(x, y) || tileAt(S, x, y) === '#') break;
          const e = enemyAt(S, x, y);
          if (e) { hits.push(e); if (!c.plus) break; }
        }
        for (const e of hits) damageEnemy(S, e, cardDmg(S, c, {}), ev);
        break;
      }
      case 'blink':
        movePlayer(S, tg.x, tg.y, ev, 'blink');
        break;
    }
  }

  function applyCard(S, hi, x, y, ev) {
    if (S.phase !== 'player') return null;
    const id = S.hand[hi]; const c = S.cards[id];
    if (!c) return null;
    const tg = legalTargets(S, hi).find((t) => t.x === x && t.y === y);
    if (!tg) return null;
    S.hand.splice(hi, 1);
    S.played++;
    const k0 = S.turnKills;
    ev.push({ t: 'play', k: c.k, plus: c.plus });
    doCard(S, c, tg, ev);
    cleanup(S);
    const killed = S.turnKills > k0;
    if (killed && has(S, 'bell') && !S.echoUsed) {
      S.echoUsed = true; S.hand.push(id);
      ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '回響！', c: 'gold' });
    } else S.discard.push(id);
    if (killed) {
      S.chain++;
      S.stats.bestChain = Math.max(S.stats.bestChain, S.chain);
      if (S.chain >= 2) S.score += 10 * (S.chain - 1);
      ev.push({ t: 'chain', n: S.chain });
    }
    return { killed, cont: S.hp > 0 && (killed || isQuick(c)) };
  }

  function playCard(S, hi, x, y) {
    const ev = [];
    const r = applyCard(S, hi, x, y, ev);
    if (!r) return null;
    if (S.hp <= 0) return ev;
    if (checkClear(S, ev)) return ev;
    if (!r.cont || S.hand.length === 0) endTurn(S, ev);
    return ev;
  }

  // 「必須落子」：本回合還沒出過牌、且手上有牌可以出時，不能直接結束回合
  function canWait(S) {
    if (S.phase !== 'player') return false;
    if (S.played > 0) return true;
    return !S.hand.some((_, hi) => legalTargets(S, hi).length > 0);
  }
  function waitTurn(S) {
    if (!canWait(S)) return null;
    const ev = [];
    endTurn(S, ev);
    return ev;
  }

  /* ---------- 敵方回合 ---------- */
  function endTurn(S, ev) {
    S.phase = 'enemy';
    ev.push({ t: 'phase', p: 'enemy' });
    resolveAttacks(S, ev); cleanup(S);
    if (S.hp <= 0) return;
    resolveCracks(S, ev); cleanup(S);
    if (S.hp <= 0) return;
    resolveSpawns(S, ev); cleanup(S);
    if (S.hp <= 0) return;
    if (checkClear(S, ev)) return;
    for (const e of S.enemies.slice().sort((a, b) => a.uid - b.uid)) {
      if (e.dead) continue;
      const fresh = e.fresh; e.fresh = false;
      enemyTurn(S, e, ev, !fresh);
    }
    cleanup(S);
    placeSpawnMarkers(S, ev);
    placeCracks(S, ev);
    S.turn++; S.stats.turns++;
    S.turnKills = 0; S.chain = 0; S.echoUsed = false; S.played = 0;
    S.discard.push(...S.hand); S.hand = [];
    drawTo(S, handSize(S), ev);
    S.phase = 'player';
    ev.push({ t: 'phase', p: 'player' });
  }

  function resolveAttacks(S, ev) {
    for (const e of S.enemies.slice().sort((a, b) => a.uid - b.uid)) {
      if (e.dead || !e.intent) continue;
      resolveIntent(S, e, ev);
      if (S.hp <= 0) return;
    }
  }

  // 深淵上升：超過標準回合後，地面開始崩塌（提前一回合標示）
  function placeCracks(S, ev) {
    if (S.turn < S.par) return;
    let floors = 0;
    for (const t of S.tiles) if (t === '.') floors++;
    const n = Math.min(3, 1 + Math.floor((S.turn - S.par) / 3));
    if (S.turn === S.par) ev.push({ t: 'log', s: '深淵開始上升，地面即將崩塌！' });
    for (let i = 0; i < n && floors - S.cracks.length > 4; i++) {
      const c = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (isFloor(S, x, y) && !S.cracks.some((k) => k.x === x && k.y === y)) c.push({ x, y });
      }
      if (!c.length) break;
      const foes = alive(S);
      let t;
      if ((S.turn + i) % 2 === 1 && foes.length) {
        // 吞噬敵人腳下或身旁的地面，避免僵局
        const f = pick(S, foes);
        const near = c.filter((k) => cheb(k, f) <= 1);
        t = near.length ? pick(S, near) : pick(S, c);
      } else {
        // 靠近玩家的格子，逼玩家移動
        c.sort((a, b) => cheb(a, S.player) - cheb(b, S.player));
        t = pick(S, c.slice(0, 8));
      }
      S.cracks.push(t);
    }
  }
  function resolveCracks(S, ev) {
    if (!S.cracks.length) return;
    const list = S.cracks; S.cracks = [];
    ev.push({ t: 'collapse', tiles: list.map((k) => [k.x, k.y]) });
    for (const k of list) {
      S.tiles[idx(k.x, k.y)] = 'o';
      S.spawns = S.spawns.filter((sp) => sp.x !== k.x || sp.y !== k.y);
      const o = entityAt(S, k.x, k.y);
      if (o === 'P') {
        damagePlayer(S, 2, ev);
        if (S.hp <= 0) return;
        let best = null, bd = 99;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!isEmpty(S, x, y)) continue;
          const d = cheb({ x, y }, k) + (S.cracks.some((c) => c.x === x && c.y === y) ? 5 : 0);
          if (d < bd) { bd = d; best = { x, y }; }
        }
        if (best) movePlayer(S, best.x, best.y, ev, 'blink');
        ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '跌落又爬起', c: 'violet' });
      } else if (o) killEnemy(S, o, ev, 'pit');
    }
  }

  function resolveSpawns(S, ev) {
    const keep = [];
    for (const sp of S.spawns) {
      if (S.player.x === sp.x && S.player.y === sp.y) {
        S.stats.blocked++; S.score += 5;
        ev.push({ t: 'text', x: sp.x, y: sp.y, s: '擋下增援', c: 'gold' });
        if (!has(S, 'gate')) damagePlayer(S, 1, ev);
        if (S.hp <= 0) return;
        continue;
      }
      if (enemyAt(S, sp.x, sp.y)) { keep.push(sp); continue; }
      spawnEnemy(S, sp.type, sp.x, sp.y, ev, true, true);
    }
    S.spawns = keep;
  }

  function checkClear(S, ev) {
    if (alive(S).length || S.spawns.length || S.reserve.length) return false;
    S.phase = 'reward';
    S.stats.floors++;
    S.score += 50 * S.floor;
    S.lastPar = S.turn <= S.par;
    S.lastFlawless = S.floorDmg === 0;
    if (S.lastPar) S.score += 50;
    if (S.lastFlawless) S.score += 50;
    if (S.boss && S.floor === 10 && !S.won) { S.won = true; S.justWon = true; }
    S.rewards = genRewards(S);
    ev.push({ t: 'clear', floor: S.floor });
    return true;
  }

  // 依照意圖類型，從「目前」位置推算影響格（畫面顯示與結算共用）
  function traceLine(S, x, y, dx, dy, opt) {
    // opt.stopAtEntity, opt.stopAtPit；回傳 {path:[[x,y]], end:'wall'|'pit'|'entity'|'edge', hit:[x,y]|null}
    const path = [];
    for (;;) {
      x += dx; y += dy;
      if (!inb(x, y)) return { path, end: 'edge', hit: null };
      const t = tileAt(S, x, y);
      if (t === '#') return { path, end: 'wall', hit: null };
      if (t === 'o' && opt.stopAtPit) { path.push([x, y]); return { path, end: 'pit', hit: null }; }
      path.push([x, y]);
      if (opt.stopAtEntity && entityAt(S, x, y)) return { path, end: 'entity', hit: [x, y] };
    }
  }
  const PLUS = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]];
  function sweepTiles(S, e, it) {
    return D8.filter(([ox, oy]) => ox * it.dx + oy * it.dy > 0)
      .map(([ox, oy]) => [e.x + ox, e.y + oy])
      .filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
  }

  function intentArea(S, e) {
    // 回傳 [{x,y,dmg,role}]；role: hit / path / summon / land
    const it = e.intent; const out = [];
    if (!it) return out;
    const push = (x, y, dmg, role, extra) => { if (inb(x, y)) out.push(Object.assign({ x, y, dmg, role }, extra)); };
    switch (it.k) {
      case 'melee': push(e.x + it.dx, e.y + it.dy, it.dmg, 'hit', { dx: it.dx, dy: it.dy }); break;
      case 'sweep':
        for (const [x, y] of sweepTiles(S, e, it)) push(x, y, it.dmg, 'hit', { dx: it.dx, dy: it.dy });
        break;
      case 'burst':
        for (const [dx, dy] of D8) if (tileAt(S, e.x + dx, e.y + dy) !== '#') push(e.x + dx, e.y + dy, it.dmg, 'hit');
        break;
      case 'shoot': {
        const r = traceLine(S, e.x, e.y, it.dx, it.dy, { stopAtEntity: true });
        r.path.forEach(([x, y], i) => {
          const last = i === r.path.length - 1 && r.end === 'entity';
          push(x, y, last ? it.dmg : 0, last ? 'hit' : 'path', { dx: it.dx, dy: it.dy });
        });
        break;
      }
      case 'bomb':
        for (const [dx, dy] of PLUS) if (tileAt(S, it.x + dx, it.y + dy) !== '#') push(it.x + dx, it.y + dy, it.dmg, 'hit', { bomb: dx === 0 && dy === 0 });
        break;
      case 'charge': {
        const r = traceLine(S, e.x, e.y, it.dx, it.dy, { stopAtEntity: true, stopAtPit: true });
        r.path.forEach(([x, y], i) => {
          const last = i === r.path.length - 1 && r.end === 'entity';
          push(x, y, last ? it.dmg : 0, last ? 'hit' : 'path', { dx: it.dx, dy: it.dy, pit: r.end === 'pit' && i === r.path.length - 1 });
        });
        break;
      }
      case 'slam':
        for (const [dx, dy] of D8) if (tileAt(S, e.x + dx, e.y + dy) !== '#') push(e.x + dx, e.y + dy, it.dmg, 'hit');
        break;
      case 'summon':
        for (const [x, y, type] of it.tiles) push(x, y, 0, 'summon', { type });
        break;
      case 'leap':
        push(it.x, it.y, 2, 'hit', { land: true });
        for (const [dx, dy] of D8) {
          const x = it.x + dx, y = it.y + dy;
          if (tileAt(S, x, y) !== '#' && !(x === e.x && y === e.y)) push(x, y, 1, 'hit');
        }
        break;
      case 'beam':
        for (const [dx, dy] of it.dirs) {
          const r = traceLine(S, e.x, e.y, dx, dy, {});
          for (const [x, y] of r.path) push(x, y, it.dmg, 'hit', { dx, dy, beam: true });
        }
        break;
    }
    return out;
  }

  function computeThreats(S) {
    const tiles = [];
    for (let i = 0; i < W * H; i++) tiles.push({ dmg: 0, path: false, summon: null, src: [], arrows: [], land: false, bomb: false, pit: false });
    for (const e of alive(S)) {
      for (const a of intentArea(S, e)) {
        const T = tiles[idx(a.x, a.y)];
        if (a.role === 'hit') T.dmg += a.dmg;
        if (a.role === 'path') T.path = true;
        if (a.role === 'summon') T.summon = a.type;
        if (a.land) T.land = true;
        if (a.bomb) T.bomb = true;
        if (a.pit) T.pit = true;
        if (a.dx !== undefined && !a.beam) T.arrows.push([a.dx, a.dy]);
        if (a.beam) T.arrows.push([a.dx, a.dy]);
        T.src.push(e.uid);
      }
    }
    return tiles;
  }

  function resolveIntent(S, e, ev) {
    const it = e.intent; e.intent = null;
    if (!it) return;
    switch (it.k) {
      case 'melee': {
        const x = e.x + it.dx, y = e.y + it.dy;
        ev.push({ t: 'atk', uid: e.uid, k: 'melee', tiles: [[x, y]], dx: it.dx, dy: it.dy });
        hitTile(S, x, y, it.dmg, ev, e);
        break;
      }
      case 'sweep': {
        const tiles = sweepTiles(S, e, it);
        ev.push({ t: 'atk', uid: e.uid, k: 'melee', tiles, dx: it.dx, dy: it.dy });
        for (const [x, y] of tiles) hitTile(S, x, y, it.dmg, ev, e);
        break;
      }
      case 'burst':
        e.burstDmg = it.dmg;
        killEnemy(S, e, ev, 'self');
        break;
      case 'shoot': {
        const r = traceLine(S, e.x, e.y, it.dx, it.dy, { stopAtEntity: true });
        ev.push({ t: 'atk', uid: e.uid, k: 'shoot', tiles: r.path, dx: it.dx, dy: it.dy });
        if (r.hit) hitTile(S, r.hit[0], r.hit[1], it.dmg, ev, e);
        break;
      }
      case 'bomb': {
        const tiles = PLUS.map(([dx, dy]) => [it.x + dx, it.y + dy]).filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
        ev.push({ t: 'atk', uid: e.uid, k: 'bomb', tiles });
        for (const [x, y] of tiles) hitTile(S, x, y, it.dmg, ev, e);
        e.cd = 1;
        break;
      }
      case 'charge': {
        ev.push({ t: 'atk', uid: e.uid, k: 'charge', tiles: [] });
        for (let guard = 0; guard < 20; guard++) {
          const nx = e.x + it.dx, ny = e.y + it.dy;
          const t = tileAt(S, nx, ny);
          if (t === '#') {
            e.stun = true;
            ev.push({ t: 'bump', uid: e.uid, dx: it.dx, dy: it.dy });
            ev.push({ t: 'text', x: e.x, y: e.y, s: '撞牆暈眩' });
            break;
          }
          if (t === 'o') {
            e.x = nx; e.y = ny; ev.push({ t: 'move', uid: e.uid, x: nx, y: ny, fast: true });
            killEnemy(S, e, ev, 'pit');
            break;
          }
          const o = entityAt(S, nx, ny);
          if (o) {
            ev.push({ t: 'bump', uid: e.uid, dx: it.dx, dy: it.dy });
            hitTile(S, nx, ny, it.dmg, ev, e);
            break;
          }
          e.x = nx; e.y = ny;
          ev.push({ t: 'move', uid: e.uid, x: nx, y: ny, fast: true });
        }
        break;
      }
      case 'slam': {
        const tiles = D8.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
        ev.push({ t: 'atk', uid: e.uid, k: 'slam', tiles });
        for (const [x, y] of tiles) hitTile(S, x, y, it.dmg, ev, e);
        break;
      }
      case 'summon': {
        ev.push({ t: 'atk', uid: e.uid, k: 'summon', tiles: it.tiles.map(([x, y]) => [x, y]) });
        for (const [x, y, type] of it.tiles) if (isEmpty(S, x, y)) spawnEnemy(S, type, x, y, ev, true);
        if (e.type === 'warlock') e.cd = 3;
        break;
      }
      case 'leap': {
        const ring = D8.map(([dx, dy]) => [it.x + dx, it.y + dy]).filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
        const o = entityAt(S, it.x, it.y);
        if (o === 'P') {
          ev.push({ t: 'atk', uid: e.uid, k: 'leap', tiles: [[it.x, it.y]] });
          damagePlayer(S, 2, ev);
        } else {
          if (o) killEnemy(S, o, ev, 'enemy');
          e.x = it.x; e.y = it.y;
          ev.push({ t: 'move', uid: e.uid, x: it.x, y: it.y, jump: true });
        }
        if (S.hp <= 0) break;
        ev.push({ t: 'atk', uid: e.uid, k: 'slam', tiles: ring });
        for (const [x, y] of ring) if (!(x === e.x && y === e.y)) hitTile(S, x, y, 1, ev, e);
        break;
      }
      case 'beam': {
        const all = [];
        for (const [dx, dy] of it.dirs) all.push(...traceLine(S, e.x, e.y, dx, dy, {}).path);
        ev.push({ t: 'atk', uid: e.uid, k: 'beam', tiles: all });
        for (const [x, y] of all) hitTile(S, x, y, it.dmg, ev, e);
        break;
      }
    }
  }

  /* ---------- 敵人 AI ---------- */
  function neighborsFree(S, e) {
    const out = [];
    for (const [dx, dy] of D8) { const x = e.x + dx, y = e.y + dy; if (isEmpty(S, x, y)) out.push({ x, y, dx, dy }); }
    return out;
  }
  function moveEnemy(S, e, x, y, ev) {
    if (x === e.x && y === e.y) return;
    e.x = x; e.y = y;
    ev.push({ t: 'move', uid: e.uid, x, y });
  }
  function distMap(S, self) {
    const d = new Array(W * H).fill(Infinity);
    const P = S.player; const q = [[P.x, P.y]]; d[idx(P.x, P.y)] = 0;
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (!isFloor(S, nx, ny)) continue;
        const o = enemyAt(S, nx, ny);
        if (o && o !== self) continue;
        const j = idx(nx, ny);
        if (d[j] !== Infinity) continue;
        d[j] = d[idx(x, y)] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  }
  function stepToward(S, e, ev) {
    const d = distMap(S, e); const P = S.player;
    const cur = d[idx(e.x, e.y)];
    let best = null, bs = Infinity;
    for (const n of neighborsFree(S, e)) {
      const dn = d[idx(n.x, n.y)];
      const s = (dn === Infinity ? 50 + cheb(n, P) : dn) * 100 + ((n.x - P.x) ** 2 + (n.y - P.y) ** 2);
      if (s < bs) { bs = s; best = n; }
    }
    if (!best) return;
    const curScore = (cur === Infinity ? 50 + cheb(e, P) : cur) * 100 + ((e.x - P.x) ** 2 + (e.y - P.y) ** 2);
    if (bs < curScore) moveEnemy(S, e, best.x, best.y, ev);
  }
  function chooseSpot(S, e, scoreFn, ev) {
    let best = { x: e.x, y: e.y }, bs = scoreFn(e.x, e.y) + 0.3;
    for (const n of neighborsFree(S, e)) {
      const s = scoreFn(n.x, n.y);
      if (s > bs) { bs = s; best = n; }
    }
    moveEnemy(S, e, best.x, best.y, ev);
  }
  // 是否與玩家同行/同列，且中間沒有阻擋；回傳方向或 null
  function lineTo(S, from, P, blockPits, self) {
    if (from.x !== P.x && from.y !== P.y) return null;
    if (from.x === P.x && from.y === P.y) return null;
    const dx = Math.sign(P.x - from.x), dy = Math.sign(P.y - from.y);
    let x = from.x + dx, y = from.y + dy;
    while (x !== P.x || y !== P.y) {
      const t = tileAt(S, x, y);
      if (t === '#') return null;
      if (blockPits && t === 'o') return null;
      const o = enemyAt(S, x, y);
      if (o && o !== self) return null;
      x += dx; y += dy;
    }
    return [dx, dy];
  }
  function diagTo(S, from, P) {
    const ax = P.x - from.x, ay = P.y - from.y;
    if (ax === 0 || Math.abs(ax) !== Math.abs(ay)) return null;
    return [Math.sign(ax), Math.sign(ay)];
  }

  function enemyTurn(S, e, ev, canMove) {
    enemyThink(S, e, ev, canMove);
    if (e.elite && e.intent && e.intent.dmg) e.intent.dmg += 1;
  }
  function enemyThink(S, e, ev, canMove) {
    const P = S.player;
    e.intent = null;
    if (e.stun) { e.stun = false; ev.push({ t: 'text', x: e.x, y: e.y, s: '暈眩中' }); return; }
    switch (e.type) {
      case 'imp':
        if (canMove && cheb(e, P) > 1) stepToward(S, e, ev);
        if (cheb(e, P) === 1) e.intent = { k: 'sweep', dx: P.x - e.x, dy: P.y - e.y, dmg: 1 };
        break;
      case 'spiker':
        if (canMove && cheb(e, P) > 1) stepToward(S, e, ev);
        if (cheb(e, P) === 1) e.intent = { k: 'melee', dx: P.x - e.x, dy: P.y - e.y, dmg: 1 };
        break;
      case 'puffer':
        if (canMove && cheb(e, P) > 1) stepToward(S, e, ev);
        if (cheb(e, P) === 1) e.intent = { k: 'burst', dmg: 1 };
        break;
      case 'archer': {
        if (canMove) chooseSpot(S, e, (x, y) => {
          const pos = { x, y }; const d = cheb(pos, P);
          let s = 0;
          if (lineTo(S, pos, P, false, e)) s += 10;
          if (d === 1) s -= 6; else s += 2;
          s -= Math.min(Math.abs(x - P.x), Math.abs(y - P.y));
          return s;
        }, ev);
        const d = lineTo(S, e, P, false, e);
        if (d) e.intent = { k: 'shoot', dx: d[0], dy: d[1], dmg: 1 };
        break;
      }
      case 'brute': {
        if (canMove && !lineTo(S, e, P, true, e)) {
          chooseSpot(S, e, (x, y) => {
            const pos = { x, y };
            if (lineTo(S, pos, P, true, e)) return 10 - cheb(pos, P) * 0.1;
            return -Math.min(Math.abs(x - P.x), Math.abs(y - P.y)) - cheb(pos, P) * 0.2;
          }, ev);
        }
        const d = lineTo(S, e, P, true, e);
        if (d) e.intent = { k: 'charge', dx: d[0], dy: d[1], dmg: 2 };
        break;
      }
      case 'bomber':
        if (canMove) chooseSpot(S, e, (x, y) => {
          const d = cheb({ x, y }, P);
          return (d >= 2 && d <= 3 ? 10 : 0) - (d < 2 ? (2 - d) * 4 : 0) - (d > 3 ? (d - 3) * 2 : 0);
        }, ev);
        if (e.cd > 0) e.cd--;
        else if (cheb(e, P) <= 4) e.intent = { k: 'bomb', x: P.x, y: P.y, dmg: 1 };
        break;
      case 'golem':
        e.tick++;
        if (canMove && e.tick % 2 === 0 && cheb(e, P) > 1) stepToward(S, e, ev);
        if (cheb(e, P) === 1) e.intent = { k: 'slam', dmg: 2 };
        break;
      case 'warlock':
        if (canMove) chooseSpot(S, e, (x, y) => {
          const d = cheb({ x, y }, P);
          return (d >= 3 ? 8 + Math.min(d, 5) : d * 2);
        }, ev);
        if (e.cd > 0) e.cd--;
        else {
          const n = neighborsFree(S, e).filter((t) => !spawnAt(S, t.x, t.y));
          if (n.length) { const t = pick(S, n); e.intent = { k: 'summon', tiles: [[t.x, t.y, 'imp']] }; }
        }
        break;
      case 'kboss': {
        e.tick++;
        if (e.tick % 4 === 0) {
          const n = shuffle(S, neighborsFree(S, e).filter((t) => !spawnAt(S, t.x, t.y))).slice(0, 2);
          if (n.length) { e.intent = { k: 'summon', tiles: n.map((t) => [t.x, t.y, 'imp']) }; break; }
        }
        let best = null, bs = -Infinity;
        for (const [dx, dy] of KN) {
          const x = e.x + dx, y = e.y + dy;
          if (!isFloor(S, x, y)) continue;
          const pos = { x, y }; const d = cheb(pos, P);
          const o = enemyAt(S, x, y);
          let s = d === 0 ? 100 : d === 1 ? 60 : 40 - d * 8;
          if (o) s -= 15;
          s += rnd(S) * 0.5;
          if (s > bs) { bs = s; best = pos; }
        }
        if (best) e.intent = { k: 'leap', x: best.x, y: best.y };
        break;
      }
      case 'qboss': {
        e.tick++;
        if (e.tick % 3 === 0) {
          if (canMove) {
            const t = randomEmpty(S, (x, y) => cheb({ x, y }, P) >= 3);
            if (t) { e.x = t.x; e.y = t.y; ev.push({ t: 'move', uid: e.uid, x: t.x, y: t.y, blink: true }); }
          }
          const n = shuffle(S, neighborsFree(S, e).filter((t) => !spawnAt(S, t.x, t.y))).slice(0, 2);
          if (n.length) { e.intent = { k: 'summon', tiles: n.map((t, i) => [t.x, t.y, i === 0 ? 'archer' : 'imp']) }; break; }
        }
        const aligned = (pos) => (pos.x === P.x || pos.y === P.y || Math.abs(pos.x - P.x) === Math.abs(pos.y - P.y));
        if (canMove && !aligned(e)) {
          chooseSpot(S, e, (x, y) => (aligned({ x, y }) ? 10 : 0) - Math.abs(cheb({ x, y }, P) - 3), ev);
        }
        const dirs = (e.x === P.x || e.y === P.y) ? D4 : diagTo(S, e, P) ? DG : (rnd(S) < 0.5 ? D4 : DG);
        e.intent = { k: 'beam', dirs, dmg: 1 };
        break;
      }
    }
  }

  /* ---------- 獎勵 ---------- */
  function relicOpts(S, n) {
    const pool = shuffle(S, Object.keys(RELICS).filter((r) => !has(S, r)));
    return pool.slice(0, n).map((r) => ({ t: 'relic', r }));
  }
  function cardOpt(S, excl) {
    const roll = rnd(S);
    const rar = roll < 0.58 ? 0 : roll < 0.9 ? 1 : 2;
    let pool = Object.keys(CARDS).filter((k) => CARDS[k].r === rar && !excl.includes(k));
    if (!pool.length) pool = Object.keys(CARDS).filter((k) => !excl.includes(k));
    const k = pick(S, pool);
    return { t: 'card', k, plus: S.floor >= 6 && rnd(S) < 0.3 };
  }
  function genRewards(S) {
    const n = 3 + (has(S, 'gambler') ? 1 : 0) + (S.lastPar ? 1 : 0);
    let opts = [];
    if (S.boss) {
      opts = relicOpts(S, n);
      while (opts.length < n) opts.push({ t: 'maxhp', n: 1 });
      return opts;
    }
    opts.push(cardOpt(S, []));
    if (S.deck.some((id) => !S.cards[id].plus)) opts.push({ t: 'upgrade' });
    const r = rnd(S);
    if (r < 0.38) { const ro = relicOpts(S, 1); if (ro.length) opts.push(ro[0]); }
    else if (r < 0.66) opts.push(S.hp < S.maxHp ? { t: 'heal', n: 2 } : { t: 'maxhp', n: 1 });
    else if (r < 0.84 && S.deck.length > 5) opts.push({ t: 'remove' });
    else opts.push({ t: 'maxhp', n: 1 });
    while (opts.length < n) opts.push(cardOpt(S, opts.filter((o) => o.t === 'card').map((o) => o.k)));
    return opts;
  }
  function applyReward(S, i, param) {
    if (S.phase !== 'reward' || !S.rewards) return null;
    const ev = [];
    if (i >= 0) {
      const o = S.rewards[i];
      if (!o) return null;
      switch (o.t) {
        case 'card': addCard(S, o.k, o.plus); break;
        case 'upgrade': {
          const c = S.cards[param];
          if (!c || c.plus || !S.deck.includes(param)) return null;
          c.plus = true; break;
        }
        case 'remove':
          if (!S.deck.includes(param) || S.deck.length <= 3) return null;
          S.deck = S.deck.filter((id) => id !== param); delete S.cards[param]; break;
        case 'relic': addRelic(S, o.r); break;
        case 'heal': healPlayer(S, o.n, ev); break;
        case 'maxhp': S.maxHp += o.n; S.hp += o.n; break;
      }
    } else S.score += 20; // 略過獎勵
    S.justWon = false;
    startFloor(S, S.floor + 1, ev);
    return ev;
  }

  /* ---------- 預覽（滑鼠移到格子上時，模擬結果） ---------- */
  const clone = (S) => JSON.parse(JSON.stringify(S));
  function simulateEnd(T) {
    // 回傳回合結束時玩家會受到的傷害（含增援阻擋）
    const before = T.hp; const ev = [];
    T.phase = 'enemy';
    resolveAttacks(T, ev); cleanup(T);
    if (T.hp > 0) { resolveCracks(T, ev); cleanup(T); }
    if (T.hp > 0) resolveSpawns(T, ev);
    return Math.max(0, before - T.hp);
  }
  function preview(S, hi, x, y) {
    const T = clone(S); const ev = [];
    let r;
    if (hi < 0) r = { killed: false, cont: false };
    else { r = applyCard(T, hi, x, y, ev); if (!r) return null; }
    const res = { T, killed: r.killed, cont: r.cont && T.hand.length > 0, cleared: false, dmg: 0, dead: T.hp <= 0, kills: [] };
    const aliveAfter = new Set(alive(T).map((e) => e.uid));
    res.kills = alive(S).filter((e) => !aliveAfter.has(e.uid)).map((e) => e.uid);
    if (!res.dead && !alive(T).length && !T.spawns.length && !T.reserve.length) { res.cleared = true; return res; }
    if (!res.dead && !res.cont) {
      const T2 = clone(T);
      const hp0 = T2.hp, aegis0 = T2.aegisUsed;
      simulateEnd(T2);
      res.dmg = hp0 - T2.hp;
      res.blocked = !aegis0 && T2.aegisUsed;
      res.dead = T2.hp <= 0;
    }
    return res;
  }

  root.Engine = {
    W, H, D8, KN, CARDS, ENEMIES, RELICS, HEROES,
    newRun, legalTargets, playCard, waitTurn, canWait, applyReward, computeThreats, intentArea, preview,
    isQuick, handSize, hashStr, idx, inb, alive, tileAt, has,
  };
})(typeof window !== 'undefined' ? window : globalThis);
