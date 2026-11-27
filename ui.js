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
  const meta = Object.assign({ best: 0, bestFloor: 0, runs: 0, wins: 0, unlocked: ['ranger'], daily: {}, seenHelp: false, sound: true, fast: false, hero: 'ranger',
    shards: 0, towerUnl: [], towerBest: 0, towerRuns: 0, towerHist: [], build: null }, store.get(META_KEY) || {});
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
  let sel = -1, selSkill = -1, hover = null, pendingTap = null, focusUid = null, curPreview = null;
  // 目前選到的是手牌還是技能
  const actionTargets = () => (selSkill >= 0 ? E.skillTargets(S, selSkill) : sel >= 0 ? E.legalTargets(S, sel) : []);
  const actionArg = () => (selSkill >= 0 ? { si: selSkill } : sel);
  const hasSel = () => sel >= 0 || selSkill >= 0;
  let busy = false, runRecorded = false, dispHp = 0, comboKills = 0, animBase = null;
  const touch = window.matchMedia && matchMedia('(hover: none)').matches;
  // 從主畫面打開（全螢幕 web app）：iOS 用 navigator.standalone，其他用 display-mode
  if (navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)) document.documentElement.classList.add('standalone');
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = meta.fast ? 0.55 : 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed));

  const cellsEl = $('#cells'), piecesEl = $('#pieces'), ghostsEl = $('#ghosts'), fxEl = $('#fx');
  const handEl = $('#hand'), hintEl = $('#hint'), infoEl = $('#info'), logEl = $('#log');
  const overlay = $('#overlay'), panel = $('#panel');
  // 窄螢幕時資訊欄在畫面外：點敵人、長按牌時改成從下方浮出
  const narrowMq = window.matchMedia ? matchMedia('(max-width: 900px), (orientation: landscape) and (max-height: 520px)') : null;
  function peek(on) {
    if (on && narrowMq && narrowMq.matches) document.body.classList.add('peek');
    else if (!on) document.body.classList.remove('peek');
  }
  // 長按（觸控）：看說明，不觸發點擊
  let lpTimer = 0, lpFired = false, lpStart = null;
  document.addEventListener('pointerdown', (e) => {
    lpFired = false;
    if (document.body.classList.contains('peek') && !infoEl.contains(e.target)) peek(false);
  }, true);
  // 長按放開後瀏覽器可能補一個 click，落在剛浮出的資訊上，不能讓它馬上關掉
  infoEl.addEventListener('click', () => { if (!eatLongPress()) peek(false); });
  function longPress(container, sel, fn) {
    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const t = e.target.closest(sel); if (!t) return;
      lpStart = { x: e.clientX, y: e.clientY };
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => { lpFired = true; fn(t); peek(true); if (navigator.vibrate) navigator.vibrate(12); }, 430);
    });
    container.addEventListener('pointermove', (e) => { if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 10) clearTimeout(lpTimer); });
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) container.addEventListener(k, () => clearTimeout(lpTimer));
    container.addEventListener('contextmenu', (e) => { if (e.target.closest(sel)) e.preventDefault(); });
  }
  const eatLongPress = () => { if (lpFired) { lpFired = false; return true; } return false; };
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
      const fog = E.hasMod(X, 'dark') && Math.max(Math.abs(x - X.player.x), Math.abs(y - X.player.y)) > 2;
      if (fog) cls += ' fog';
      if (t === '.' && X.fire && X.fire.includes(i)) cls += ' fire';
      if (t === '.') {
        const sp = X.spawns.find((s) => s.x === x && s.y === y);
        if (sp) { cls += ' spawn'; html += `<span class="sp-ring"></span><span class="sp-ico">${E.ENEMIES[sp.type].icon}</span>`; }
        if (X.cracks && X.cracks.some((k) => k.x === x && k.y === y)) cls += ' crack';
      }
      if (thr && !fog) {
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
    return `<div class="disc"><span class="ico">${d.icon}</span></div><div class="pips"></div><div class="badge" hidden></div><div class="affx"></div>`;
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
    playerEl.classList.toggle('guarding', !!S.guard);
    if (playerEl._x !== S.player.x || playerEl._y !== S.player.y) setPos(playerEl, S.player.x, S.player.y);
    const seen = new Set();
    for (const e of S.enemies) {
      if (e.dead) continue;
      seen.add(e.uid);
      let n = pieceEls.get(e.uid);
      if (!n) n = makeEnemyEl(e.uid, e.type, e.x, e.y);
      else if (n._x !== e.x || n._y !== e.y) setPos(n, e.x, e.y);
      const d = E.ENEMIES[e.type];
      let cls = 'piece enemy t-' + e.type + (e.elite ? ' elite' : '') + (d.boss ? ' boss' : '') + (e.shield ? ' shielded' : '');
      const ak = (e.affixes || []).join(',');
      if (n._ak !== ak) { n._ak = ak; const ax = n.querySelector('.affx'); if (ax) ax.innerHTML = (e.affixes || []).map((a) => `<i>${E.AFFIXES[a].n}</i>`).join(''); }
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
    const targets = hasSel() && !busy ? actionTargets() : [];
    let X = S, th = thr;
    curPreview = null;
    if (hasSel() && hover != null && !busy) {
      const x = hover % W, y = (hover / W) | 0;
      if (targets.some((t) => t.x === x && t.y === y)) {
        const p = E.preview(S, actionArg(), x, y);
        if (p) { curPreview = p; X = p.T; th = E.computeThreats(p.T); }
      }
    }
    renderMarks(X, { threats: busy ? null : th, targets, hoverIdx: hover });
    renderPieces(thr, curPreview && curPreview.kills);
    renderGhosts(curPreview);
    renderHint();
    renderSkills();
  }

  function renderHint() {
    let s = '', cls = 'hint';
    if (demo) s = '';
    else if (busy) s = S.phase === 'enemy' ? '敵方行動中……' : '';
    else if (S.phase !== 'player') s = '';
    else if (curPreview) { const r = previewText(curPreview); s = r.s; cls += ' ' + r.cls; }
    else if (selSkill >= 0) s = `技能「${E.SKILLS[S.skills[selSkill].id].name}」：選擇目標。技能不會結束回合。` + (touch ? '點一下預覽，再點一次確認。' : '');
    else if (sel >= 0) {
      const c = S.cards[S.hand[sel]];
      s = E.ctype(c) === 'move' ? `選擇「${E.CARDS[c.k].name}」的落點：綠點是移動，金圈是攻擊。` : `「${E.CARDS[c.k].name}」：選擇出招的方向或目標。`;
      s += touch ? '點一下預覽，再點一次確認。' : '滑過去可以預覽結果。';
    }
    else if (S.bonus > 0) { s = `連鎖 ×${S.chain}！多一次行動：步或技都可以，或結束回合。`; cls += ' warn'; }
    else if (!S.hand.some((_, i) => E.legalTargets(S, i).length)) s = S.played ? '沒有能出的牌了，結束回合吧。' : '手上沒有能出的牌，只能結束回合。';
    else if (S.played > 0) s = S.mv > 0 ? '還可以走一步，或出一招（技）。' : S.st > 0 ? '還可以出一招（技），或結束回合。' : '迅捷牌不佔行動，可以繼續出牌或結束回合。';
    else s = '先走一步（步），再出一招（技）；擊殺換來額外行動。每回合至少出一張。';
    hintEl.className = cls; hintEl.textContent = s;
  }
  function previewText(p) {
    const now = S.hp - p.T.hp;
    const total = now + (p.dmg || 0);
    const kills = p.kills.length;
    const kt = kills > 1 ? `擊殺 ${kills} 個！` : kills ? '擊殺！' : '';
    if (p.dead) return { cls: 'bad', s: '這一步會讓你倒下！' };
    if (p.cleared) return { cls: 'good', s: '✦ 這一步就能清空本層！' + (now > 0 ? `（受到 ${now} 傷害）` : '') };
    if (p.cont) {
      const T = p.T;
      const next = kt ? kt + '多一次行動' : selSkill >= 0 ? '技能不會結束回合' : T.mv > 0 ? '之後還能再走一步或出招' : T.st > 0 ? '之後還能出一招' : '迅捷：出完還能繼續';
      return { cls: now > 0 ? 'warn' : 'good', s: next + (now > 0 ? ` · 受到 ${now} 傷害` : '') };
    }
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
      case 'slash': D8.forEach(([x, y]) => set(x, y, 'af')); [[-1, -1], [0, -1], [1, -1]].forEach(([x, y]) => set(x, y, 'a')); break;
      case 'bolt': (plus ? D8 : D4).forEach(([x, y]) => { set(x, y, 'af'); set(x * 2, y * 2, 'a'); }); break;
      case 'hook': D4.forEach(([x, y]) => { set(x, y, 'p'); set(x * 2, y * 2, 's'); }); break;
      case 'execute': D8.forEach(([x, y]) => set(x, y, 'a')); break;
      case 'guard': D8.forEach(([x, y]) => set(x, y, 'g')); break;
    }
    set(0, 0, 'c');
    let h = '<span class="pat">';
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) h += `<i class="${m.get(x + ',' + y) || ''}"></i>`;
    return h + '</span>';
  }
  // 迅捷要看遺物（鐵壁），局外（命盤、工坊）只看牌本身
  const quickOf = (c) => E.isQuick(c, S && !demo ? S : null);
  function cardHTML(c, i) {
    const d = E.CARDS[c.k];
    return `${i != null ? `<span class="key">${i + 1}</span>` : ''}<span class="ty">${E.TYPE_NAME[d.t]}</span><span class="glyph">${d.n}</span><span class="cname">${d.name}${c.plus ? '<sup>+</sup>' : ''}</span>${patternHTML(c.k, c.plus)}${quickOf(c) ? '<span class="tag">迅捷</span>' : ''}${c.plus ? '<span class="seal">升</span>' : ''}`;
  }
  function cardEl(c, i, tag) {
    const d = E.CARDS[c.k];
    const n = mk(tag || 'div', 'card r' + d.r + ' t-' + d.t + (c.plus ? ' plus' : '') + (quickOf(c) ? ' quick' : ''), cardHTML(c, i));
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
      n.dataset.i = i;
      n.addEventListener('click', () => { if (!eatLongPress()) selectCard(i); });
      n.addEventListener('mouseenter', () => showCardInfo(c));
      handEl.appendChild(n);
    });
  }
  longPress(handEl, '.card', (n) => { if (S && S.hand[+n.dataset.i] != null) showCardInfo(S.cards[S.hand[+n.dataset.i]]); });
  function renderPile() {
    const p = $('#pile');
    if (!S || demo) { p.innerHTML = ''; return; }
    let h = '';
    if (S.phase === 'player') {
      const pip = (on, label, cls) => `<i class="${cls} ${on ? 'on' : ''}">${label}</i>`;
      h += `<span class="acts" title="每回合先走一步（步），再出一招（技）；出招後就不能再走。擊殺換來一次額外行動。">${pip(S.mv > 0, '步', 'mv')}${pip(S.st > 0, '技', 'st')}${S.bonus > 0 ? `<i class="bonus on">+${S.bonus}</i>` : ''}</span>`;
    }
    h += `<span>牌庫 <b>${S.draw.length}</b></span><span>棄牌 <b>${S.discard.length}</b></span>`;
    if (E.has(S, 'lantern')) {
      const next = S.draw.slice(-3).reverse().map((id) => E.CARDS[S.cards[id].k].n).join(' ');
      h += `<span title="先知之燈：接下來會抽到的牌">接下來 <span class="next">${next || '洗牌'}</span></span>`;
    }
    p.innerHTML = h;
  }

  /* ---------- 技能列 ---------- */
  function renderSkills() {
    const box = $('#skills');
    if (!S || demo || !S.skills || !S.skills.length) { if (box._h) { box.innerHTML = ''; box._h = ''; } return; }
    const html = S.skills.map((sk, i) => {
      const d = E.SKILLS[sk.id];
      const usable = !busy && S.phase === 'player' && E.skillTargets(S, i).length > 0;
      return `<button type="button" class="skill ${sk.left > 0 ? 'cd' : ''} ${usable ? '' : 'off'} ${selSkill === i ? 'sel' : ''}" data-si="${i}" title="${d.name}（冷卻 ${d.cd}）：${d.desc}"><kbd>${'QW'[i]}</kbd><span class="sk-n">${d.n}</span><span class="sk-name">${d.name}</span>${sk.left > 0 ? `<span class="sk-cd">${sk.left}</span>` : ''}</button>`;
    }).join('');
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
  }
  $('#skills').addEventListener('click', (e) => { const b = e.target.closest('[data-si]'); if (b && !eatLongPress()) selectSkill(+b.dataset.si); });
  $('#skills').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-si]'); if (b) showSkillInfo(+b.dataset.si); });
  longPress($('#skills'), '[data-si]', (b) => showSkillInfo(+b.dataset.si));
  function showSkillInfo(si) {
    if (!S || !S.skills[si]) return;
    const d = E.SKILLS[S.skills[si].id];
    infoEl.innerHTML = `<div class="info-head"><span class="info-ico relic-ico" style="background:#3a2d6e">${d.n}</span><div><b>${d.name}</b><small>技能 · 冷卻 ${d.cd} 回合</small></div></div><p>${d.desc}</p><p class="muted">技能不會結束回合，也不算「必須落子」的那一張牌。</p>`;
  }
  function selectSkill(i) {
    if (!S || demo || busy || S.phase !== 'player' || !S.skills[i]) return;
    const sk = S.skills[i];
    if (sk.left > 0) { toast(`${E.SKILLS[sk.id].name}還要冷卻 ${sk.left} 回合`); return; }
    const tg = E.skillTargets(S, i);
    if (!tg.length) { toast('現在沒有可以用這個技能的目標'); return; }
    // 只能對自己用的技能（重整、療傷、旋風）直接施放
    if (tg.length === 1 && tg[0].kind === 'self') { doSkill(i, tg[0].x, tg[0].y); return; }
    selSkill = selSkill === i ? -1 : i; sel = -1; pendingTap = null; focusUid = null;
    Sfx.select(); refresh(); renderHand();
  }
  async function doSkill(si, x, y) {
    if (busy) return;
    const snap = JSON.stringify(S), turn = S.turn;
    const ev = E.useSkill(S, si, x, y);
    if (!ev) return;
    hist.push({ snap, turn });
    addLog(`技能 ${E.SKILLS[S.skills[si].id].name}` + (x === S.player.x && y === S.player.y ? '' : ` → ${coord(x, y)}`));
    await runEvents(ev, JSON.parse(snap));
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
    $('#floor').textContent = (!isTower() && S.floor > 10 ? '無盡 ' : '') + S.floor + (S.boss ? ' 首領' : '');
    $('#shardStat').hidden = !isTower() && !S.shards;
    $('#shards').textContent = S.shards || 0;
    $('#mods').innerHTML = (S.mods || []).map(modChip).join('') + (S.task && S.phase !== 'door' ? taskChip() : '');
    $('#turn').textContent = S.turn;
    const collapsing = S.turn >= E.collapseTurn(S);
    $('#par').textContent = collapsing ? '崩塌中' : '/ ' + E.collapseTurn(S);
    $('#par').title = '在標準回合內清場可以多一個獎勵選項；超過後地面會開始崩塌';
    $('#turnStat').classList.toggle('collapse', collapsing);
    $('#score').textContent = S.score;
    $('#relics').innerHTML = S.relics.map((r) => `<button class="relic" type="button" data-relic="${r}" title="${E.RELICS[r].name}：${E.RELICS[r].desc}">${E.RELICS[r].icon}</button>`).join('');
    $('#undoLeft').textContent = '· ' + S.undoLeft;
    const canEnd = !demo && !busy && E.canWait(S);
    const btn = $('#btnEnd');
    btn.disabled = !canEnd;
    btn.classList.toggle('pulse', canEnd && (S.bonus > 0 || !S.hand.some((_, i) => E.legalTargets(S, i).length)));
    $('#btnUndo').disabled = demo || busy || !hist.length || S.phase === 'reward';
    $('#btnSound').textContent = meta.sound ? '音效 開' : '音效 關';
    $('#btnSpeed').textContent = speed < 1 ? '快速' : '正常';
  }
  $('#relics').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-relic]'); if (b) showRelicInfo(b.dataset.relic); });
  $('#relics').addEventListener('click', (e) => { const b = e.target.closest('[data-relic]'); if (b) { showRelicInfo(b.dataset.relic); peek(true); } });
  function showModInfo(m) {
    const d = E.MODS[m];
    infoEl.innerHTML = `<div class="info-head">${modChip(m)}<div><b>${d.name}</b><small>${d.bad ? '樓層干擾' : '樓層祝福'}</small></div></div><p>${d.desc}</p>`;
  }
  function showTaskInfo() {
    if (!S || !S.task) return;
    const d = E.TASKS[S.task];
    infoEl.innerHTML = `<div class="info-head">${taskChip()}<div><b>懸賞：${d.name}</b><small>可選的挑戰</small></div></div><p>${d.desc}</p><p class="muted">達成後這層的魂晶 ×1.5，獎勵多一個選項。</p>`;
  }
  $('#mods').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-mod]'); if (b) showModInfo(b.dataset.mod); else if (e.target.closest('[data-task]')) showTaskInfo(); });
  $('#mods').addEventListener('click', (e) => { const b = e.target.closest('[data-mod]'); if (b) { showModInfo(b.dataset.mod); peek(true); } else if (e.target.closest('[data-task]')) { showTaskInfo(); peek(true); } });

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
      case 'leap': return `將跳向 ${coord(it.x, it.y)}：落點 ${it.dmg || 2} 傷害、周圍 ${(it.dmg || 2) - 1} 傷害。`;
      case 'beam': return `準備射出四道${it.dirs[0][0] && it.dirs[0][1] ? '斜向' : '直向'}貫穿光束（${it.dmg} 傷害）。`;
    }
    return '';
  }
  function infoDefault() {
    if (!S || demo) { infoEl.innerHTML = ''; return; }
    let h = `<h4>${isTower() ? `無盡之塔 · 第 ${S.floor} 層${S.boss ? '（首領）' : ''}` : S.boss ? '首領層' : S.floor > 10 ? '無盡深淵' : '第 ' + S.floor + ' 層'}</h4>`;
    const boss = S.enemies.find((e) => E.ENEMIES[e.type].boss);
    if (boss) h += `<p>${E.ENEMIES[boss.type].name}：${E.ENEMIES[boss.type].desc}</p>`;
    else h += `<p class="muted">敵人 ${S.enemies.length} · 增援 ${S.spawns.length + S.reserve.length}。${touch ? '點敵人看它的行為，長按牌或技能看說明。' : '滑過敵人看它的行為，滑過牌看它的走法。'}</p>`;
    if (S.mods && S.mods.length) h += S.mods.map((m) => `<p>${modChip(m)} ${E.MODS[m].desc}</p>`).join('');
    h += `<div class="legend"><span><i class="lg thr"></i>敵人攻擊</span><span><i class="lg tg"></i>可移動</span><span><i class="lg ta"></i>可攻擊</span><span><i class="lg sp"></i>增援點</span><span><i class="lg cr"></i>即將崩塌</span><span><i class="lg pit"></i>深淵</span></div>`;
    infoEl.innerHTML = h;
  }
  function showTileInfo(i) {
    if (!S || demo || i == null) { infoDefault(); return; }
    const x = i % W, y = (i / W) | 0;
    const e = S.enemies.find((z) => !z.dead && z.x === x && z.y === y);
    const thr = E.computeThreats(S)[i];
    let h = '', worth = !!e || (thr && thr.dmg > 0);
    if (e) {
      const d = E.ENEMIES[e.type];
      h += `<div class="info-head"><span class="info-ico">${d.icon}</span><div><b>${d.name}${e.elite ? ' <em class="elite-tag">精英</em>' : ''}</b><small>${coord(x, y)} · 生命 ${e.hp}/${e.maxHp}</small></div></div><p>${d.desc}</p>`;
      if (e.elite) h += '<p class="muted">精英：生命 +1，攻擊傷害 +1。</p>';
      for (const a of e.affixes || []) h += `<p><em class="elite-tag" style="background:var(--violet)">${E.AFFIXES[a].name}</em> ${E.AFFIXES[a].desc}${a === 'shield' && !e.shield ? '（已破）' : ''}</p>`;
      if (e.dmgUp) h += `<p class="muted">高塔之力：攻擊傷害 +${e.dmgUp}。</p>`;
      h += `<p class="intent">${intentText(e)}</p>`;
    } else if (S.player.x === x && S.player.y === y) {
      h += `<div class="info-head"><span class="info-ico you">♚</span><div><b>你（${E.HEROES[S.hero].name}）</b><small>${coord(x, y)} · 生命 ${S.hp}/${S.maxHp}</small></div></div>`;
    } else {
      const t = S.tiles[i];
      h += `<div class="info-head"><div><b>${t === '#' ? '石柱' : t === 'o' ? '深淵' : '地面'}</b><small>${coord(x, y)}</small></div></div>`;
      if (t === 'o') h += '<p>不能踩進去（跳躍類的牌可以越過）。被推進來的敵人會直接墜落。</p>';
      if (t === '#') h += '<p>阻擋移動與箭矢。把敵人推向石柱會造成 1 傷害。</p>';
      const sp = S.spawns.find((s) => s.x === x && s.y === y);
      if (sp || t === 'o' || S.cracks.some((k) => k.x === x && k.y === y) || (S.fire && S.fire.includes(i))) worth = true;
      if (sp) h += `<p class="intent">增援點：回合結束時會出現${E.ENEMIES[sp.type].name}。站在上面可以擋下它，但會受到 1 傷害。</p>`;
      if (S.cracks.some((k) => k.x === x && k.y === y)) h += '<p style="color:var(--violet)">裂痕：回合結束時這格會崩塌成深淵，站在上面會受到 2 傷害。</p>';
      if (S.fire && S.fire.includes(i)) h += '<p style="color:var(--ember)">灼地：回合結束時站在這裡的人（包括敵人）受 1 傷害。</p>';
    }
    if (thr && thr.dmg > 0) {
      const names = [...new Set(thr.src)].map((u) => { const z = S.enemies.find((q) => q.uid === u); return z ? E.ENEMIES[z.type].name : ''; }).filter(Boolean);
      h += `<p class="warn">注意：回合結束時這格會受到 ${thr.dmg} 傷害（${names.join('、')}）。</p>`;
    }
    infoEl.innerHTML = h;
    return worth;
  }
  const TYPE_DESC = { move: '步：移動牌，走到敵人身上就是攻擊（近身）。每回合一次，要在出招之前。', strike: '技：原地出招，不會移動你。每回合一次；出招之後就不能再走了。' };
  function showCardInfo(c) {
    const d = E.CARDS[c.k];
    infoEl.innerHTML = `<div class="info-head"><span class="info-ico card-ico">${d.n}</span><div><b>${d.name}${c.plus ? '+' : ''}</b><small>${E.TYPE_NAME[d.t]} · ${['普通', '稀有', '傳說'][d.r]}${quickOf(c) ? ' · 迅捷' : ''}</small></div></div><p>${d.desc}</p><p class="${c.plus ? 'intent' : 'muted'}">${c.plus ? '已升級：' : '升級後：'}${d.plus}</p><p class="muted">${TYPE_DESC[d.t]}${quickOf(c) ? '迅捷：不佔用這回合的步或技。' : ''}</p>`;
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
  const noiseHit = () => Sfx.enemyAtk('melee');
  function projectile(fromX, fromY, toX, toY, beam, kind) {
    const n = mk('div', 'shot' + (beam ? ' beam' : '') + (kind ? ' ' + kind : ''));
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
    const mods = (S.mods || []).map((m) => E.MODS[m].name).join('・');
    banner(isTower() ? (S.boss ? '無盡之塔 · 首領' : '無盡之塔') : S.floor > 10 ? '無盡深淵' : S.boss ? '首領層' : '深度', `第 ${S.floor} 層`, boss ? E.ENEMIES[boss.type].name + (mods ? '・' + mods : '') : mods);
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
          if (e.p === 'player' && playerEl) playerEl.classList.remove('guarding');
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
            if (e.shield) n.classList.add('shielded');
            if (e.affixes && e.affixes.length) { n._ak = e.affixes.join(','); n.querySelector('.affx').innerHTML = e.affixes.map((a) => `<i>${E.AFFIXES[a].n}</i>`).join(''); }
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
        case 'block': floatText(e.x, e.y, e.src === 'guard' ? '架式格擋' : '聖印格擋', 'gold'); Sfx.block(); await sleep(200); break;
        case 'guard': {
          ensurePlayer(); playerEl.classList.add('guarding');
          floatText(e.x, e.y, '架式', 'gold'); Sfx.block(); await sleep(140);
          break;
        }
        case 'slash': {
          ensurePlayer(); bumpEl(playerEl, Math.sign(e.dx), Math.sign(e.dy), 22);
          for (const [x, y] of e.tiles) tileFx(x, y, 'flash-g', 300);
          noiseHit(); await sleep(110);
          break;
        }
        case 'bolt': {
          const dur = projectile(e.x1, e.y1, e.x2, e.y2, false, e.hook ? 'hook' : 'bolt');
          Sfx.enemyAtk('shoot');
          await new Promise((r) => setTimeout(r, dur));
          tileFx(e.x2, e.y2, 'flash-g', 300);
          break;
        }
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
        case 'clear': Sfx.clear(); banner(e.task ? '清除 · 懸賞達成' : '清除', `第 ${e.floor} 層`, e.shards ? `魂晶 +${e.shards}` : '深淵暫時安靜了'); await sleep(900); break;
        case 'log': addLog(e.s); break;
        case 'shield': {
          const n = pieceEls.get(e.uid);
          if (n) n.classList.remove('shielded');
          floatText(e.x, e.y, '破盾', 'info'); Sfx.block(); await sleep(140);
          break;
        }
        case 'eheal': {
          const n = pieceEls.get(e.uid);
          if (n) renderPips(n, (n._hp || 0) + 1, n._max || 1);
          floatText(e.x, e.y, '+1', 'heal'); await sleep(60);
          break;
        }
        case 'burn':
          for (const [x, y] of e.tiles) tileFx(x, y, 'flash-o');
          Sfx.enemyAtk('bomb'); await sleep(220);
          break;
        case 'skill': Sfx.blink(); await sleep(60); break;
      }
    }
  }

  /* ---------- 操作 ---------- */
  function selectCard(i) {
    if (!S || demo || busy || S.phase !== 'player') return;
    if (i < 0 || i >= S.hand.length) return;
    selSkill = -1;
    if (sel === i) sel = -1;
    else if (E.legalTargets(S, i).length) { sel = i; Sfx.select(); }
    else {
      const c = S.cards[S.hand[i]];
      if (!E.slotOK(S, c)) toast(E.ctype(c) === 'move' ? (S.st > 0 ? '出招之後就不能再走了（擊殺可以換來額外行動）' : '這回合已經走過一步了') : '這回合已經出過招了');
      else toast(E.ctype(c) === 'move' ? '這張牌現在沒有可以走的位置' : '這張牌現在沒有可以打的目標');
      return;
    }
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
    if (!hasSel()) { const x = i % W, y = (i / W) | 0; focusUid = enemyUidAt(x, y); showTileInfo(i); }
    refresh();
  });
  cellsEl.addEventListener('mouseleave', () => {
    if (touch || !S || demo) return;
    hover = null; focusUid = null;
    if (!busy) { refresh(); if (!hasSel()) infoDefault(); }
  });
  cellsEl.addEventListener('click', (ev) => {
    if (!S || demo || busy || S.phase !== 'player') return;
    const c = ev.target.closest('.cell'); if (!c) return;
    const i = +c.dataset.i, x = i % W, y = (i / W) | 0;
    if (hasSel()) {
      const tg = actionTargets().find((t) => t.x === x && t.y === y);
      if (!tg) {
        sel = -1; selSkill = -1; pendingTap = null; hover = i; focusUid = enemyUidAt(x, y);
        if (showTileInfo(i)) peek(true); refresh(); renderHand();
        return;
      }
      if (touch && pendingTap !== i) { pendingTap = i; hover = i; refresh(); return; }
      if (selSkill >= 0) doSkill(selSkill, x, y); else doPlay(sel, x, y);
    } else {
      hover = i; focusUid = enemyUidAt(x, y);
      if (showTileInfo(i)) peek(true); refresh();
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
    busy = true; sel = -1; selSkill = -1; hover = null; pendingTap = null; focusUid = null; curPreview = null; peek(false);
    animBase = pre;
    document.body.classList.add('busy');
    ghostsEl.innerHTML = '';
    renderHand(); renderHUD(); renderSkills();
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
    if (S.phase === 'dead') { finalizeRun(); setTimeout(showGameOver, 350); Sfx.lose(); return; }
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
    if (S.phase === 'dead') unfinalizeRun();
    const left = S.undoLeft - (cross ? 1 : 0);
    S = JSON.parse(h.snap);
    S.undoLeft = left;
    sel = -1; selSkill = -1; hover = null; pendingTap = null; focusUid = null;
    closeOverlay(); rebuildPieces(); fullRender();
    addLog(cross ? '時光倒流：回到上一回合（消耗 1 次）' : '收回一步');
    Sfx.undo(); saveRun();
  }
  function saveRun() { if (S && !demo && S.phase !== 'dead') store.set(RUN_KEY, { S }); }

  /* ---------- 解鎖與紀錄 ---------- */
  const isTower = () => !!S && S.mode === 'endless';
  const heroName = () => (isTower() ? '無盡之塔 · 自訂角色' : (E.HEROES[S.hero] || E.HEROES.ranger).name);
  let runStartBest = 0, runStartScore = 0, preFinalMeta = null;
  function checkUnlocks() {
    if (!S || demo) return;
    if (isTower()) {
      if (['player', 'reward', 'dead'].includes(S.phase) && S.floor > meta.towerBest) { meta.towerBest = S.floor; saveMeta(); }
      return;
    }
    const un = (id) => {
      if (!meta.unlocked.includes(id)) { meta.unlocked.push(id); saveMeta(); toast('解鎖新角色：' + E.HEROES[id].name + '！'); }
    };
    if (S.floor >= 4) un('shade');
    if (S.stats.floors >= 5) un('warden');
    if (S.won) un('master');
    if (S.floor > meta.bestFloor) { meta.bestFloor = S.floor; saveMeta(); }
  }
  function recordBest() {
    if (isTower()) { if (S.floor > meta.towerBest) meta.towerBest = S.floor; saveMeta(); return; }
    if (S.score > meta.best) meta.best = S.score;
    if (S.floor > meta.bestFloor) meta.bestFloor = S.floor;
    if (S.daily) { const t = todayStr(); if (!meta.daily[t] || S.score > meta.daily[t]) meta.daily[t] = S.score; }
    saveMeta();
  }
  // 結算：魂晶存進工坊。死亡時立刻結算（關掉分頁也不會丟），從死亡畫面回溯時再還原
  function finalizeRun() {
    if (!S || demo || runRecorded) return;
    preFinalMeta = JSON.stringify(meta);
    runRecorded = true;
    meta.shards += S.shards || 0;
    if (isTower()) {
      meta.towerRuns++;
      meta.towerHist.unshift({ floor: S.floor, shards: S.shards || 0, date: todayStr(), deck: S.deck.map((id) => E.CARDS[S.cards[id].k].n).join(''), skills: (S.skills || []).map((k) => E.SKILLS[k.id].n).join('') });
      meta.towerHist = meta.towerHist.slice(0, 6);
    } else { meta.runs++; if (S.won) meta.wins++; }
    recordBest();
    store.del(RUN_KEY);
    saveMeta();
  }
  function unfinalizeRun() {
    if (!runRecorded || !preFinalMeta) return;
    const back = JSON.parse(preFinalMeta);
    for (const k of Object.keys(meta)) delete meta[k];
    Object.assign(meta, back);
    saveMeta();
    runRecorded = false; preFinalMeta = null;
  }
  // 開新局時，如果還有沒結束的存檔，把它賺到的魂晶存起來
  function abandonSave() {
    const sv = store.get(RUN_KEY);
    if (sv && sv.S && sv.S.phase !== 'dead' && !(S === sv.S)) { meta.shards += sv.S.shards || 0; saveMeta(); }
    store.del(RUN_KEY);
  }

  /* ---------- 工坊與解鎖狀態 ---------- */
  const unl = (id) => meta.towerUnl.includes(id);
  const cardOpen = (k) => E.TOWER.baseCards.includes(k) || unl('card:' + k);
  const skillOpen = (id) => E.TOWER.baseSkills.includes(id) || unl('skill:' + id);
  const relicOpen = (r) => E.TOWER.baseRelics.includes(r) || unl('relic:' + r);
  function unlockState(u, shards) {
    if (unl(u.id)) return 'own';
    if (u.req && !unl(u.req)) return 'req';
    if (u.best && meta.towerBest < u.best) return 'req';
    return (shards != null ? shards : meta.shards) >= u.cost ? 'ok' : 'poor';
  }
  function nextUnlockHTML(shards) {
    const cand = E.TOWER.unlocks.filter((u) => ['ok', 'poor'].includes(unlockState(u, shards))).sort((a, b) => a.cost - b.cost);
    if (!cand.length) return '';
    const ok = cand.filter((u) => unlockState(u, shards) === 'ok');
    if (ok.length) return `<div class="next-unlock">魂晶 ${shards}：工坊裡有 ${ok.length} 項可以解鎖了，例如「${ok[ok.length - 1].name}」！</div>`;
    return `<div class="next-unlock">再 ${cand[0].cost - shards} 魂晶就能解鎖「${cand[0].name}」。</div>`;
  }
  function unlockDesc(u) {
    const [cat, key] = u.id.split(':');
    if (u.desc) return u.desc;
    if (cat === 'card') return '起始牌組可用：' + E.CARDS[key].desc;
    if (cat === 'skill') return `技能（冷卻 ${E.SKILLS[key].cd}）：` + E.SKILLS[key].desc;
    if (cat === 'relic') return '起始遺物可選：' + E.RELICS[key].desc;
    return '';
  }
  function unlockIcon(u) {
    const [cat, key] = u.id.split(':');
    if (cat === 'card') return `<span class="pk-ico c-card">${E.CARDS[key].n}</span>`;
    if (cat === 'skill') return `<span class="pk-ico c-skill">${E.SKILLS[key].n}</span>`;
    if (cat === 'relic') return `<span class="pk-ico">${E.RELICS[key].icon}</span>`;
    if (cat === 'start') return `<span class="pk-ico c-gold">${key}</span>`;
    return `<span class="pk-ico c-gold">${u.id.startsWith('budget') ? '盤' : u.id === 'plus' ? '升' : u.id === 'slot2' ? '技' : '謀'}</span>`;
  }

  /* ---------- 疊層畫面 ---------- */
  let overlayHandler = null, overlayClosable = false;
  function openOverlay(html, handler, closable, keepScroll) {
    const st = keepScroll ? panel.scrollTop : 0;
    panel.innerHTML = html; peek(false);
    overlayHandler = handler; overlayClosable = !!closable;
    overlay.hidden = false;
    panel.scrollTop = st;
    if (!keepScroll) {
      const f = panel.querySelector('.btn.primary, button');
      if (f && !touch) setTimeout(() => f.focus({ preventScroll: true }), 30);
    }
  }
  function closeOverlay() { overlay.hidden = true; overlayHandler = null; }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && overlayHandler && !b.disabled) overlayHandler(b.dataset.action, b.dataset);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay && overlayClosable) closeOverlay(); });

  function statsHTML() {
    const st = S.stats;
    const items = isTower()
      ? [['到達樓層', S.floor], ['魂晶', S.shards || 0], ['擊殺', st.kills], ['借刀殺人', st.friendly], ['推落深淵', st.pit], ['最長連鎖', st.bestChain], ['總回合', st.turns], ['分數', S.score]]
      : [['分數', S.score], ['到達深度', S.floor], ['擊殺', st.kills], ['借刀殺人', st.friendly], ['推落深淵', st.pit], ['最長連鎖', st.bestChain], ['總回合', st.turns], ['魂晶', S.shards || 0]];
    return `<div class="stat-grid">${items.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>`;
  }

  function showTitle() {
    const saved = store.get(RUN_KEY);
    const sv = saved && saved.S && saved.S.phase !== 'dead' ? saved.S : null;
    const svLabel = sv ? (sv.mode === 'endless' ? `繼續 · 無盡之塔 第 ${sv.floor} 層` : `繼續 · 故事模式 第 ${sv.floor} 層`) : '';
    openOverlay(`<div class="title">
      <div class="logo">棋淵</div>
      <div class="logo-sub">ABYSS GAMBIT</div>
      <p class="tagline">先走一步，再出一招。擊殺換來下一步，借刀殺人換來生路。</p>
      ${sv ? `<div class="title-actions" style="margin-bottom:16px"><button type="button" class="btn primary big" data-action="resume">${svLabel}</button></div>` : ''}
      <div class="modes">
        <button type="button" class="mode story" data-action="story"><span class="m-eye">STORY</span><span class="m-name">故事模式</span>
          <span class="m-desc">選一位英雄，挑戰十層棋淵與兩位首領。也有每天換一次地圖的每日挑戰。</span>
          <span class="m-rec">最高分 <b>${meta.best}</b> · 通關 <b>${meta.wins}</b> 次</span></button>
        <button type="button" class="mode tower" data-action="tower"><span class="m-eye">ENDLESS</span><span class="m-name">無盡之塔</span>
          <span class="m-desc">自訂角色的能力、技能、遺物與牌組，看你的構築能爬多高。每次攀登都會帶回魂晶。</span>
          <span class="m-rec">最高 <b>第 ${meta.towerBest} 層</b> · 魂晶 <b>${meta.shards}</b></span></button>
      </div>
      <div class="title-actions"><button type="button" class="btn ghost" data-action="help">規則</button></div>
    </div>`, (a) => {
      if (a === 'resume') resumeGame(sv);
      if (a === 'story') showStory();
      if (a === 'tower') showTower();
      if (a === 'help') showHelp(showTitle);
    });
  }

  function showStory() {
    if (!meta.unlocked.includes(meta.hero)) meta.hero = 'ranger';
    const heroes = Object.entries(E.HEROES).map(([id, h]) => {
      const locked = !meta.unlocked.includes(id);
      return `<button type="button" class="hero ${locked ? 'locked' : ''} ${meta.hero === id ? 'sel' : ''}" data-action="hero" data-id="${id}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="hero-name">${h.name}</span><span class="hero-hp">♥ ${h.hp}</span>
        <span class="hero-deck">${h.deck.map((k) => E.CARDS[k].t === 'strike' ? `<em>${E.CARDS[k].n}</em>` : E.CARDS[k].n).join('')}</span>
        ${h.relics.map((r) => `<span class="hero-relic"><i>${E.RELICS[r].icon}</i>${E.RELICS[r].name}</span>`).join('')}
        <span class="hero-desc">${locked ? '未解鎖 · ' + h.unlock : h.desc}</span></button>`;
    }).join('');
    const dailyBest = meta.daily[todayStr()];
    openOverlay(`<div class="title">
      <div class="toprow"><button type="button" class="btn ghost" data-action="back">← 返回</button><span class="grow"></span></div>
      <div class="eyebrow">Story</div><h2>故事模式</h2>
      <p class="tagline">十層棋淵，第 5 與第 10 層有首領。英雄會隨著進度解鎖。</p>
      <div class="heroes">${heroes}</div>
      <div class="title-actions">
        <button type="button" class="btn primary big" data-action="start">開始下淵</button>
        <button type="button" class="btn big" data-action="daily">每日挑戰 · ${todayStr().slice(5).replace('-', '/')}</button>
      </div>
      <div class="records"><span>最高分 <b>${meta.best}</b></span><span>最深 <b>第 ${meta.bestFloor || 0} 層</b></span><span>已下淵 <b>${meta.runs}</b> 次</span><span>通關 <b>${meta.wins}</b></span>${dailyBest != null ? `<span>今日挑戰 <b>${dailyBest}</b></span>` : ''}</div>
    </div>`, (a, d) => {
      if (a === 'back') showTitle();
      if (a === 'hero') { if (!meta.unlocked.includes(d.id)) { toast('尚未解鎖：' + E.HEROES[d.id].unlock); return; } meta.hero = d.id; saveMeta(); Sfx.select(); showStory(); }
      if (a === 'start') newGame({ hero: meta.hero, seed: (Math.random() * 2 ** 32) >>> 0 });
      if (a === 'daily') newGame({ hero: 'ranger', seed: E.hashStr('qiyuan-' + todayStr()), daily: true });
    });
  }

  /* ---------- 命盤（自訂角色） ---------- */
  const defaultBuild = () => ({ hp: 5, hand: 0, undo: 0, deck: [['king', false], ['king', false], ['knight', false], ['rook', false], ['slash', false], ['lance', false]], relics: [], skills: ['redraw'], start: 1 });
  let bd = null;
  function sanitizeBuild(b0) {
    const b = Object.assign(defaultBuild(), JSON.parse(JSON.stringify(b0 || {})));
    b.deck = (b.deck || []).filter(([k]) => E.CARDS[k] && cardOpen(k)).map(([k, p]) => [k, !!p && unl('plus')]);
    b.relics = (b.relics || []).filter((r) => E.RELICS[r] && relicOpen(r));
    b.skills = (b.skills || []).filter((id) => E.SKILLS[id] && skillOpen(id)).slice(0, unl('slot2') ? 2 : 1);
    b.hand = unl('hand') && b.hand ? 1 : 0;
    b.hp = Math.max(E.TOWER.baseHp, Math.min(E.TOWER.maxHp, b.hp | 0));
    b.undo = Math.max(0, Math.min(E.TOWER.maxUndo, b.undo | 0));
    if (b.start > 1 && !unl('start:' + b.start)) b.start = 1;
    return b;
  }
  function saveBuild() { meta.build = bd; saveMeta(); }
  function showTower(keep) {
    bd = sanitizeBuild(bd || meta.build);
    const T = E.TOWER;
    const budget = E.budgetOf(meta.towerUnl), cost = E.buildCost(bd);
    const errs = E.validateBuild(bd, meta.towerUnl);
    const slots = unl('slot2') ? 2 : 1;
    const stepper = (k, label, sub, val, canDec, canInc, locked) => `<div class="stepper ${locked ? 'locked' : ''}"><div class="st-l">${label}<small>${sub}</small></div><button type="button" data-action="dec" data-k="${k}" ${canDec ? '' : 'disabled'} aria-label="減少">−</button><b>${val}</b><button type="button" data-action="inc" data-k="${k}" ${canInc ? '' : 'disabled'} aria-label="增加">+</button></div>`;
    const stats = [
      stepper('hp', '生命上限', `每 +1 花 ${T.hpCost} 點（基礎 ${T.baseHp}）`, bd.hp, bd.hp > T.baseHp, bd.hp < T.maxHp),
      stepper('undo', '每層回溯', `每 +1 花 ${T.undoCost} 點`, 1 + bd.undo, bd.undo > 0, bd.undo < T.maxUndo),
      stepper('hand', '手牌上限', unl('hand') ? `+1 花 ${T.handCost} 點` : '工坊解鎖「多謀」後可調整', E.BASE_HAND + bd.hand, bd.hand > 0, unl('hand') && !bd.hand, !unl('hand')),
    ].join('');
    const skills = Object.entries(E.SKILLS).map(([id, d]) => {
      const open = skillOpen(id), on = bd.skills.includes(id);
      return `<button type="button" class="pick sk ${on ? 'on' : ''} ${open ? '' : 'locked'}" data-action="skill" data-id="${id}"><span class="pk-ico">${d.n}</span><span class="pk-t"><b>${d.name}<span class="cost">${d.cost} 點</span></b><small>${open ? `冷卻 ${d.cd} · ${d.desc}` : '工坊解鎖'}</small></span></button>`;
    }).join('');
    const openRelics = Object.keys(E.RELICS).filter(relicOpen);
    const relics = openRelics.map((r) => {
      const d = E.RELICS[r], on = bd.relics.includes(r);
      return `<button type="button" class="pick ${on ? 'on' : ''}" data-action="relic" data-id="${r}"><span class="pk-ico">${d.icon}</span><span class="pk-t"><b>${d.name}<span class="cost">${T.relicCost} 點</span></b><small>${d.desc}</small></span></button>`;
    }).join('');
    const lockedRelics = Object.keys(E.RELICS).length - openRelics.length;
    const deck = bd.deck.map(([k, plus], i) => `<div class="dcard"><button type="button" class="card r${E.CARDS[k].r} t-${E.CARDS[k].t}${plus ? ' plus' : ''}" data-action="rm" data-i="${i}" title="點一下移除">${cardHTML({ k, plus })}</button><button type="button" class="x" data-action="rm" data-i="${i}" aria-label="移除">×</button>${unl('plus') ? `<button type="button" class="pl ${plus ? 'on' : ''}" data-action="plus" data-i="${i}">${plus ? '已升級' : '升級 +1'}</button>` : ''}</div>`).join('');
    const palette = (t) => Object.keys(E.CARDS).filter((k) => E.CARDS[k].t === t).map((k) => {
      const d = E.CARDS[k], open = cardOpen(k);
      return `<button type="button" class="pick cd ${open ? '' : 'locked'}" data-action="add" data-k="${k}"><span class="pk-ico ty-${d.t}">${d.n}</span><span class="pk-t"><b>${d.name}<span class="cost">${T.cardCost[d.r]} 點</span></b><small>${open ? d.desc : '工坊解鎖'}</small></span></button>`;
    }).join('');
    const nMove = bd.deck.filter(([k]) => E.CARDS[k].t === 'move').length, nStrike = bd.deck.length - nMove;
    const starts = T.starts.filter((f) => f === 1 || unl('start:' + f)).map((f) => `<button type="button" class="pick ${bd.start === f ? 'on' : ''}" data-action="start" data-f="${f}"><span class="pk-ico c-gold">${f}</span><span class="pk-t"><b>第 ${f} 層</b><small>${f === 1 ? '從頭開始' : `先挑 ${E.draftPicks(f)} 次補給`}</small></span></button>`).join('');
    const hist = meta.towerHist.length ? `<div class="history">${meta.towerHist.map((h) => `<span><b>第 ${h.floor} 層</b> · +${h.shards} 魂晶 · ${h.deck}${h.skills ? ' · 技 ' + h.skills : ''} · ${h.date.slice(5)}</span>`).join('')}</div>` : '<p class="muted" style="margin:0">還沒有攀登紀錄。</p>';
    const html = `<div class="builder">
      <div class="toprow"><button type="button" class="btn ghost" data-action="back">← 返回</button><h2>命盤</h2><span class="grow"></span><span class="shard-pill">魂晶 ${meta.shards}</span><button type="button" class="btn" data-action="shop">魂晶工坊</button></div>
      <p class="muted" style="margin:0">點數有限，取捨就是樂趣。塔越高，敵人會長出越多詞條（荊棘懲罰近身、結界擋下遠攻），樓層也會出現干擾；每一層開始前可以選門，越險的門魂晶越多，懸賞則看你的流派。帶回的魂晶可以在工坊解鎖新的牌、技能、遺物與更多點數。最高紀錄：<b>第 ${meta.towerBest} 層</b>。</p>
      <div class="bsec"><h3>能力值</h3><div class="stats-row">${stats}</div></div>
      <div class="bsec"><h3>技能 <small>${bd.skills.length} / ${slots} 欄 · 不會結束回合，用完需要冷卻</small></h3><div class="chips">${skills}</div></div>
      <div class="bsec"><h3>起始遺物 <small>${bd.relics.length} / ${E.RELIC_CAP} 件 · 每件 ${T.relicCost} 點${lockedRelics ? ` · 工坊還有 ${lockedRelics} 件可解鎖` : ''}</small></h3><div class="chips">${relics}</div></div>
      <div class="bsec"><h3>起始牌組 <small>${bd.deck.length} 張（${T.deckMin}–${T.deckMax}）· 步 ${nMove}、技 ${nStrike} · 普通 1 點、稀有 2 點、傳說 3 點</small></h3><div class="deck-edit">${deck || '<p class="muted">牌組是空的。</p>'}</div>
        ${!nMove || !nStrike ? `<p class="warn" style="margin:8px 0 0">${!nMove ? '牌組裡沒有「步」：你將無法移動。' : '牌組裡沒有「技」：只能靠走到敵人身上攻擊。'}</p>` : ''}
        <h4 class="pal-h">步 <small>移動，走到敵人身上就是攻擊</small></h4><div class="chips">${palette('move')}</div>
        <h4 class="pal-h">技 <small>原地出招；出招後這回合就不能再走</small></h4><div class="chips">${palette('strike')}</div></div>
      <div class="bsec"><h3>起點</h3><div class="chips">${starts}</div>${T.starts.length > 1 && !unl('start:6') ? '<p class="muted" style="margin:8px 0 0">抵達第 6 層後，可以在工坊解鎖「從第 6 層出發」。</p>' : ''}</div>
      <div class="bsec"><h3>最近的攀登</h3>${hist}</div>
      <div class="budget"><div class="meter ${cost > budget ? 'over' : ''}"><div class="mt">構築點數 <span>${cost} / ${budget}</span></div><div class="bar"><i style="width:${Math.min(100, (cost / budget) * 100)}%"></i></div></div>
        <button type="button" class="btn primary big" data-action="go" ${errs.length ? 'disabled' : ''}>開始攀登</button>
        ${errs.length ? `<div class="errs">${errs.join('、')}</div>` : ''}</div>
    </div>`;
    openOverlay(html, towerAction, false, keep);
  }
  function towerAction(a, d) {
    const T = E.TOWER;
    const slots = unl('slot2') ? 2 : 1;
    switch (a) {
      case 'back': saveBuild(); showTitle(); return;
      case 'shop': saveBuild(); showShop(); return;
      case 'go':
        if (E.validateBuild(bd, meta.towerUnl).length) return;
        saveBuild();
        newGame({ mode: 'endless', build: JSON.parse(JSON.stringify(bd)), seed: (Math.random() * 2 ** 32) >>> 0 });
        return;
      case 'inc': case 'dec': {
        const s = a === 'inc' ? 1 : -1;
        if (d.k === 'hp') bd.hp = Math.max(T.baseHp, Math.min(T.maxHp, bd.hp + s));
        if (d.k === 'undo') bd.undo = Math.max(0, Math.min(T.maxUndo, bd.undo + s));
        if (d.k === 'hand' && unl('hand')) bd.hand = s > 0 ? 1 : 0;
        break;
      }
      case 'skill':
        if (!skillOpen(d.id)) { toast('到魂晶工坊解鎖這個技能'); return; }
        if (bd.skills.includes(d.id)) bd.skills = bd.skills.filter((x) => x !== d.id);
        else { bd.skills.push(d.id); if (bd.skills.length > slots) bd.skills.shift(); }
        break;
      case 'relic':
        if (!bd.relics.includes(d.id) && bd.relics.length >= E.RELIC_CAP) { toast(`遺物最多帶 ${E.RELIC_CAP} 件`); return; }
        bd.relics = bd.relics.includes(d.id) ? bd.relics.filter((x) => x !== d.id) : bd.relics.concat(d.id);
        break;
      case 'add':
        if (!cardOpen(d.k)) { toast('到魂晶工坊解鎖這張牌'); return; }
        if (bd.deck.length >= T.deckMax) { toast(`牌組最多 ${T.deckMax} 張`); return; }
        bd.deck.push([d.k, false]);
        break;
      case 'rm': bd.deck.splice(+d.i, 1); break;
      case 'plus': if (bd.deck[+d.i]) bd.deck[+d.i][1] = !bd.deck[+d.i][1]; break;
      case 'start': bd.start = +d.f; break;
    }
    Sfx.select(); saveBuild(); showTower(true);
  }

  function showShop(keep) {
    const cats = [['core', '核心', '點數、精工、技能欄位與手牌'], ['card', '卡牌', '解鎖後可以放進起始牌組（爬塔途中的獎勵本來就會出現所有牌）'], ['skill', '技能', '主動技能，不會結束回合'], ['relic', '起始遺物', '出發時就帶著'], ['start', '起點', '跳過前面的樓層：出發前先挑幾次補給，更高的樓層魂晶也更多']];
    const secs = cats.map(([cat, name, sub]) => {
      const rows = E.TOWER.unlocks.filter((u) => u.cat === cat).map((u) => {
        const st = unlockState(u);
        const reqTxt = st === 'req' ? (u.best && meta.towerBest < u.best ? `（需要曾抵達第 ${u.best} 層）` : `（需要先解鎖「${E.TOWER.unlocks.find((x) => x.id === u.req).name}」）`) : '';
        return `<div class="unl ${st === 'own' ? 'own' : ''}">${unlockIcon(u)}<div class="u-t"><b>${u.name}</b><small>${unlockDesc(u)}${reqTxt}</small></div>${st === 'own' ? '<span class="ok">已擁有</span>' : `<button type="button" class="btn ${st === 'ok' ? 'primary' : ''}" data-action="buy" data-id="${u.id}" ${st === 'ok' ? '' : 'disabled'}>${u.cost} 魂晶</button>`}</div>`;
      }).join('');
      return `<div class="bsec"><h3>${name} <small>${sub}</small></h3><div class="shop-grid">${rows}</div></div>`;
    }).join('');
    openOverlay(`<div class="shop">
      <div class="toprow"><button type="button" class="btn ghost" data-action="back">← 命盤</button><h2>魂晶工坊</h2><span class="grow"></span><span class="shard-pill">魂晶 ${meta.shards}</span></div>
      <p class="muted" style="margin:0">魂晶來自每一次攀登（故事模式也會給一些）。塔越高、門越險，帶回來的越多；倒下也不會失去已經賺到的魂晶。</p>
      ${secs}</div>`, (a, d) => {
      if (a === 'back') { showTower(); return; }
      if (a === 'buy') {
        const u = E.TOWER.unlocks.find((x) => x.id === d.id);
        if (!u || unlockState(u) !== 'ok') return;
        meta.shards -= u.cost; meta.towerUnl.push(u.id); saveMeta();
        Sfx.heal(); toast(`解鎖「${u.name}」！`);
        showShop(true);
      }
    }, false, keep);
  }

  function showHelp(back) {
    openOverlay(`<div class="eyebrow">How to play</div><h2>怎麼玩</h2>
      <ol class="rules">
        <li><b>先走一步，再出一招。</b>每回合抽 ${E.BASE_HAND} 張牌。牌分兩種：<b>步</b>是棋步（王走一格、騎走日字、車走直線……），走到敵人身上就是攻擊；<b>技</b>是原地出招（橫斬、長槍、弩箭、架式……）。每回合可以出一張步、一張技，但<b>出招之後就不能再走</b>。</li>
        <li><b>擊殺換來額外行動。</b>只要殺死敵人，就多一次行動，步或技都可以；連鎖下去，一口氣清掉一排敵人！標著「迅捷」的牌不佔用行動。</li>
        <li><b>近身與遠攻。</b>走到敵人身上、橫斬、迴旋、斷首、落地衝擊都算近身攻擊：刺蝟和「荊棘」敵人會刺傷你。「結界」敵人則只吃近身攻擊。牌組裡兩種都要有。</li>
        <li><b>紅格是敵人要打的地方。</b>所有攻擊都會提前一回合標示，回合結束時別站在紅格上。${touch ? '選好牌後點一下落點會預覽結果，再點一次才確認。點敵人可以看它的行為，長按牌看說明。' : '選好牌後把滑鼠移到落點，會預覽這一步的結果。'}</li>
        <li><b>借刀殺人。</b>敵人的攻擊也會打到同伴。讓弓手的箭射穿你身後的敵人、把敵人推進紅格；推進深淵（黑洞）的敵人直接墜落。</li>
        <li><b>必須落子。</b>每回合至少要出一張牌，沒出完的牌在回合結束時會被棄掉。</li>
        <li><b>深淵上升。</b>超過標準回合數後，地面會開始出現裂痕，下回合崩塌成深淵。站在上面會受 2 傷害。</li>
        <li><b>增援。</b>虛線圈是下回合要出現的敵人；站上去能擋下它，但要受 1 傷害。</li>
        <li><b>回溯。</b>同一回合內可以任意收回；退回上一回合每層有次數限制。</li>
      </ol>
      <p class="muted"><b>無盡之塔：</b>自己配點打造角色（能力值、技能、遺物、牌組）。技能不會結束回合，用完要冷卻。越往上，敵人會帶著詞條（護盾、分裂、結界……），樓層也有干擾。每層之前選門：越險的門魂晶越多；每道門還附一個<b>懸賞</b>（連斬、借刀、推落……），達成就多拿魂晶與獎勵。魂晶拿去工坊解鎖更多選擇。</p>
      <p class="keys"><kbd>1</kbd>–<kbd>5</kbd> 選牌　<kbd>Q</kbd> <kbd>W</kbd> 技能　<kbd>空白</kbd> 結束回合　<kbd>Z</kbd> 回溯　<kbd>Esc</kbd> 取消</p>
      <div class="title-actions"><button type="button" class="btn primary" data-action="ok">${back ? '知道了' : '開始'}</button></div>`,
    (a) => { if (a === 'ok') { if (typeof back === 'function') back(); else closeOverlay(); } }, typeof back !== 'function');
  }

  function rewardHTML(o, i) {
    const wrap = (vis, title, desc) => `<button type="button" class="ropt" data-action="pick" data-i="${i}">${vis}<b>${title}</b><span>${desc}</span></button>`;
    switch (o.t) {
      case 'card': {
        const d = E.CARDS[o.k];
        return wrap(cardEl({ k: o.k, plus: o.plus }).outerHTML, `新的${E.TYPE_NAME[d.t]}：${d.name}${o.plus ? '+' : ''}`, d.desc + (o.plus ? '　升級：' + d.plus : ''));
      }
      case 'upgrade': return wrap('<div class="ropt-ico seal">升</div>', '升級一張牌', '從牌組中選一張牌永久強化。');
      case 'remove': return wrap('<div class="ropt-ico">削</div>', '精簡牌組', '移除一張牌，讓好牌更常出現。');
      case 'relic': { const r = E.RELICS[o.r]; return wrap(`<div class="ropt-ico relic-seal">${r.icon}</div>`, '遺物：' + r.name, r.desc + (S.relics.length >= E.RELIC_CAP ? `（欄位已滿 ${E.RELIC_CAP}/${E.RELIC_CAP}，要換掉一件）` : '')); }
      case 'heal': return wrap('<div class="ropt-ico hp">♥</div>', '休息', `回復 ${o.n} 生命。`);
      case 'maxhp': return wrap('<div class="ropt-ico hp">✚</div>', '強健', `生命上限 +${o.n}，並回復 ${o.n}（上限 ${E.HP_CAP}）。`);
    }
    return '';
  }
  function showReward() {
    const draft = S.phase === 'draft';
    const bonus = [];
    if (!draft) {
      if (S.lastShards) bonus.push(`魂晶 +${S.lastShards}`);
      if (S.taskDone) bonus.push(`懸賞「${E.TASKS[S.task].name}」達成：魂晶 ×1.5、多一個獎勵選項`);
      if (S.lastPar) bonus.push('在標準回合內清場：多一個獎勵選項');
      if (S.lastFlawless) bonus.push('無傷通過 +50 分');
    }
    const total = E.draftPicks(S.startFloor || 1);
    const eyebrow = draft ? `起始補給 · ${total - S.draftLeft + 1} / ${total}` : `${isTower() ? '無盡之塔 · ' : ''}第 ${S.floor} 層 · 清除`;
    const title = draft ? `出發前往第 ${S.startFloor} 層前的補給` : S.boss ? '選擇一件首領遺物' : '選擇一項獎勵';
    openOverlay(`<div class="reward center">
      <div class="eyebrow">${eyebrow}</div>
      <h2>${title}</h2>
      ${bonus.length ? `<div class="bonus">${bonus.join(' · ')}</div>` : ''}
      <div class="rewards">${S.rewards.map(rewardHTML).join('')}</div>
      <button type="button" class="btn ghost" data-action="skip">略過（+20 分）</button></div>`,
    (a, d) => {
      if (a === 'skip') takeReward(-1);
      if (a === 'pick') {
        const i = +d.i, o = S.rewards[i];
        if (o.t === 'upgrade' || o.t === 'remove') showDeckPick(i, o.t);
        else if (o.t === 'relic' && S.relics.length >= E.RELIC_CAP) showRelicSwap(i);
        else takeReward(i);
      }
    });
  }
  function showDeckPick(i, mode) {
    const ids = S.deck.filter((id) => mode === 'remove' || !S.cards[id].plus);
    const items = ids.map((id) => {
      const c = S.cards[id], d = E.CARDS[c.k];
      return `<div class="deck-pick"><button type="button" class="card r${d.r} t-${d.t}${c.plus ? ' plus' : ''}" data-action="card" data-id="${id}">${cardHTML(c)}</button><span>${mode === 'upgrade' ? d.plus : d.desc}</span></div>`;
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
  // 遺物欄位滿了：選一件換掉
  function showRelicSwap(i) {
    const nr = E.RELICS[S.rewards[i].r];
    const items = S.relics.map((r) => `<button type="button" class="relic-row pickable" data-action="drop" data-r="${r}"><span class="ri">${E.RELICS[r].icon}</span><div><b>${E.RELICS[r].name}</b><small>${E.RELICS[r].desc}</small></div></button>`).join('');
    openOverlay(`<div class="center"><div class="eyebrow">遺物欄位已滿 · ${S.relics.length} / ${E.RELIC_CAP}</div>
      <h2>拿「${nr.name}」要換掉哪一件？</h2>
      <p class="muted">${nr.icon} ${nr.name}：${nr.desc}</p>
      <div class="relic-list">${items}</div>
      <button type="button" class="btn ghost" data-action="back">返回</button></div>`,
    (a, d) => {
      if (a === 'back') showReward();
      if (a === 'drop') takeReward(i, d.r);
    });
  }
  function enterFloorUI() {
    hist = [];
    closeOverlay(); rebuildPieces();
    delete infoEl.dataset.pinned;
    fullRender(); floorBanner(); Sfx.spawn();
    addLog(`進入第 ${S.floor} 層` + (S.mods && S.mods.length ? '：' + S.mods.map((m) => E.MODS[m].name).join('、') : ''));
    checkUnlocks(); saveRun();
  }
  function takeReward(i, param) {
    const ev = E.applyReward(S, i, param);
    if (!ev) { toast('無法選擇這個獎勵'); return; }
    if (S.phase === 'draft') { saveRun(); renderHUD(); showReward(); return; }
    if (S.phase === 'door') { saveRun(); renderHUD(); showDoors(); return; }
    enterFloorUI();
  }

  function taskChip() {
    const d = E.TASKS[S.task], n = Math.min(d.goal, E.taskProgress(S));
    const done = S.task === 'flawless' ? (S.floorDmg === 0 ? 'ok' : 'fail') : n >= d.goal ? 'ok' : '';
    const prog = S.task === 'flawless' ? (done === 'ok' ? '保持中' : '失敗') : `${n}/${d.goal}`;
    return `<span class="mod task ${done}" data-task="1" title="懸賞「${d.name}」：${d.desc}達成後魂晶 ×1.5、獎勵多一個選項。">${d.n}<b>${d.name} ${prog}</b></span>`;
  }
  function modChip(m) {
    const d = E.MODS[m];
    return `<span class="mod ${d.bad ? '' : 'good'}" data-mod="${m}" title="${d.name}：${d.desc}">${d.n}<b>${d.name}</b></span>`;
  }
  function showDoors() {
    const next = S.floor + 1;
    const names = ['平穩之門', '險峻之門', '深淵之門'];
    const doors = S.doors.map((d, i) => {
      const perks = [];
      if (d.extra) perks.push(`獎勵 +${d.extra} 選項`);
      if (d.relic) perks.push('保證出現遺物');
      const mods = d.mods.length ? d.mods.map((m) => `<div class="d-mod">${modChip(m)}<span>${E.MODS[m].desc}</span></div>`).join('') : '<div class="d-none">沒有特殊狀況</div>';
      const task = d.task ? `<div class="d-task"><span class="mod task">${E.TASKS[d.task].n}<b>懸賞 · ${E.TASKS[d.task].name}</b></span><span>${E.TASKS[d.task].desc}</span></div>` : '';
      return `<button type="button" class="door ${d.boss ? 'boss' : 't' + d.tier}" data-action="door" data-i="${i}"><span class="d-name">${d.boss ? '首領之門' : names[d.tier]}</span><span class="d-bounty">魂晶 ×${d.bounty}</span>${perks.length ? `<span class="d-perks">${perks.join(' · ')}</span>` : ''}<div class="d-mods">${mods}</div>${task}</button>`;
    }).join('');
    openOverlay(`<div class="center"><div class="eyebrow">無盡之塔 · 第 ${next} 層</div>
      <h2>${S.doors[0].boss ? '首領就在門後' : '選擇下一道門'}</h2>
      <p class="muted">越危險的門，帶回的魂晶越多、獎勵越好；懸賞是可選的挑戰，達成後魂晶 ×1.5、獎勵多一個選項。生命 ${S.hp} / ${S.maxHp}，這一局已賺到 ${S.shards} 魂晶。</p>
      <div class="doors">${doors}</div></div>`, (a, d) => {
      if (a !== 'door') return;
      const ev = E.chooseDoor(S, +d.i);
      if (ev) enterFloorUI();
    });
  }

  function showVictory() {
    Sfx.win();
    finalizeRun();
    openOverlay(`<div class="center"><div class="eyebrow">Victory · ${heroName()}</div>
      <h2>你征服了棋淵</h2>
      <p class="muted">虛空女王倒下了。想知道自己的構築能走多遠？去無盡之塔試試吧。這一局帶回 ${S.shards} 魂晶。</p>
      ${statsHTML()}
      <div class="title-actions"><button type="button" class="btn primary big" data-action="tower">前往無盡之塔</button><button type="button" class="btn big" data-action="again">再來一局</button><button type="button" class="btn ghost big" data-action="title">回到標題</button></div></div>`,
    (a) => {
      if (a === 'tower') showTower();
      if (a === 'again') newGame({ hero: S.hero, seed: (Math.random() * 2 ** 32) >>> 0 });
      if (a === 'title') showTitle();
    });
  }
  function againOpts() {
    if (isTower()) return { mode: 'endless', build: JSON.parse(JSON.stringify(S.build)), seed: (Math.random() * 2 ** 32) >>> 0 };
    return S.daily ? { hero: 'ranger', seed: E.hashStr('qiyuan-' + todayStr()), daily: true } : { hero: S.hero, seed: (Math.random() * 2 ** 32) >>> 0 };
  }
  function endButtons(canUndo) {
    return `<div class="title-actions">
      ${canUndo ? `<button type="button" class="btn" data-action="undo">回溯上一回合（剩 ${S.undoLeft} 次）</button>` : ''}
      ${isTower() ? '<button type="button" class="btn primary" data-action="tower">返回命盤</button><button type="button" class="btn" data-action="again">同樣構築再爬一次</button>' : `<button type="button" class="btn primary" data-action="again">${S.daily ? '再挑戰一次今日' : '再來一局'}</button>`}
      <button type="button" class="btn ghost" data-action="title">回到標題</button></div>`;
  }
  function endHandler(a) {
    if (a === 'undo') { undo(); return; }
    finalizeRun();
    if (a === 'tower') showTower();
    if (a === 'again') newGame(againOpts());
    if (a === 'title') showTitle();
  }
  function showSummary(title) {
    openOverlay(`<div class="center"><div class="eyebrow">${S.daily ? '每日挑戰 · ' + todayStr() : heroName()}</div><h2>${title}</h2>${statsHTML()}
      ${isTower() ? nextUnlockHTML(meta.shards) : ''}${endButtons(false)}</div>`, endHandler);
  }
  function showGameOver() {
    const nb = isTower() ? S.floor > runStartBest : S.score > runStartScore;
    const canUndo = S.undoLeft > 0 && hist.length > 0;
    openOverlay(`<div class="center"><div class="eyebrow">${S.daily ? '每日挑戰 · ' + todayStr() : heroName()}</div>
      <h2>倒在第 ${S.floor} 層</h2>
      ${nb ? `<div class="newrec">${isTower() ? '新的最高樓層！' : '新紀錄！'}</div>` : ''}
      ${statsHTML()}
      ${S.shards ? `<p class="muted">帶回 <b style="color:#cdbbff">${S.shards} 魂晶</b>，工坊共有 ${meta.shards} 魂晶。</p>` : ''}
      ${nextUnlockHTML(meta.shards)}
      ${endButtons(canUndo)}</div>`, endHandler);
  }
  function showDeck() {
    if (!S || demo) return;
    const order = Object.keys(E.CARDS);
    const cards = S.deck.slice().sort((a, b) => order.indexOf(S.cards[a].k) - order.indexOf(S.cards[b].k)).map((id) => cardEl(S.cards[id]).outerHTML).join('');
    const nMove = S.deck.filter((id) => E.ctype(S.cards[id]) === 'move').length;
    const relics = S.relics.length ? S.relics.map((r) => `<div class="relic-row"><span class="ri">${E.RELICS[r].icon}</span><div><b>${E.RELICS[r].name}</b><small>${E.RELICS[r].desc}</small></div></div>`).join('') : '<p class="muted">還沒有遺物。</p>';
    const skills = (S.skills || []).map((k) => `<div class="relic-row"><span class="ri" style="background:#3a2d6e">${E.SKILLS[k.id].n}</span><div><b>${E.SKILLS[k.id].name}</b><small>冷卻 ${E.SKILLS[k.id].cd} · ${E.SKILLS[k.id].desc}</small></div></div>`).join('');
    openOverlay(`<div class="eyebrow">${heroName()} · 牌組 ${S.deck.length} 張（步 ${nMove}、技 ${S.deck.length - nMove}）</div><h2>牌組與遺物</h2>
      <div class="deck-grid">${cards}</div>
      <p class="muted" style="margin:12px 0 4px">遺物 ${S.relics.length} / ${E.RELIC_CAP} · 生命上限 ${S.maxHp} / ${E.HP_CAP} · 牌組至少 ${E.minDeck(S)} 張</p>
      <div class="relic-list">${skills}${relics}</div>
      <div class="title-actions" style="margin-top:16px"><button type="button" class="btn primary" data-action="ok">返回</button></div>`,
    (a) => { if (a === 'ok') closeOverlay(); }, true);
  }
  function showMenu() {
    if (!S || demo) { showTitle(); return; }
    openOverlay(`<div class="center"><h2>選單</h2><p class="muted">進度會自動保存，下次打開可以繼續。</p>
      <div class="title-actions"><button type="button" class="btn primary" data-action="ok">繼續遊戲</button><button type="button" class="btn" data-action="title">回到標題</button><button type="button" class="btn ghost" data-action="quit">放棄這一局</button></div>
      <div class="title-actions" style="margin-top:10px"><button type="button" class="chip" data-action="speed">動畫：${speed < 1 ? '快速' : '正常'}</button><button type="button" class="chip" data-action="sound">音效：${meta.sound ? '開' : '關'}</button><button type="button" class="chip" data-action="help">規則</button></div></div>`,
    (a) => {
      if (a === 'ok') closeOverlay();
      if (a === 'speed') { toggleSpeed(); showMenu(); }
      if (a === 'sound') { toggleSound(); showMenu(); }
      if (a === 'help') showHelp(showMenu);
      if (a === 'title') { saveRun(); showTitle(); }
      if (a === 'quit') { finalizeRun(); showSummary('放棄了這一局'); }
    }, true);
  }

  /* ---------- 開始 / 繼續 ---------- */
  function migrate(X) {
    if (!X.mode) X.mode = 'story';
    X.skills = X.skills || []; X.mods = X.mods || []; X.fire = X.fire || [];
    X.shards = X.shards || 0; X.lastShards = X.lastShards || 0; X.undoBase = X.undoBase || 1;
    for (const e of X.enemies || []) e.affixes = e.affixes || [];
    // v3：一步一技
    if (X.mv === undefined) { X.mv = 1; X.st = 1; X.bonus = 0; X.stepped = false; X.guard = 0; }
    if (!X.fs) X.fs = { friendly: 0, pit: 0, maxTK: 0, strikeK: 0, moveK: 0 };
    for (const id of Object.keys(X.cards || {})) if (!E.CARDS[X.cards[id].k]) X.cards[id].k = 'king';
    return X;
  }
  function enterRun() {
    demo = false; hist = []; sel = -1; selSkill = -1; hover = null; focusUid = null; runRecorded = false; preFinalMeta = null;
    runStartBest = meta.towerBest; runStartScore = meta.best;
    logEl.innerHTML = '';
    closeOverlay(); rebuildPieces(); fullRender();
  }
  function newGame(o) {
    abandonSave();
    S = E.newRun(o);
    enterRun();
    saveRun();
    if (isTower()) {
      addLog(`開始攀登無盡之塔${S.startFloor > 1 ? `（從第 ${S.startFloor} 層出發）` : ''}`);
      if (S.phase === 'draft') { showReward(); return; }
    } else addLog(o.daily ? `每日挑戰 ${todayStr()} 開始` : `${E.HEROES[S.hero].name}踏入了棋淵`);
    floorBanner();
    if (!meta.seenHelp) { meta.seenHelp = true; saveMeta(); showHelp(true); }
  }
  function resumeGame(saved) {
    S = migrate(saved);
    enterRun();
    addLog('繼續上次的進度');
    if (S.phase === 'reward') { if (S.justWon) showVictory(); else showReward(); }
    else if (S.phase === 'draft') showReward();
    else if (S.phase === 'door') showDoors();
    else floorBanner();
  }

  /* ---------- 按鈕與鍵盤 ---------- */
  $('#btnEnd').addEventListener('click', doWait);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnDeck').addEventListener('click', () => showDeck());
  $('#btnHelp').addEventListener('click', () => showHelp(!S || demo ? showTitle : true));
  $('#btnMenu').addEventListener('click', showMenu);
  function toggleSound() { meta.sound = !meta.sound; saveMeta(); renderHUD(); if (meta.sound) Sfx.select(); }
  function toggleSpeed() {
    meta.fast = !meta.fast; saveMeta();
    speed = meta.fast ? 0.55 : 1;
    document.documentElement.style.setProperty('--spd', speed);
    renderHUD();
  }
  $('#btnSound').addEventListener('click', toggleSound);
  $('#btnSpeed').addEventListener('click', toggleSpeed);
  document.documentElement.style.setProperty('--spd', speed);
  document.addEventListener('keydown', (e) => {
    if (!overlay.hidden) { if (e.key === 'Escape' && overlayClosable) closeOverlay(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= '1' && e.key <= '6') selectCard(+e.key - 1);
    else if (e.key === ' ') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); doWait(); }
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'q' || e.key === 'Q') selectSkill(0);
    else if (e.key === 'w' || e.key === 'W') selectSkill(1);
    else if (e.key === 'Escape') { sel = -1; selSkill = -1; pendingTap = null; focusUid = null; refresh(); renderHand(); infoDefault(); }
  });

  // 開場：標題畫面後面放一盤示範棋局
  S = E.newRun({ seed: (Math.random() * 2 ** 32) >>> 0, hero: 'ranger' });
  demo = true;
  rebuildPieces();
  fullRender();
  showTitle();
})();
