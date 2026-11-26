/* 棋淵 Abyss Gambit — 介面、動畫、音效 */
(function () {
  'use strict';
  const E = window.Engine;
  const W = E.W, H = E.H;
  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
  const FILES = 'abcdefg';
  const coord = (x, y) => FILES[x] + (H - y);
  const ARROWS = { '0,-1': '↑', '1,0': '→', '0,1': '↓', '-1,0': '←', '1,-1': '↗', '1,1': '↘', '-1,1': '↙', '-1,-1': '↖' };
  const arrowOf = (dx, dy) => ARROWS[dx + ',' + dy] || '';

  /* ---------- 存檔 ---------- */
  const META_KEY = 'qiyuan-meta-v1', RUN_KEY = 'qiyuan-run-v1';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無法存檔時照常遊玩 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const meta = Object.assign({ best: 0, bestFloor: 0, runs: 0, wins: 0, unlocked: ['ranger'], daily: {}, seenHelp: false, sound: true, fast: false, hero: 'ranger' }, store.get(META_KEY) || {});
  const saveMeta = () => store.set(META_KEY, meta);
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- 音效（WebAudio 合成，不需要音檔） ---------- */
  const Sfx = (() => {
    let ctx = null;
    function ac() {
      if (!meta.sound) return null;
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, d, type, v, f2, delay) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.05, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + d + 0.03);
    }
    function noise(d, v, freq) {
      const c = ac(); if (!c) return;
      const len = Math.floor(c.sampleRate * d);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1000;
      const g = c.createGain(); g.gain.value = v || 0.1;
      s.connect(f).connect(g).connect(c.destination);
      s.start();
    }
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    return {
      select() { tone(660, 0.05, 'triangle', 0.03); },
      move() { tone(420, 0.06, 'triangle', 0.04, 560); },
      jump() { tone(260, 0.14, 'triangle', 0.05, 720); },
      blink() { tone(1100, 0.14, 'sine', 0.035, 260); },
      hit() { noise(0.07, 0.16, 1400); tone(170, 0.08, 'square', 0.025, 90); },
      kill(n) {
        const semi = scale[Math.min(scale.length - 1, Math.max(0, n - 1))];
        const f = 523 * Math.pow(2, semi / 12);
        tone(f, 0.16, 'triangle', 0.06); tone(f * 2, 0.2, 'sine', 0.025, null, 0.04);
      },
      hurt() { tone(160, 0.32, 'sawtooth', 0.06, 55); noise(0.2, 0.12, 300); },
      enemyAtk(k) {
        if (k === 'shoot' || k === 'beam') tone(900, 0.12, 'sawtooth', 0.025, 300);
        else if (k === 'bomb' || k === 'burst') { noise(0.3, 0.2, 200); tone(90, 0.3, 'sine', 0.08, 40); }
        else if (k === 'summon') tone(300, 0.3, 'sine', 0.04, 900);
        else if (k === 'charge') noise(0.2, 0.12, 500);
        else noise(0.08, 0.1, 900);
      },
      spawn() { tone(200, 0.18, 'sine', 0.035, 420); },
      heal() { tone(660, 0.12, 'sine', 0.05); tone(990, 0.18, 'sine', 0.04, null, 0.08); },
      block() { tone(1300, 0.18, 'triangle', 0.04, 1500); },
      collapse() { noise(0.45, 0.18, 160); tone(70, 0.45, 'sine', 0.07, 35); },
      fall() { tone(500, 0.4, 'sine', 0.05, 60); },
      undo() { tone(700, 0.1, 'sine', 0.04, 350); },
      clear() { [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.05, null, i * 0.08)); },
      lose() { [7, 4, 0, -5].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.35, 'triangle', 0.05, null, i * 0.14)); },
      win() { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.3, 'triangle', 0.05, null, i * 0.07)); },
    };
  })();

  /* ---------- 狀態 ---------- */
  let S = null;            // 目前這一局
  let demo = true;         // 標題畫面後面的示範盤面
  let hist = [];           // 回溯用快照
  let sel = -1, hover = null, pendingTap = null, focusUid = null, curPreview = null;
  let busy = false, runRecorded = false, dispHp = 0, comboKills = 0, animBase = null;
  const touch = window.matchMedia && matchMedia('(hover: none)').matches;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = meta.fast ? 0.55 : 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed));

  const cellsEl = $('#cells'), piecesEl = $('#pieces'), ghostsEl = $('#ghosts'), fxEl = $('#fx');
  const handEl = $('#hand'), hintEl = $('#hint'), infoEl = $('#info'), logEl = $('#log');
  const overlay = $('#overlay'), panel = $('#panel');
  const cells = [];
  for (let i = 0; i < W * H; i++) { const c = mk('div', 'cell'); c.dataset.i = i; cellsEl.appendChild(c); cells.push(c); }

  /* ---------- 棋盤繪製 ---------- */
  function renderMarks(X, o) {
    const thr = o.threats;
    const tmap = new Map();
    (o.targets || []).forEach((t) => tmap.set(E.idx(t.x, t.y), t));
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i / W) | 0;
      const c = cells[i];
      const t = X.tiles[i];
      let cls = 'cell ' + (t === '#' ? 'w' : t === 'o' ? 'p' : 'f') + (((x + y) & 1) ? ' alt' : '');
      let html = '';
      if (t === '.') {
        const sp = X.spawns.find((s) => s.x === x && s.y === y);
        if (sp) { cls += ' spawn'; html += `<span class="sp-ring"></span><span class="sp-ico">${E.ENEMIES[sp.type].icon}</span>`; }
        if (X.cracks && X.cracks.some((k) => k.x === x && k.y === y)) cls += ' crack';
      }
      if (thr) {
        const T = thr[i];
        if (T.dmg > 0) { cls += ' thr'; html += `<i class="dmg">${T.dmg}</i>`; }
        else if (T.path) cls += ' path';
        if (T.summon) { cls += ' sum'; html += `<span class="sum-ico">${E.ENEMIES[T.summon].icon}</span>`; }
        if (T.land) cls += ' land';
        if (T.bomb) html += '<span class="bomb-ico">✸</span>';
        if (T.arrows.length && (T.dmg > 0 || T.path)) html += `<i class="arr">${arrowOf(T.arrows[0][0], T.arrows[0][1])}</i>`;
        if (focusUid != null && (T.dmg > 0 || T.path || T.summon)) cls += T.src.includes(focusUid) ? ' focus' : ' dim';
      }
      const tg = tmap.get(i);
      if (tg) cls += (tg.kind === 'attack' || tg.kind === 'push') ? ' ta' : tg.kind === 'swap' ? ' ta ta-swap' : tg.kind === 'self' ? ' tself' : ' tg';
      if (o.hoverIdx === i && tg) cls += ' hov';
      if (c.className !== cls) c.className = cls;
      if (c._h !== html) { c.innerHTML = html; c._h = html; }
    }
  }

  const pieceEls = new Map();
  let playerEl = null;
  function setPos(n, x, y, instant) {
    if (instant) {
      n.style.transition = 'none';
      n.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      void n.offsetWidth;
      n.style.transition = '';
    } else n.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    n._x = x; n._y = y;
  }
  function enemyHTML(type) {
    const d = E.ENEMIES[type];
    return `<div class="disc"><span class="ico">${d.icon}</span></div><div class="pips"></div><div class="badge" hidden></div>`;
  }
  function makeEnemyEl(uid, type, x, y) {
    const n = mk('div', 'piece enemy t-' + type, enemyHTML(type));
    n.dataset.uid = uid;
    piecesEl.appendChild(n);
    pieceEls.set(uid, n);
    setPos(n, x, y, true);
    return n;
  }
  function renderPips(n, hp, max) {
    const p = n.querySelector('.pips'); if (!p) return;
    let h = '';
    if (max > 6) h = `<b>${Math.max(0, hp)}</b>`;
    else for (let i = 0; i < max; i++) h += `<i class="${i < hp ? '' : 'off'}"></i>`;
    p.innerHTML = h; n._hp = hp; n._max = max;
  }
  function ensurePlayer() {
    if (!playerEl) {
      playerEl = mk('div', 'piece player', '<div class="disc"><span class="ico">♚</span></div>');
      piecesEl.appendChild(playerEl);
      setPos(playerEl, S.player.x, S.player.y, true);
    }
  }
  function rebuildPieces() {
    piecesEl.innerHTML = ''; ghostsEl.innerHTML = ''; fxEl.innerHTML = '';
    pieceEls.clear(); playerEl = null;
  }
  function renderPieces(threats, kills) {
    ensurePlayer();
    if (playerEl._x !== S.player.x || playerEl._y !== S.player.y) setPos(playerEl, S.player.x, S.player.y);
    const seen = new Set();
    for (const e of S.enemies) {
      if (e.dead) continue;
      seen.add(e.uid);
      let n = pieceEls.get(e.uid);
      if (!n) n = makeEnemyEl(e.uid, e.type, e.x, e.y);
      else if (n._x !== e.x || n._y !== e.y) setPos(n, e.x, e.y);
      const d = E.ENEMIES[e.type];
      let cls = 'piece enemy t-' + e.type + (e.elite ? ' elite' : '') + (d.boss ? ' boss' : '');
      const T = threats && threats[E.idx(e.x, e.y)];
      if (T && T.dmg > 0 && T.src.some((u) => u !== e.uid)) cls += ' doomed';
      if (focusUid === e.uid) cls += ' focused';
      if (kills && kills.includes(e.uid)) cls += ' marked';
      if (n.className !== cls) n.className = cls;
      if (n._hp !== e.hp || n._max !== e.maxHp) renderPips(n, e.hp, e.maxHp);
      const b = n.querySelector('.badge');
      let bt = '';
      if (e.stun) bt = '暈';
      else if (e.type === 'warlock' && !e.intent) bt = String(e.cd + 1);
      else if (e.type === 'bomber' && e.cd > 0 && !e.intent) bt = '歇';
      b.hidden = !bt; b.textContent = bt;
    }
    for (const [uid, n] of pieceEls) if (!seen.has(uid)) { n.remove(); pieceEls.delete(uid); }
  }
  function renderGhosts(p) {
    ghostsEl.innerHTML = '';
    if (!p) return;
    const T = p.T;
    if (T.player.x !== S.player.x || T.player.y !== S.player.y) {
      const g = mk('div', 'piece player', '<div class="disc"><span class="ico">♚</span></div>');
      setPos(g, T.player.x, T.player.y, true); ghostsEl.appendChild(g);
    }
    for (const e of T.enemies) {
      const o = S.enemies.find((z) => z.uid === e.uid);
      if (o && (o.x !== e.x || o.y !== e.y)) {
        const g = mk('div', 'piece enemy', enemyHTML(e.type));
        setPos(g, e.x, e.y, true); ghostsEl.appendChild(g);
      }
    }
  }

  function refresh() {
    if (!S) return;
    const thr = E.computeThreats(S);
    const targets = sel >= 0 && !busy ? E.legalTargets(S, sel) : [];
    let X = S, th = thr;
    curPreview = null;
    if (sel >= 0 && hover != null && !busy) {
      const x = hover % W, y = (hover / W) | 0;
      if (targets.some((t) => t.x === x && t.y === y)) {
        const p = E.preview(S, sel, x, y);
        if (p) { curPreview = p; X = p.T; th = E.computeThreats(p.T); }
      }
    }
    renderMarks(X, { threats: busy ? null : th, targets, hoverIdx: hover });
    renderPieces(thr, curPreview && curPreview.kills);
    renderGhosts(curPreview);
    renderHint();
  }

  function renderHint() {
    let s = '', cls = 'hint';
    if (demo) s = '';
    else if (busy) s = S.phase === 'enemy' ? '敵方行動中……' : '';
    else if (S.phase !== 'player') s = '';
    else if (curPreview) { const r = previewText(curPreview); s = r.s; cls += ' ' + r.cls; }
    else if (sel >= 0) s = `選擇「${E.CARDS[S.cards[S.hand[sel]].k].name}」的落點：綠點是移動，金圈是攻擊。` + (touch ? '點一下預覽，再點一次確認。' : '滑過去可以預覽結果。');
    else if (S.chain > 0) { s = `連鎖 ×${S.chain}！可以再出一張牌，或結束回合。`; cls += ' warn'; }
    else if (S.played > 0) s = '迅捷牌不會結束回合，可以繼續出牌或結束回合。';
    else if (!S.hand.some((_, i) => E.legalTargets(S, i).length)) s = '手上沒有能出的牌，只能結束回合。';
    else s = '選一張牌出手（每回合至少一張）。擊殺敵人就能再出一張。';
    hintEl.className = cls; hintEl.textContent = s;
  }
  function previewText(p) {
    const now = S.hp - p.T.hp;
    const total = now + (p.dmg || 0);
    const kills = p.kills.length;
    const kt = kills > 1 ? `擊殺 ${kills} 個！` : kills ? '擊殺！' : '';
    if (p.dead) return { cls: 'bad', s: '這一步會讓你倒下！' };
    if (p.cleared) return { cls: 'good', s: '✦ 這一步就能清空本層！' + (now > 0 ? `（受到 ${now} 傷害）` : '') };
    if (p.cont) return { cls: now > 0 ? 'warn' : 'good', s: (kt ? kt + '可以再出一張牌' : '迅捷：出完還能再出一張') + (now > 0 ? ` · 受到 ${now} 傷害` : '') };
    return { cls: total > 0 ? 'bad' : 'ok', s: (kt ? kt + ' ' : '') + '回合結束 · ' + (total > 0 ? `你會受到 ${total} 傷害` : (p.blocked ? '聖印會擋下這次傷害' : '這裡安全')) };
  }

  /* ---------- 手牌 ---------- */
  function patternHTML(k, plus) {
    const m = new Map();
    const set = (x, y, t) => { if (Math.abs(x) <= 2 && Math.abs(y) <= 2) m.set(x + ',' + y, t); };
    const D8 = E.D8, D4 = D8.slice(0, 4), DG = D8.slice(4);
    switch (k) {
      case 'king': D8.forEach(([x, y]) => set(x, y, 'm')); break;
      case 'knight': E.KN.forEach(([x, y]) => set(x, y, 'm')); break;
      case 'rook': D4.forEach(([x, y]) => { set(x, y, 'm'); set(x * 2, y * 2, 'l'); }); break;
      case 'bishop': DG.forEach(([x, y]) => { set(x, y, 'm'); set(x * 2, y * 2, 'l'); }); break;
      case 'queen': D8.forEach(([x, y]) => { set(x, y, 'm'); set(x * 2, y * 2, 'l'); }); break;
      case 'leap': D8.forEach(([x, y]) => set(x * 2, y * 2, 'm')); break;
      case 'shove': D8.forEach(([x, y]) => set(x, y, 'p')); break;
      case 'swap': for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(x, y, 's'); break;
      case 'whirl': D8.forEach(([x, y]) => set(x, y, 'a')); break;
      case 'lance': D4.forEach(([x, y]) => { set(x, y, 'a'); set(x * 2, y * 2, 'a'); }); break;
      case 'blink': for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(x, y, 'm'); break;
    }
    set(0, 0, 'c');
    let h = '<span class="pat">';
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) h += `<i class="${m.get(x + ',' + y) || ''}"></i>`;
    return h + '</span>';
  }
  function cardHTML(c, i) {
    const d = E.CARDS[c.k];
    return `${i != null ? `<span class="key">${i + 1}</span>` : ''}<span class="glyph">${d.n}</span><span class="cname">${d.name}${c.plus ? '<sup>+</sup>' : ''}</span>${patternHTML(c.k, c.plus)}${E.isQuick(c) ? '<span class="tag">迅捷</span>' : ''}${c.plus ? '<span class="seal">升</span>' : ''}`;
  }
  function cardEl(c, i, tag) {
    const n = mk(tag || 'div', 'card r' + E.CARDS[c.k].r + (c.plus ? ' plus' : '') + (E.isQuick(c) ? ' quick' : ''), cardHTML(c, i));
    return n;
  }
  function renderHand() {
    handEl.innerHTML = '';
    if (!S || demo) return;
    if (!S.hand.length) { handEl.innerHTML = '<div class="hand-empty">手牌已用完</div>'; return; }
    S.hand.forEach((id, i) => {
      const c = S.cards[id];
      const n = cardEl(c, i, 'button');
      n.type = 'button';
      const ok = S.phase === 'player' && !busy && E.legalTargets(S, i).length > 0;
      if (!ok) n.classList.add('off');
      if (i === sel) n.classList.add('sel');
      n.setAttribute('aria-label', E.CARDS[c.k].name + (c.plus ? '+' : ''));
      n.addEventListener('click', () => selectCard(i));
      n.addEventListener('mouseenter', () => showCardInfo(c));
      handEl.appendChild(n);
    });
  }
  function renderPile() {
    const p = $('#pile');
    if (!S || demo) { p.innerHTML = ''; return; }
    let h = `<span>牌庫 <b>${S.draw.length}</b></span><span>棄牌 <b>${S.discard.length}</b></span>`;
    if (E.has(S, 'lantern')) {
      const next = S.draw.slice(-3).reverse().map((id) => E.CARDS[S.cards[id].k].n).join(' ');
      h += `<span title="先知之燈：接下來會抽到的牌">接下來 <span class="next">${next || '洗牌'}</span></span>`;
    }
    p.innerHTML = h;
  }

  /* ---------- HUD ---------- */
  function renderHearts(hp) {
    const el = $('#hp');
    let h = '';
    for (let i = 0; i < S.maxHp; i++) h += `<i class="${i < hp ? '' : 'off'}">♥</i>`;
    el.innerHTML = h;
  }
  function renderHUD() {
    if (!S) return;
    dispHp = S.hp;
    renderHearts(S.hp);
    $('#floor').textContent = S.floor > 10 ? '無盡 ' + S.floor : S.floor + (S.boss ? ' 首領' : '');
    $('#turn').textContent = S.turn;
    const collapsing = S.turn >= S.par;
    $('#par').textContent = collapsing ? '崩塌中' : '/ ' + S.par;
    $('#par').title = '在標準回合內清場可以多一個獎勵選項；超過後地面會開始崩塌';
    $('#turnStat').classList.toggle('collapse', collapsing);
    $('#score').textContent = S.score;
    $('#relics').innerHTML = S.relics.map((r) => `<button class="relic" type="button" data-relic="${r}" title="${E.RELICS[r].name}：${E.RELICS[r].desc}">${E.RELICS[r].icon}</button>`).join('');
    $('#undoLeft').textContent = '· ' + S.undoLeft;
    const canEnd = !demo && !busy && E.canWait(S);
    const btn = $('#btnEnd');
    btn.disabled = !canEnd;
    btn.classList.toggle('pulse', canEnd && (S.chain > 0 || !S.hand.some((_, i) => E.legalTargets(S, i).length)));
    $('#btnUndo').disabled = demo || busy || !hist.length || S.phase === 'reward';
    $('#btnSound').textContent = meta.sound ? '音效 開' : '音效 關';
    $('#btnSpeed').textContent = speed < 1 ? '快速' : '正常';
  }
  $('#relics').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-relic]'); if (b) showRelicInfo(b.dataset.relic); });
  $('#relics').addEventListener('click', (e) => { const b = e.target.closest('[data-relic]'); if (b) showRelicInfo(b.dataset.relic); });

  function fullRender() {
    if (!S) return;
    renderHUD(); refresh(); renderHand(); renderPile();
    if (!infoEl.dataset.pinned) infoDefault();
  }

  /* ---------- 資訊欄 ---------- */
  function intentText(e) {
    const it = e.intent;
    if (!it) {
      if (e.stun) return '暈眩中，這回合不會行動。';
      if (e.type === 'warlock') return `召喚倒數：${e.cd + 1} 回合。`;
      if (e.type === 'bomber' && e.cd > 0) return '剛丟完炸彈，正在休息。';
      return '正在移動，還沒鎖定攻擊。';
    }
    const a = it.dx !== undefined ? arrowOf(it.dx, it.dy) : '';
    switch (it.k) {
      case 'melee': return `準備攻擊 ${a} 方向的一格（${it.dmg} 傷害）。`;
      case 'sweep': return `準備朝 ${a} 橫掃面前 3 格（${it.dmg} 傷害）。`;
      case 'shoot': return `瞄準 ${a} 方向放箭（${it.dmg} 傷害），會射中路徑上第一個目標。`;
      case 'charge': return `準備朝 ${a} 衝鋒（${it.dmg} 傷害）。`;
      case 'bomb': return `炸彈將落在 ${coord(it.x, it.y)}，十字範圍 ${it.dmg} 傷害。`;
      case 'slam': return `準備重擊周圍 8 格（${it.dmg} 傷害）。`;
      case 'burst': return `即將自爆！周圍 8 格 ${it.dmg} 傷害。`;
      case 'summon': return '正在召喚爪牙（紫圈處）。';
      case 'leap': return `將跳向 ${coord(it.x, it.y)}：落點 2 傷害、周圍 1 傷害。`;
      case 'beam': return `準備射出四道${it.dirs[0][0] && it.dirs[0][1] ? '斜向' : '直向'}貫穿光束（${it.dmg} 傷害）。`;
    }
    return '';
  }
  function infoDefault() {
    if (!S || demo) { infoEl.innerHTML = ''; return; }
    let h = `<h4>${S.boss ? '首領層' : S.floor > 10 ? '無盡深淵' : '第 ' + S.floor + ' 層'}</h4>`;
    const boss = S.enemies.find((e) => E.ENEMIES[e.type].boss);
    if (boss) h += `<p>${E.ENEMIES[boss.type].name}：${E.ENEMIES[boss.type].desc}</p>`;
    else h += `<p class="muted">敵人 ${S.enemies.length} · 增援 ${S.spawns.length + S.reserve.length}。滑過敵人看它的行為，滑過牌看它的走法。</p>`;
    h += `<div class="legend"><span><i class="lg thr"></i>敵人攻擊</span><span><i class="lg tg"></i>可移動</span><span><i class="lg ta"></i>可攻擊</span><span><i class="lg sp"></i>增援點</span><span><i class="lg cr"></i>即將崩塌</span><span><i class="lg pit"></i>深淵</span></div>`;
    infoEl.innerHTML = h;
  }
  function showTileInfo(i) {
    if (!S || demo || i == null) { infoDefault(); return; }
    const x = i % W, y = (i / W) | 0;
    const e = S.enemies.find((z) => !z.dead && z.x === x && z.y === y);
    const thr = E.computeThreats(S)[i];
    let h = '';
    if (e) {
      const d = E.ENEMIES[e.type];
      h += `<div class="info-head"><span class="info-ico">${d.icon}</span><div><b>${d.name}${e.elite ? ' <em class="elite-tag">精英</em>' : ''}</b><small>${coord(x, y)} · 生命 ${e.hp}/${e.maxHp}</small></div></div><p>${d.desc}</p>`;
      if (e.elite) h += '<p class="muted">精英：生命 +1，攻擊傷害 +1。</p>';
      h += `<p class="intent">${intentText(e)}</p>`;
    } else if (S.player.x === x && S.player.y === y) {
      h += `<div class="info-head"><span class="info-ico you">♚</span><div><b>你（${E.HEROES[S.hero].name}）</b><small>${coord(x, y)} · 生命 ${S.hp}/${S.maxHp}</small></div></div>`;
    } else {
      const t = S.tiles[i];
      h += `<div class="info-head"><div><b>${t === '#' ? '石柱' : t === 'o' ? '深淵' : '地面'}</b><small>${coord(x, y)}</small></div></div>`;
      if (t === 'o') h += '<p>不能踩進去（跳躍類的牌可以越過）。被推進來的敵人會直接墜落。</p>';
      if (t === '#') h += '<p>阻擋移動與箭矢。把敵人推向石柱會造成 1 傷害。</p>';
      const sp = S.spawns.find((s) => s.x === x && s.y === y);
      if (sp) h += `<p class="intent">增援點：回合結束時會出現${E.ENEMIES[sp.type].name}。站在上面可以擋下它，但會受到 1 傷害。</p>`;
      if (S.cracks.some((k) => k.x === x && k.y === y)) h += '<p style="color:var(--violet)">裂痕：回合結束時這格會崩塌成深淵，站在上面會受到 2 傷害。</p>';
    }
    if (thr && thr.dmg > 0) {
      const names = [...new Set(thr.src)].map((u) => { const z = S.enemies.find((q) => q.uid === u); return z ? E.ENEMIES[z.type].name : ''; }).filter(Boolean);
      h += `<p class="warn">注意：回合結束時這格會受到 ${thr.dmg} 傷害（${names.join('、')}）。</p>`;
    }
    infoEl.innerHTML = h;
  }
  function showCardInfo(c) {
    const d = E.CARDS[c.k];
    infoEl.innerHTML = `<div class="info-head"><span class="info-ico card-ico">${d.n}</span><div><b>${d.name}${c.plus ? '+' : ''}</b><small>${['普通', '稀有', '傳說'][d.r]}${E.isQuick(c) ? ' · 迅捷' : ''}</small></div></div><p>${d.desc}</p><p class="${c.plus ? 'intent' : 'muted'}">${c.plus ? '已升級：' : '升級後：'}${d.plus}</p>${E.isQuick(c) ? '<p class="muted">迅捷：打出後不會結束回合。</p>' : ''}`;
  }
  function showRelicInfo(r) {
    const d = E.RELICS[r];
    infoEl.innerHTML = `<div class="info-head"><span class="info-ico relic-ico">${d.icon}</span><div><b>${d.name}</b><small>遺物</small></div></div><p>${d.desc}</p>`;
  }
  function addLog(s) {
    const li = mk('li', null); li.textContent = s;
    logEl.prepend(li);
    while (logEl.children.length > 8) logEl.lastChild.remove();
  }

  /* ---------- 特效 ---------- */
  const pct = (v, n) => (v * 100 / n) + '%';
  function tileFx(x, y, cls, ms) {
    if (!E.inb(x, y)) return;
    const n = mk('div', 'tfx ' + cls);
    n.style.left = pct(x, W); n.style.top = pct(y, H);
    fxEl.appendChild(n); setTimeout(() => n.remove(), ms || 500);
  }
  function floatText(x, y, s, cls) {
    const n = mk('div', 'ft ' + (cls || ''), s);
    n.style.left = pct(x + 0.5, W); n.style.top = pct(y + 0.3, H);
    fxEl.appendChild(n); setTimeout(() => n.remove(), 1100);
  }
  function ringFx(x, y) {
    const n = mk('div', 'ring-fx');
    n.style.left = pct(x - 1, W); n.style.top = pct(y - 1, H);
    fxEl.appendChild(n); setTimeout(() => n.remove(), 500);
  }
  function bumpEl(n, dx, dy, amt) {
    if (!n || reduced) return;
    const d = n.querySelector('.disc'); if (!d) return;
    const a = amt || 28;
    d.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx * a}%, ${dy * a}%)` }, { transform: 'translate(0,0)' }], { duration: 200 * speed, easing: 'ease-out' });
  }
  function shake(strength) {
    if (reduced) return;
    const s = strength || 6;
    $('#frame').animate([{ transform: 'translate(0,0)' }, { transform: `translate(${s}px,${-s / 2}px)` }, { transform: `translate(${-s}px,${s / 2}px)` }, { transform: `translate(${s / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: 280 });
  }
  function particles(x, y, color) {
    if (reduced) return;
    for (let i = 0; i < 10; i++) {
      const n = mk('div', 'spark');
      n.style.left = pct(x + 0.5, W); n.style.top = pct(y + 0.5, H);
      if (color) n.style.background = color;
      fxEl.appendChild(n);
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40;
      n.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r}px)) scale(.2)`, opacity: 0 }], { duration: 450 + Math.random() * 200, easing: 'ease-out' });
      setTimeout(() => n.remove(), 700);
    }
  }
  function projectile(fromX, fromY, toX, toY, beam) {
    const n = mk('div', 'shot' + (beam ? ' beam' : ''));
    fxEl.appendChild(n);
    const dist = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
    const dur = (80 + dist * 35) * speed;
    n.animate([{ transform: `translate(${fromX * 100}%, ${fromY * 100}%)` }, { transform: `translate(${toX * 100}%, ${toY * 100}%)` }], { duration: dur, easing: 'linear' });
    setTimeout(() => n.remove(), dur);
    return dur;
  }
  function zapFx(x1, y1, x2, y2) {
    const b = $('#board').getBoundingClientRect();
    const cw = b.width / W;
    const ax = (x1 + 0.5) * cw, ay = (y1 + 0.5) * cw, bx = (x2 + 0.5) * cw, by = (y2 + 0.5) * cw;
    const n = mk('div', 'zap');
    n.style.left = ax + 'px'; n.style.top = ay + 'px';
    n.style.width = Math.hypot(bx - ax, by - ay) + 'px';
    n.style.transform = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
    fxEl.appendChild(n); setTimeout(() => n.remove(), 450);
  }
  function comboFx(n) {
    const t = ['', '', '連鎖', '三連', '四連', '五連', '六連', '七連'][n] || n + '連';
    const d = mk('div', 'combo', `${t}<small>CHAIN ×${n}</small>`);
    fxEl.appendChild(d); setTimeout(() => d.remove(), 850);
  }
  function banner(eye, main, sub) {
    const b = $('#banner');
    b.innerHTML = `<div class="b-eye">${eye}</div><div class="b-main">${main}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(banner._t); banner._t = setTimeout(() => { b.hidden = true; }, 1500);
  }
  function floorBanner() {
    const boss = S.enemies.find((e) => E.ENEMIES[e.type].boss);
    banner(S.floor > 10 ? '無盡深淵' : S.boss ? '首領層' : '深度', `第 ${S.floor} 層`, boss ? E.ENEMIES[boss.type].name : '');
  }
  let toastT = 0;
  function toast(s) {
    const t = $('#toast'); t.textContent = s; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- 播放引擎事件 ---------- */
  async function animate(ev) {
    let phase = 'player';
    for (const e of ev) {
      switch (e.t) {
        case 'phase':
          phase = e.p;
          if (e.p === 'enemy') {
            comboKills = 0;
            renderMarks(animBase || S, { threats: null });
            renderHint();
            await sleep(160);
          }
          break;
        case 'play': Sfx.select(); break;
        case 'pmove': {
          ensurePlayer();
          if (e.kind === 'blink') {
            playerEl.classList.add('blinking'); Sfx.blink(); await sleep(110);
            setPos(playerEl, e.x, e.y, true); playerEl.classList.remove('blinking'); await sleep(90);
          } else if (e.kind === 'jump') {
            setPos(playerEl, e.x, e.y); Sfx.jump();
            const d = playerEl.querySelector('.disc');
            if (!reduced) d.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 170 * speed });
            await sleep(170);
          } else { setPos(playerEl, e.x, e.y); Sfx.move(); await sleep(e.kind === 'step' ? 90 : 150); }
          break;
        }
        case 'lunge': {
          ensurePlayer();
          bumpEl(playerEl, Math.sign(e.x - playerEl._x), Math.sign(e.y - playerEl._y), 34);
          await sleep(90);
          break;
        }
        case 'move': {
          const n = pieceEls.get(e.uid);
          if (n) {
            if (e.blink) setPos(n, e.x, e.y, true);
            else setPos(n, e.x, e.y);
            if (e.jump) { const d = n.querySelector('.disc'); if (!reduced) d.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 220 * speed }); }
          }
          await sleep(e.fast ? 55 : e.jump ? 200 : 100);
          break;
        }
        case 'bump': bumpEl(pieceEls.get(e.uid), e.dx, e.dy); await sleep(70); break;
        case 'hit': {
          const n = pieceEls.get(e.uid);
          if (n) {
            n.classList.remove('hurt'); void n.offsetWidth; n.classList.add('hurt');
            renderPips(n, (n._hp != null ? n._hp : 1) - e.amt, n._max || 1);
          }
          floatText(e.x, e.y, '-' + e.amt, 'dmg');
          Sfx.hit();
          await sleep(110);
          break;
        }
        case 'die': {
          const n = pieceEls.get(e.uid);
          if (n) {
            pieceEls.delete(e.uid);
            n.classList.add(e.how === 'pit' ? 'falling' : 'dying');
            setTimeout(() => n.remove(), 450);
          }
          if (e.how === 'pit') Sfx.fall();
          else if (e.how !== 'self') { comboKills++; Sfx.kill(comboKills); particles(e.x, e.y, e.how === 'enemy' ? '#e5484d' : null); }
          await sleep(e.how === 'boss' ? 60 : 130);
          break;
        }
        case 'spawn': {
          if (!pieceEls.has(e.uid)) {
            const n = makeEnemyEl(e.uid, e.type, e.x, e.y);
            if (E.ENEMIES[e.type].boss) n.classList.add('boss');
            if (e.elite) n.classList.add('elite');
            renderPips(n, e.hp, e.hp);
            n.classList.add('spawning');
            Sfx.spawn();
            await sleep(140);
          }
          break;
        }
        case 'atk': {
          const n = pieceEls.get(e.uid);
          const k = e.k;
          Sfx.enemyAtk(k);
          if (k === 'shoot' && e.tiles.length && n) {
            const last = e.tiles[e.tiles.length - 1];
            const dur = projectile(n._x, n._y, last[0], last[1]);
            await new Promise((r) => setTimeout(r, dur));
            tileFx(last[0], last[1], 'flash-r');
          } else if (k === 'charge') {
            // 衝鋒用之後的 move 事件表現
          } else {
            if (n && e.dx !== undefined) bumpEl(n, e.dx, e.dy, 30);
            const cls = k === 'summon' ? 'flash-v' : 'flash-r';
            for (const [x, y] of e.tiles) tileFx(x, y, cls);
            if (k === 'bomb' || k === 'burst' || k === 'slam') shake(k === 'slam' ? 7 : 5);
          }
          await sleep(k === 'beam' ? 260 : 200);
          break;
        }
        case 'phit': {
          dispHp = Math.max(0, dispHp - e.amt);
          renderHearts(dispHp);
          const lost = $('#hp').children[dispHp];
          if (lost) lost.classList.add('lost');
          ensurePlayer();
          playerEl.classList.remove('hurt'); void playerEl.offsetWidth; playerEl.classList.add('hurt');
          floatText(e.x, e.y, '-' + e.amt, 'pdmg');
          shake(9);
          if (!reduced) { const v = mk('div', 'vignette'); document.body.appendChild(v); setTimeout(() => v.remove(), 520); }
          Sfx.hurt();
          await sleep(300);
          break;
        }
        case 'pdie': await sleep(400); break;
        case 'heal':
          dispHp = Math.min(S.maxHp, dispHp + e.n); renderHearts(dispHp);
          floatText(e.x, e.y, '+' + e.n, 'heal'); Sfx.heal(); await sleep(160);
          break;
        case 'block': floatText(e.x, e.y, '聖印格擋', 'gold'); Sfx.block(); await sleep(200); break;
        case 'text': floatText(e.x, e.y, e.s, (e.c || 'info') + (e.big ? ' big' : '')); await sleep(e.big ? 260 : 70); break;
        case 'chain': if (e.n >= 2) { comboFx(e.n); } await sleep(60); break;
        case 'ring': ringFx(e.x, e.y); await sleep(80); break;
        case 'lance': {
          for (let i = 1; i <= e.range; i++) tileFx(e.x + e.dx * i, e.y + e.dy * i, 'flash-g', 300);
          ensurePlayer(); bumpEl(playerEl, e.dx, e.dy, 26);
          await sleep(110);
          break;
        }
        case 'zap': zapFx(e.x1, e.y1, e.x2, e.y2); await sleep(120); break;
        case 'spark': shake(4); await sleep(100); break;
        case 'collapse': {
          Sfx.collapse(); shake(6);
          for (const [x, y] of e.tiles) {
            tileFx(x, y, 'collapse', 650);
            if (animBase) animBase.tiles[E.idx(x, y)] = 'o';
            cells[E.idx(x, y)].className = 'cell p'; cells[E.idx(x, y)].innerHTML = ''; cells[E.idx(x, y)]._h = '';
          }
          await sleep(320);
          break;
        }
        case 'clear': Sfx.clear(); banner('清除', `第 ${e.floor} 層`, '深淵暫時安靜了'); await sleep(900); break;
        case 'log': addLog(e.s); break;
      }
    }
  }

  /* ---------- 操作 ---------- */
  function selectCard(i) {
    if (!S || demo || busy || S.phase !== 'player') return;
    if (i < 0 || i >= S.hand.length) return;
    if (sel === i) sel = -1;
    else if (E.legalTargets(S, i).length) { sel = i; Sfx.select(); }
    else { toast('這張牌現在沒有可以走的位置'); return; }
    pendingTap = null; focusUid = null;
    if (sel >= 0) showCardInfo(S.cards[S.hand[sel]]);
    refresh(); renderHand();
  }
  function enemyUidAt(x, y) { const e = S.enemies.find((z) => !z.dead && z.x === x && z.y === y); return e ? e.uid : null; }

  cellsEl.addEventListener('mousemove', (ev) => {
    if (touch || !S || demo || busy) return;
    const c = ev.target.closest('.cell'); if (!c) return;
    const i = +c.dataset.i;
    if (i === hover) return;
    hover = i;
    if (sel < 0) { const x = i % W, y = (i / W) | 0; focusUid = enemyUidAt(x, y); showTileInfo(i); }
    refresh();
  });
  cellsEl.addEventListener('mouseleave', () => {
    if (touch || !S || demo) return;
    hover = null; focusUid = null;
    if (!busy) { refresh(); if (sel < 0) infoDefault(); }
  });
  cellsEl.addEventListener('click', (ev) => {
    if (!S || demo || busy || S.phase !== 'player') return;
    const c = ev.target.closest('.cell'); if (!c) return;
    const i = +c.dataset.i, x = i % W, y = (i / W) | 0;
    if (sel >= 0) {
      const tg = E.legalTargets(S, sel).find((t) => t.x === x && t.y === y);
      if (!tg) {
        sel = -1; pendingTap = null; hover = i; focusUid = enemyUidAt(x, y);
        showTileInfo(i); refresh(); renderHand();
        return;
      }
      if (touch && pendingTap !== i) { pendingTap = i; hover = i; refresh(); return; }
      doPlay(sel, x, y);
    } else {
      hover = i; focusUid = enemyUidAt(x, y);
      showTileInfo(i); refresh();
    }
  });

  async function doPlay(hi, x, y) {
    if (busy) return;
    const snap = JSON.stringify(S), turn = S.turn;
    const card = S.cards[S.hand[hi]];
    const ev = E.playCard(S, hi, x, y);
    if (!ev) return;
    hist.push({ snap, turn });
    addLog(`${E.CARDS[card.k].n}${card.plus ? '+' : ''} → ${coord(x, y)}`);
    await runEvents(ev, JSON.parse(snap));
  }
  async function doWait() {
    if (!S || demo || busy) return;
    if (S.phase !== 'player') return;
    if (!E.canWait(S)) { toast('每回合至少要出一張牌（手上還有能出的牌）'); return; }
    const snap = JSON.stringify(S), turn = S.turn;
    const ev = E.waitTurn(S);
    if (!ev) return;
    hist.push({ snap, turn });
    await runEvents(ev, JSON.parse(snap));
  }
  async function runEvents(ev, pre) {
    busy = true; sel = -1; hover = null; pendingTap = null; focusUid = null; curPreview = null;
    animBase = pre;
    document.body.classList.add('busy');
    ghostsEl.innerHTML = '';
    renderHand(); renderHUD();
    // 動畫期間顯示動作「之前」的生命與地形，事件會一步步更新它們
    dispHp = pre.hp; renderHearts(pre.hp);
    renderMarks(pre, { threats: E.computeThreats(pre) }); renderHint();
    try { await animate(ev); } catch (err) { console.error(err); }
    busy = false;
    document.body.classList.remove('busy');
    delete infoEl.dataset.pinned;
    fullRender();
    afterAction();
  }
  function afterAction() {
    checkUnlocks();
    if (S.phase === 'dead') { store.del(RUN_KEY); setTimeout(showGameOver, 350); Sfx.lose(); return; }
    saveRun();
    if (S.phase === 'reward') {
      setTimeout(() => { if (S.justWon) showVictory(); else showReward(); }, 500);
    }
  }
  function undo() {
    if (!S || demo || busy || !hist.length || S.phase === 'reward') return;
    const h = hist[hist.length - 1];
    const cross = S.turn !== h.turn || S.phase === 'dead';
    if (cross && S.undoLeft <= 0) { toast('本層的回溯次數用完了（同一回合內收回永遠免費）'); return; }
    hist.pop();
    const left = S.undoLeft - (cross ? 1 : 0);
    S = JSON.parse(h.snap);
    S.undoLeft = left;
    sel = -1; hover = null; pendingTap = null; focusUid = null;
    closeOverlay(); rebuildPieces(); fullRender();
    addLog(cross ? '時光倒流：回到上一回合（消耗 1 次）' : '收回一步');
    Sfx.undo(); saveRun();
  }
  function saveRun() { if (S && !demo && S.phase !== 'dead') store.set(RUN_KEY, { S }); }

  /* ---------- 解鎖與紀錄 ---------- */
  function checkUnlocks() {
    if (!S || demo) return;
    const un = (id) => {
      if (!meta.unlocked.includes(id)) { meta.unlocked.push(id); saveMeta(); toast('解鎖新角色：' + E.HEROES[id].name + '！'); }
    };
    if (S.floor >= 4) un('shade');
    if (S.stats.floors >= 5) un('warden');
    if (S.won) un('master');
    if (S.floor > meta.bestFloor) { meta.bestFloor = S.floor; saveMeta(); }
  }
  function recordBest() {
    let nb = false;
    if (S.score > meta.best) { meta.best = S.score; nb = true; }
    if (S.floor > meta.bestFloor) meta.bestFloor = S.floor;
    if (S.daily) { const t = todayStr(); if (!meta.daily[t] || S.score > meta.daily[t]) meta.daily[t] = S.score; }
    saveMeta();
    return nb;
  }
  function finalizeRun() {
    if (!S || demo || runRecorded) return;
    runRecorded = true;
    meta.runs++;
    if (S.won) meta.wins++;
    recordBest();
    store.del(RUN_KEY);
    saveMeta();
  }

  /* ---------- 疊層畫面 ---------- */
  let overlayHandler = null, overlayClosable = false;
  function openOverlay(html, handler, closable) {
    panel.innerHTML = html;
    overlayHandler = handler; overlayClosable = !!closable;
    overlay.hidden = false;
    panel.scrollTop = 0;
    const f = panel.querySelector('.btn.primary, button');
    if (f && !touch) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  function closeOverlay() { overlay.hidden = true; overlayHandler = null; }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && overlayHandler) overlayHandler(b.dataset.action, b.dataset);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay && overlayClosable) closeOverlay(); });

  function statsHTML() {
    const st = S.stats;
    const items = [['分數', S.score], ['到達深度', S.floor], ['擊殺', st.kills], ['借刀殺人', st.friendly], ['推落深淵', st.pit], ['最長連鎖', st.bestChain], ['總回合', st.turns], ['擋下增援', st.blocked]];
    return `<div class="stat-grid">${items.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>`;
  }

  function showTitle() {
    const saved = store.get(RUN_KEY);
    const hasSave = saved && saved.S && saved.S.phase !== 'dead';
    if (!meta.unlocked.includes(meta.hero)) meta.hero = 'ranger';
    const heroes = Object.entries(E.HEROES).map(([id, h]) => {
      const locked = !meta.unlocked.includes(id);
      return `<button type="button" class="hero ${locked ? 'locked' : ''} ${meta.hero === id ? 'sel' : ''}" data-action="hero" data-id="${id}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="hero-name">${h.name}</span><span class="hero-hp">♥ ${h.hp}</span>
        <span class="hero-deck">${h.deck.map((k) => E.CARDS[k].n).join('')}</span>
        ${h.relics.map((r) => `<span class="hero-relic"><i>${E.RELICS[r].icon}</i>${E.RELICS[r].name}</span>`).join('')}
        <span class="hero-desc">${locked ? '未解鎖 · ' + h.unlock : h.desc}</span></button>`;
    }).join('');
    const dailyBest = meta.daily[todayStr()];
    openOverlay(`<div class="title">
      <div class="logo">棋淵</div>
      <div class="logo-sub">ABYSS GAMBIT</div>
      <p class="tagline">手上的每張牌都是一種棋步。擊殺換來下一步，借刀殺人換來生路。</p>
      <div class="heroes">${heroes}</div>
      <div class="title-actions">
        ${hasSave ? `<button type="button" class="btn primary big" data-action="resume">繼續 · 第 ${saved.S.floor} 層</button>` : ''}
        <button type="button" class="btn ${hasSave ? '' : 'primary'} big" data-action="start">${hasSave ? '放棄並重新開始' : '開始下淵'}</button>
        <button type="button" class="btn big" data-action="daily">每日挑戰 · ${todayStr().slice(5).replace('-', '/')}</button>
        <button type="button" class="btn ghost big" data-action="help">規則</button>
      </div>
      <div class="records"><span>最高分 <b>${meta.best}</b></span><span>最深 <b>第 ${meta.bestFloor || 0} 層</b></span><span>已下淵 <b>${meta.runs}</b> 次</span><span>通關 <b>${meta.wins}</b></span>${dailyBest != null ? `<span>今日挑戰 <b>${dailyBest}</b></span>` : ''}</div>
    </div>`, (a, d) => {
      if (a === 'hero') { if (!meta.unlocked.includes(d.id)) { toast('尚未解鎖：' + E.HEROES[d.id].unlock); return; } meta.hero = d.id; saveMeta(); Sfx.select(); showTitle(); }
      if (a === 'start') newGame({ hero: meta.hero, seed: (Math.random() * 2 ** 32) >>> 0 });
      if (a === 'daily') newGame({ hero: 'ranger', seed: E.hashStr('qiyuan-' + todayStr()), daily: true });
      if (a === 'resume') resumeGame(saved.S);
      if (a === 'help') showHelp(showTitle);
    });
  }

  function showHelp(back) {
    openOverlay(`<div class="eyebrow">How to play</div><h2>怎麼玩</h2>
      <ol class="rules">
        <li><b>出牌就是走棋。</b>每回合抽 3 張牌，每張是一種走法：王走一格、騎走日字、車走直線、象走斜線……走到敵人身上就是攻擊。</li>
        <li><b>擊殺就能再走。</b>這一步殺死敵人，就可以馬上再出一張牌；沒殺到，回合就結束。標著「迅捷」的牌也不會結束回合。規劃一條連鎖，一口氣清掉一排敵人！</li>
        <li><b>紅格是敵人要打的地方。</b>所有攻擊都會提前一回合標示，回合結束時別站在紅格上。選好牌後把滑鼠移到落點，會預覽這一步的結果。</li>
        <li><b>借刀殺人。</b>敵人的攻擊也會打到同伴。讓弓手的箭射穿你身後的敵人、把敵人推進紅格；推進深淵（黑洞）的敵人直接墜落。</li>
        <li><b>必須落子。</b>每回合至少要出一張牌，沒出完的牌在回合結束時會被棄掉。</li>
        <li><b>深淵上升。</b>超過標準回合數後，地面會開始出現裂痕，下回合崩塌成深淵。站在上面會受 2 傷害。</li>
        <li><b>增援。</b>虛線圈是下回合要出現的敵人；站上去能擋下它，但要受 1 傷害。</li>
        <li><b>回溯。</b>同一回合內可以任意收回；退回上一回合每層限 1 次。</li>
      </ol>
      <p class="muted">每層結束可以選一項獎勵：新牌、升級、遺物。第 5 與第 10 層有首領，通關後還能挑戰無盡深淵。</p>
      <p class="keys"><kbd>1</kbd>–<kbd>4</kbd> 選牌　<kbd>空白</kbd> 結束回合　<kbd>Z</kbd> 回溯　<kbd>Esc</kbd> 取消</p>
      <div class="title-actions"><button type="button" class="btn primary" data-action="ok">${back ? '知道了' : '開始'}</button></div>`,
    (a) => { if (a === 'ok') { if (typeof back === 'function') back(); else closeOverlay(); } }, typeof back !== 'function');
  }

  function rewardHTML(o, i) {
    const wrap = (vis, title, desc) => `<button type="button" class="ropt" data-action="pick" data-i="${i}">${vis}<b>${title}</b><span>${desc}</span></button>`;
    switch (o.t) {
      case 'card': {
        const d = E.CARDS[o.k];
        return wrap(cardEl({ k: o.k, plus: o.plus }).outerHTML, `新牌：${d.name}${o.plus ? '+' : ''}`, d.desc + (o.plus ? '　升級：' + d.plus : ''));
      }
      case 'upgrade': return wrap('<div class="ropt-ico seal">升</div>', '升級一張牌', '從牌組中選一張牌永久強化。');
      case 'remove': return wrap('<div class="ropt-ico">削</div>', '精簡牌組', '移除一張牌，讓好牌更常出現。');
      case 'relic': { const r = E.RELICS[o.r]; return wrap(`<div class="ropt-ico relic-seal">${r.icon}</div>`, '遺物：' + r.name, r.desc); }
      case 'heal': return wrap('<div class="ropt-ico hp">♥</div>', '休息', `回復 ${o.n} 生命。`);
      case 'maxhp': return wrap('<div class="ropt-ico hp">✚</div>', '強健', `生命上限 +${o.n}，並回復 ${o.n}。`);
    }
    return '';
  }
  function showReward() {
    const bonus = [];
    if (S.lastPar) bonus.push('在標準回合內清場：多一個獎勵選項');
    if (S.lastFlawless) bonus.push('無傷通過 +50 分');
    openOverlay(`<div class="reward center">
      <div class="eyebrow">第 ${S.floor} 層 · 清除</div>
      <h2>${S.boss ? '選擇一件首領遺物' : '選擇一項獎勵'}</h2>
      ${bonus.length ? `<div class="bonus">${bonus.join(' · ')}</div>` : ''}
      <div class="rewards">${S.rewards.map(rewardHTML).join('')}</div>
      <button type="button" class="btn ghost" data-action="skip">略過（+20 分）</button></div>`,
    (a, d) => {
      if (a === 'skip') takeReward(-1);
      if (a === 'pick') {
        const i = +d.i, o = S.rewards[i];
        if (o.t === 'upgrade' || o.t === 'remove') showDeckPick(i, o.t);
        else takeReward(i);
      }
    });
  }
  function showDeckPick(i, mode) {
    const ids = S.deck.filter((id) => mode === 'remove' || !S.cards[id].plus);
    const items = ids.map((id) => {
      const c = S.cards[id], d = E.CARDS[c.k];
      return `<div class="deck-pick"><button type="button" class="card r${d.r}${c.plus ? ' plus' : ''}" data-action="card" data-id="${id}">${cardHTML(c)}</button><span>${mode === 'upgrade' ? d.plus : d.desc}</span></div>`;
    }).join('');
    openOverlay(`<div class="center"><div class="eyebrow">${mode === 'upgrade' ? '升級' : '精簡'}</div>
      <h2>${mode === 'upgrade' ? '選一張牌升級' : '選一張牌移除'}</h2>
      <div class="deck-grid">${items}</div>
      <button type="button" class="btn ghost" data-action="back">返回</button></div>`,
    (a, d) => {
      if (a === 'back') showReward();
      if (a === 'card') takeReward(i, +d.id);
    });
  }
  function takeReward(i, param) {
    const ev = E.applyReward(S, i, param);
    if (!ev) { toast('無法選擇這個獎勵'); return; }
    hist = [];
    closeOverlay(); rebuildPieces();
    delete infoEl.dataset.pinned;
    fullRender(); floorBanner(); Sfx.spawn();
    addLog(`進入第 ${S.floor} 層`);
    checkUnlocks(); saveRun();
  }

  function showVictory() {
    Sfx.win();
    openOverlay(`<div class="center"><div class="eyebrow">Victory</div>
      <h2>你征服了棋淵</h2>
      <p class="muted">虛空女王倒下了。深淵之下還有更深的黑暗：要繼續挑戰無盡深淵嗎？分數會繼續累積。</p>
      ${statsHTML()}
      <div class="title-actions"><button type="button" class="btn primary big" data-action="endless">繼續深入（無盡模式）</button><button type="button" class="btn big" data-action="finish">結算並結束</button></div></div>`,
    (a) => {
      if (a === 'endless') { S.justWon = false; saveRun(); showReward(); }
      if (a === 'finish') { finalizeRun(); showSummary('凱旋而歸'); }
    });
  }
  function showSummary(title) {
    openOverlay(`<div class="center"><div class="eyebrow">${S.daily ? '每日挑戰 · ' + todayStr() : E.HEROES[S.hero].name}</div><h2>${title}</h2>${statsHTML()}
      <div class="title-actions"><button type="button" class="btn primary" data-action="again">再來一局</button><button type="button" class="btn ghost" data-action="title">回到標題</button></div></div>`,
    (a) => {
      if (a === 'again') newGame(S.daily ? { hero: 'ranger', seed: E.hashStr('qiyuan-' + todayStr()), daily: true } : { hero: S.hero, seed: (Math.random() * 2 ** 32) >>> 0 });
      if (a === 'title') showTitle();
    });
  }
  function showGameOver() {
    const nb = S.score > meta.best;
    recordBest();
    const canUndo = S.undoLeft > 0 && hist.length > 0;
    openOverlay(`<div class="center"><div class="eyebrow">${S.daily ? '每日挑戰 · ' + todayStr() : E.HEROES[S.hero].name}</div>
      <h2>倒在第 ${S.floor} 層</h2>
      ${nb ? '<div class="newrec">新紀錄！</div>' : ''}
      ${statsHTML()}
      <div class="title-actions">
        ${canUndo ? `<button type="button" class="btn" data-action="undo">回溯上一回合（剩 ${S.undoLeft} 次）</button>` : ''}
        <button type="button" class="btn primary" data-action="again">${S.daily ? '再挑戰一次今日' : '再來一局'}</button>
        <button type="button" class="btn ghost" data-action="title">回到標題</button>
      </div></div>`,
    (a) => {
      if (a === 'undo') { undo(); return; }
      finalizeRun();
      if (a === 'again') newGame(S.daily ? { hero: 'ranger', seed: E.hashStr('qiyuan-' + todayStr()), daily: true } : { hero: S.hero, seed: (Math.random() * 2 ** 32) >>> 0 });
      if (a === 'title') showTitle();
    });
  }
  function showDeck(closeOnly) {
    if (!S || demo) return;
    const cards = S.deck.slice().sort((a, b) => S.cards[a].k.localeCompare(S.cards[b].k)).map((id) => cardEl(S.cards[id]).outerHTML).join('');
    const relics = S.relics.length ? S.relics.map((r) => `<div class="relic-row"><span class="ri">${E.RELICS[r].icon}</span><div><b>${E.RELICS[r].name}</b><small>${E.RELICS[r].desc}</small></div></div>`).join('') : '<p class="muted">還沒有遺物。</p>';
    openOverlay(`<div class="eyebrow">${E.HEROES[S.hero].name} · 牌組 ${S.deck.length} 張</div><h2>牌組與遺物</h2>
      <div class="deck-grid">${cards}</div>
      <div class="relic-list">${relics}</div>
      <div class="title-actions" style="margin-top:16px"><button type="button" class="btn primary" data-action="ok">返回</button></div>`,
    (a) => { if (a === 'ok') closeOverlay(); }, true);
  }
  function showMenu() {
    if (!S || demo) { showTitle(); return; }
    openOverlay(`<div class="center"><h2>選單</h2><p class="muted">進度會自動保存，下次打開可以繼續。</p>
      <div class="title-actions"><button type="button" class="btn primary" data-action="ok">繼續遊戲</button><button type="button" class="btn" data-action="title">回到標題</button><button type="button" class="btn ghost" data-action="quit">放棄這一局</button></div></div>`,
    (a) => {
      if (a === 'ok') closeOverlay();
      if (a === 'title') { saveRun(); showTitle(); }
      if (a === 'quit') { finalizeRun(); showSummary('放棄了這一局'); }
    }, true);
  }

  /* ---------- 開始 / 繼續 ---------- */
  function enterRun() {
    demo = false; hist = []; sel = -1; hover = null; focusUid = null; runRecorded = false;
    logEl.innerHTML = '';
    closeOverlay(); rebuildPieces(); fullRender();
  }
  function newGame(o) {
    S = E.newRun(o);
    enterRun();
    floorBanner();
    addLog(o.daily ? `每日挑戰 ${todayStr()} 開始` : `${E.HEROES[S.hero].name}踏入了棋淵`);
    saveRun();
    if (!meta.seenHelp) { meta.seenHelp = true; saveMeta(); showHelp(true); }
  }
  function resumeGame(saved) {
    S = saved;
    enterRun();
    addLog('繼續上次的進度');
    if (S.phase === 'reward') { if (S.justWon) showVictory(); else showReward(); }
    else floorBanner();
  }

  /* ---------- 按鈕與鍵盤 ---------- */
  $('#btnEnd').addEventListener('click', doWait);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnDeck').addEventListener('click', () => showDeck());
  $('#btnHelp').addEventListener('click', () => showHelp(!S || demo ? showTitle : true));
  $('#btnMenu').addEventListener('click', showMenu);
  $('#btnSound').addEventListener('click', () => { meta.sound = !meta.sound; saveMeta(); renderHUD(); if (meta.sound) Sfx.select(); });
  $('#btnSpeed').addEventListener('click', () => {
    meta.fast = !meta.fast; saveMeta();
    speed = meta.fast ? 0.55 : 1;
    document.documentElement.style.setProperty('--spd', speed);
    renderHUD();
  });
  document.documentElement.style.setProperty('--spd', speed);
  document.addEventListener('keydown', (e) => {
    if (!overlay.hidden) { if (e.key === 'Escape' && overlayClosable) closeOverlay(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= '1' && e.key <= '4') selectCard(+e.key - 1);
    else if (e.key === ' ') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); doWait(); }
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'Escape') { sel = -1; pendingTap = null; focusUid = null; refresh(); renderHand(); infoDefault(); }
  });

  // 開場：標題畫面後面放一盤示範棋局
  S = E.newRun({ seed: (Math.random() * 2 ** 32) >>> 0, hero: 'ranger' });
  demo = true;
  rebuildPieces();
  fullRender();
  showTitle();
})();
