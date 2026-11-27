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
  // t: 'move'（步）走到敵人身上就是攻擊；'strike'（技）原地出招
  // 每回合先走一步、再出一招；出招後就不能再走。擊殺換來一次額外行動（步或技都可以）
  const CARDS = {
    king:    { t: 'move', n: '王', name: '王步', r: 0, desc: '移動 1 格（八方向）。', plus: '攻擊傷害變為 2。' },
    knight:  { t: 'move', n: '騎', name: '騎跳', r: 0, desc: '走「日」字，可越過任何東西。', plus: '攻擊傷害變為 2。' },
    rook:    { t: 'move', n: '車', name: '車衝', r: 0, desc: '沿直線滑行任意格。', plus: '擊中後把存活的目標擊退 1 格。' },
    bishop:  { t: 'move', n: '象', name: '象斜', r: 0, desc: '沿斜線滑行任意格。', plus: '變為迅捷。' },
    leap:    { t: 'move', n: '躍', name: '飛躍', r: 1, desc: '朝八方向跳出正好 2 格，越過中間的東西。', plus: '落地衝擊：對相鄰敵人各造成 1 傷害（近身）。衝擊算是出招，會用掉這回合的技（或一次額外行動）；都沒有就不會觸發。' },
    blink:   { t: 'move', n: '影', name: '影遁', r: 1, quick: true, desc: '瞬移到 2 格內任一空地。', plus: '範圍變為 3。' },
    swap:    { t: 'move', n: '換', name: '移形', r: 1, desc: '與 3 格內任一敵人交換位置（首領除外）。', plus: '變為迅捷。' },
    queen:   { t: 'move', n: '后', name: '后行', r: 2, desc: '沿八方向滑行任意格。', plus: '攻擊傷害變為 2。' },
    slash:   { t: 'strike', n: '斬', name: '橫斬', r: 0, desc: '朝一個方向揮斬，面前 3 格的敵人各受 1 傷害（近身）。', plus: '並把存活的敵人擊退 1 格。' },
    lance:   { t: 'strike', n: '槍', name: '長槍', r: 0, desc: '刺擊直線 2 格內的第一個敵人，造成 2 傷害。', plus: '射程 3，貫穿線上所有敵人。' },
    bolt:    { t: 'strike', n: '弩', name: '弩箭', r: 0, desc: '朝直線射出，命中第一個敵人（距離不限），造成 1 傷害。', plus: '也可以斜向射擊。' },
    shove:   { t: 'strike', n: '推', name: '掌推', r: 0, quick: true, desc: '把相鄰敵人推開 1 格。撞牆或撞到敵人各受 1 傷害；推進深淵直接死亡。', plus: '一路推到撞上東西為止，每滑行 1 格撞擊傷害 +1。' },
    guard:   { t: 'strike', n: '守', name: '架式', r: 0, desc: '直到下回合開始前，擋下你受到的第一次傷害。', plus: '擋下時，對相鄰敵人各造成 1 傷害。' },
    whirl:   { t: 'strike', n: '旋', name: '迴旋', r: 1, desc: '原地迴旋，對周圍 8 格的敵人各造成 1 傷害（近身）。', plus: '並把存活的敵人推開 1 格。' },
    hook:    { t: 'strike', n: '鉤', name: '鉤鎖', r: 1, desc: '把直線 3 格內的第一個敵人拉到你身旁；途經深淵就會墜落。', plus: '並打斷它已鎖定的攻擊。' },
    execute: { t: 'strike', n: '斷', name: '斷首', r: 2, desc: '對相鄰敵人造成 1 傷害；如果它已經受傷，改為 3（近身）。', plus: '變為迅捷。' },
  };
  const TYPE_NAME = { move: '步', strike: '技' };

  const ENEMIES = {
    imp:     { name: '小鬼', icon: '鬼', hp: 1, cost: 1, desc: '走向你，朝你的方向橫掃面前 3 格（1 傷害，同伴也會被掃到）。攻擊方向跟著它本身：把它推開，它就會掃到別處。' },
    spiker:  { name: '刺蝟', icon: '刺', hp: 2, cost: 2, desc: '走向你並攻擊相鄰一格。用近身攻擊（走到它身上、橫斬、迴旋、斷首、落地衝擊）傷害它時你也會被刺傷 1 點；改用長槍、弩箭、推擠或借刀。' },
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
    conduit:   { icon: '魂', name: '靈魂導管', desc: '任何敵人死亡時，對離它最近的另一個敵人造成 1 傷害（每回合最多 2 次）。' },
    aegis:     { icon: '盾', name: '守護聖印', desc: '每層樓第一次受到的傷害無效。' },
    hourglass: { icon: '沙', name: '時之沙漏', desc: '每層樓的回溯次數 +2。' },
    berserk:   { icon: '狂', name: '狂戰之血', desc: '生命 ≤ 2 時，所有攻擊牌傷害 +1。' },
    momentum:  { icon: '疾', name: '衝勁', desc: '滑行 3 格以上才擊中的攻擊，傷害 +1。' },
    gambler:   { icon: '骰', name: '賭徒骰', desc: '每次選獎勵時多一個選項。' },
    gate:      { icon: '門', name: '守門人', desc: '站在增援點上阻擋敵人時不會受傷。' },
    lantern:   { icon: '燈', name: '先知之燈', desc: '可以看到牌庫接下來會抽到的牌。' },
    rooted:    { icon: '樁', name: '紮馬', desc: '這回合沒有走步時，可以出兩招（第一招不會用掉出招的機會）。' },
    abyss:     { icon: '淵', name: '深淵之喚', desc: '每層樓多出 2 個深淵坑。' },
    ram:       { icon: '槌', name: '破城槌', desc: '推擠造成的撞擊傷害 +1，撞上東西的敵人會被打斷攻擊。推不動的敵人也能推：直接受到撞擊傷害。' },
    puppet:    { icon: '絲', name: '傀儡絲', desc: '敵人的攻擊或爆炸打到其他敵人時，傷害 +1。' },
    bulwark:   { icon: '壁', name: '鐵壁', desc: '「架式」變為迅捷：不會用掉出招的機會。' },
  };

  const HEROES = {
    ranger: { name: '遊俠', hp: 5, deck: ['king', 'king', 'knight', 'rook', 'bishop', 'slash', 'lance', 'guard'], relics: [], desc: '步與技各半的均衡牌組，最適合第一次下淵。', unlock: null },
    shade:  { name: '影刺客', hp: 4, deck: ['king', 'knight', 'blink', 'swap', 'bishop', 'execute', 'slash', 'bolt'], relics: ['bell'], desc: '生命較低，但擅長換位、斷首與連鎖。', unlock: '抵達第 4 層' },
    warden: { name: '鐵衛', hp: 7, deck: ['king', 'knight', 'rook', 'shove', 'shove', 'guard', 'hook', 'slash'], relics: ['ram'], desc: '皮粗肉厚，鉤過來、推出去，撞牆撞深淵。', unlock: '擊敗第 5 層首領' },
    master: { name: '棋聖', hp: 4, deck: ['queen', 'knight', 'knight', 'rook', 'bishop', 'lance', 'bolt', 'slash'], relics: ['lantern'], desc: '持有皇后與先知之燈，能預讀牌序。', unlock: '通關第 10 層' },
  };

  // 主動技能：不會結束回合，用完要冷卻（敵方回合數）
  const SKILLS = {
    redraw: { n: '洗', name: '重整', cd: 3, cost: 1, desc: '棄掉手牌，重新抽滿。' },
    mend:   { n: '癒', name: '療傷', cd: 7, cost: 2, desc: '回復 1 生命。' },
    shove:  { n: '崩', name: '崩拳', cd: 3, cost: 2, card: { k: 'shove', plus: true }, desc: '把相鄰敵人一路推到撞上東西為止，每滑行 1 格撞擊傷害 +1。' },
    blink:  { n: '影', name: '影步', cd: 5, cost: 3, card: { k: 'blink', plus: false }, desc: '瞬移到 2 格內的空地。' },
    swap:   { n: '換', name: '換形', cd: 4, cost: 3, card: { k: 'swap', plus: false }, desc: '與 3 格內的敵人交換位置。' },
    lance:  { n: '穿', name: '穿雲', cd: 3, cost: 3, card: { k: 'lance', plus: true }, desc: '刺擊直線 3 格內所有敵人，各 2 傷害。' },
    whirl:  { n: '旋', name: '旋風', cd: 4, cost: 3, card: { k: 'whirl', plus: true }, desc: '對周圍 8 格敵人各造成 1 傷害，並推開存活者。' },
    seal:   { n: '封', name: '封印', cd: 4, cost: 3, target: 'enemy', desc: '取消一個敵人已經鎖定的攻擊。' },
  };

  // 無盡之塔的敵人詞條
  const AFFIXES = {
    shield:   { n: '盾', name: '護盾', desc: '抵擋第一次受到的傷害（不算擊殺，連鎖會中斷）。' },
    tough:    { n: '厚', name: '厚皮', desc: '生命 +2。' },
    fierce:   { n: '狂', name: '狂暴', desc: '攻擊傷害 +1。' },
    swift:    { n: '疾', name: '疾行', desc: '每回合行動兩次（移動兩步）。' },
    volatile: { n: '爆', name: '爆裂', desc: '死亡時對周圍 8 格造成 1 傷害，敵我不分。' },
    thorny:   { n: '棘', name: '荊棘', desc: '用近身攻擊（走到它身上、橫斬、迴旋、斷首、落地衝擊）傷害它時，你會受到 1 傷害。' },
    regen:    { n: '生', name: '再生', desc: '每回合結束回復 1 生命。' },
    split:    { n: '裂', name: '分裂', desc: '死亡時在身旁分裂出兩隻小鬼。' },
    anchored: { n: '錨', name: '不動', desc: '無法被推動或交換位置。' },
    phantom:  { n: '幽', name: '幽影', desc: '不會被其他敵人或爆炸波及（借刀殺人無效）。' },
    ward:     { n: '界', name: '結界', desc: '只會受到近身攻擊的傷害：長槍、弩箭、撞擊、反擊與遺物都無效（推落深淵、借刀殺人、灼地仍然有效）。' },
  };

  // 樓層詞綴（場地干擾 / 祝福），在選門時就看得到
  const MODS = {
    fire:    { n: '焰', name: '灼地', bad: true, from: 2, desc: '部分地面燃燒：回合結束時站在上面的人（包括敵人）受 1 傷害。' },
    horde:   { n: '眾', name: '大軍', bad: true, from: 2, desc: '敵人數量 ×1.5，同時在場的上限 +1。' },
    elite:   { n: '精', name: '精銳', bad: true, from: 3, desc: '每個敵人額外多一個詞條。' },
    crumble: { n: '崩', name: '崩落', bad: true, from: 3, desc: '地面從第 2 回合就開始崩塌。' },
    swift:   { n: '疾', name: '疾風', bad: true, from: 4, desc: '所有敵人獲得「疾行」。' },
    dark:    { n: '暗', name: '暗影', bad: true, from: 5, desc: '只看得到你周圍 2 格內的敵人攻擊標示。' },
    cursed:  { n: '咒', name: '詛咒', bad: true, from: 6, desc: '這層的手牌上限 −1。' },
    spring:  { n: '泉', name: '靈泉', bad: false, from: 1, desc: '進入時回復 2 生命。' },
    surge:   { n: '湧', name: '魔力潮', bad: false, from: 1, desc: '第一回合打出的所有牌都視為迅捷。' },
  };

  // 懸賞：每道門附一個可選的挑戰，達成後魂晶 ×1.5、獎勵多一個選項。
  // 每種懸賞對應一種打法，讓不同構築都有自己想挑的門
  const TASKS = {
    chain:    { n: '連', name: '連斬', goal: 3, desc: '在同一回合內擊殺 3 個敵人。' },
    friendly: { n: '借', name: '借刀', goal: 2, desc: '讓敵人打倒同伴 2 次。' },
    pit:      { n: '落', name: '推落', goal: 2, desc: '讓 2 個敵人墜入深淵。' },
    strike:   { n: '技', name: '武藝', goal: 4, desc: '用「技」擊殺 4 個敵人。' },
    capture:  { n: '吃', name: '吃子', goal: 4, desc: '用「步」走到敵人身上擊殺 4 個敵人。' },
    flawless: { n: '無', name: '無傷', goal: 1, desc: '不受任何傷害通過這層。' },
  };

  // 無盡之塔：自訂角色的點數規則與魂晶工坊的解鎖項目
  const TOWER = {
    baseBudget: 10, budgetStep: 3,
    baseHp: 4, maxHp: 10, deckMin: 6, deckMax: 12,
    cardCost: [1, 2, 3], plusCost: 1, relicCost: 3, hpCost: 1, undoCost: 1, maxUndo: 3, handCost: 6,
    baseCards: ['king', 'knight', 'rook', 'bishop', 'slash', 'lance'],
    baseSkills: ['redraw'],
    baseRelics: ['aegis', 'fang', 'heart'],
    starts: [1, 6, 11, 16, 21, 31],
    unlocks: [
      { id: 'budget1', cat: 'core', name: '命盤擴充 I', cost: 30, desc: '構築點數 +3。' },
      { id: 'budget2', cat: 'core', name: '命盤擴充 II', cost: 80, req: 'budget1', desc: '構築點數 +3。' },
      { id: 'budget3', cat: 'core', name: '命盤擴充 III', cost: 150, req: 'budget2', desc: '構築點數 +3。' },
      { id: 'budget4', cat: 'core', name: '命盤擴充 IV', cost: 250, req: 'budget3', desc: '構築點數 +3。' },
      { id: 'budget5', cat: 'core', name: '命盤擴充 V', cost: 380, req: 'budget4', desc: '構築點數 +3。' },
      { id: 'budget6', cat: 'core', name: '命盤擴充 VI', cost: 550, req: 'budget5', desc: '構築點數 +3。' },
      { id: 'plus', cat: 'core', name: '精工', cost: 60, desc: '起始牌組可以放入升級過的牌（每張 +1 點）。' },
      { id: 'slot2', cat: 'core', name: '雙技', cost: 160, desc: '解鎖第二個技能欄位。' },
      { id: 'hand', cat: 'core', name: '多謀', cost: 200, desc: '能力值：可以花 6 點讓手牌上限 +1。' },
      { id: 'card:guard', cat: 'card', name: '架式', cost: 15 },
      { id: 'card:bolt', cat: 'card', name: '弩箭', cost: 20 },
      { id: 'card:shove', cat: 'card', name: '掌推', cost: 20 },
      { id: 'card:leap', cat: 'card', name: '飛躍', cost: 35 },
      { id: 'card:whirl', cat: 'card', name: '迴旋', cost: 35 },
      { id: 'card:hook', cat: 'card', name: '鉤鎖', cost: 40 },
      { id: 'card:swap', cat: 'card', name: '移形', cost: 45 },
      { id: 'card:blink', cat: 'card', name: '影遁', cost: 45 },
      { id: 'card:execute', cat: 'card', name: '斷首', cost: 90 },
      { id: 'card:queen', cat: 'card', name: '后行', cost: 110 },
      { id: 'skill:mend', cat: 'skill', name: '療傷', cost: 35 },
      { id: 'skill:shove', cat: 'skill', name: '崩拳', cost: 35 },
      { id: 'skill:blink', cat: 'skill', name: '影步', cost: 55 },
      { id: 'skill:swap', cat: 'skill', name: '換形', cost: 55 },
      { id: 'skill:lance', cat: 'skill', name: '穿雲', cost: 60 },
      { id: 'skill:whirl', cat: 'skill', name: '旋風', cost: 60 },
      { id: 'skill:seal', cat: 'skill', name: '封印', cost: 80 },
      { id: 'relic:thorns', cat: 'relic', name: '荊棘甲', cost: 30 },
      { id: 'relic:gate', cat: 'relic', name: '守門人', cost: 30 },
      { id: 'relic:rooted', cat: 'relic', name: '紮馬', cost: 40 },
      { id: 'relic:ram', cat: 'relic', name: '破城槌', cost: 40 },
      { id: 'relic:abyss', cat: 'relic', name: '深淵之喚', cost: 45 },
      { id: 'relic:bulwark', cat: 'relic', name: '鐵壁', cost: 40 },
      { id: 'relic:puppet', cat: 'relic', name: '傀儡絲', cost: 50 },
      { id: 'relic:quake', cat: 'relic', name: '震地靴', cost: 40 },
      { id: 'relic:lantern', cat: 'relic', name: '先知之燈', cost: 40 },
      { id: 'relic:momentum', cat: 'relic', name: '衝勁', cost: 45 },
      { id: 'relic:berserk', cat: 'relic', name: '狂戰之血', cost: 45 },
      { id: 'relic:hourglass', cat: 'relic', name: '時之沙漏', cost: 50 },
      { id: 'relic:conduit', cat: 'relic', name: '靈魂導管', cost: 60 },
      { id: 'relic:gambler', cat: 'relic', name: '賭徒骰', cost: 60 },
      { id: 'relic:bell', cat: 'relic', name: '回響之鈴', cost: 70 },
      { id: 'relic:spark', cat: 'relic', name: '連鎖閃電', cost: 70 },
      { id: 'relic:satchel', cat: 'relic', name: '戰術腰包', cost: 90 },
      { id: 'start:6', cat: 'start', name: '從第 6 層出發', cost: 80, best: 6, desc: '跳過前 5 層，出發前先挑 3 次補給。' },
      { id: 'start:11', cat: 'start', name: '從第 11 層出發', cost: 200, best: 11, req: 'start:6', desc: '跳過前 10 層，出發前先挑 6 次補給。' },
      { id: 'start:16', cat: 'start', name: '從第 16 層出發', cost: 380, best: 16, req: 'start:11', desc: '跳過前 15 層，出發前先挑 9 次補給。' },
      { id: 'start:21', cat: 'start', name: '從第 21 層出發', cost: 600, best: 21, req: 'start:16', desc: '跳過前 20 層，出發前先挑 12 次補給。' },
      { id: 'start:31', cat: 'start', name: '從第 31 層出發', cost: 1000, best: 31, req: 'start:21', desc: '跳過前 30 層，出發前先挑 18 次補給。' },
    ],
  };
  const draftPicks = (start) => Math.floor((start - 1) / 5) * 3;
  function budgetOf(unlocked) {
    let b = TOWER.baseBudget;
    for (let i = 1; i <= 6; i++) if (unlocked.includes('budget' + i)) b += TOWER.budgetStep;
    return b;
  }
  function buildCost(b) {
    let c = Math.max(0, b.hp - TOWER.baseHp) * TOWER.hpCost + (b.undo || 0) * TOWER.undoCost + (b.hand ? TOWER.handCost : 0);
    for (const [k, plus] of b.deck) c += TOWER.cardCost[CARDS[k].r] + (plus ? TOWER.plusCost : 0);
    c += b.relics.length * TOWER.relicCost;
    for (const id of b.skills) c += SKILLS[id].cost;
    return c;
  }
  // 回傳錯誤訊息陣列（空陣列表示可以出發）
  function validateBuild(b, unlocked) {
    const err = [];
    const un = (id) => unlocked.includes(id);
    if (buildCost(b) > budgetOf(unlocked)) err.push('構築點數超出上限');
    if (b.deck.length < TOWER.deckMin) err.push(`牌組至少要 ${TOWER.deckMin} 張`);
    if (b.deck.length > TOWER.deckMax) err.push(`牌組最多 ${TOWER.deckMax} 張`);
    if (b.hp < TOWER.baseHp || b.hp > TOWER.maxHp) err.push('生命超出範圍');
    if ((b.undo || 0) > TOWER.maxUndo) err.push('回溯次數超出範圍');
    if (b.hand && !un('hand')) err.push('尚未解鎖「多謀」');
    if (b.skills.length > (un('slot2') ? 2 : 1)) err.push('技能欄位不足');
    if (b.relics.length > RELIC_CAP) err.push(`遺物最多 ${RELIC_CAP} 件`);
    for (const [k, plus] of b.deck) {
      if (!TOWER.baseCards.includes(k) && !un('card:' + k)) err.push('尚未解鎖：' + CARDS[k].name);
      if (plus && !un('plus')) err.push('尚未解鎖「精工」');
    }
    for (const r of b.relics) if (!TOWER.baseRelics.includes(r) && !un('relic:' + r)) err.push('尚未解鎖：' + RELICS[r].name);
    for (const id of b.skills) if (!TOWER.baseSkills.includes(id) && !un('skill:' + id)) err.push('尚未解鎖：' + SKILLS[id].name);
    if (b.start > 1 && !un('start:' + b.start)) err.push('尚未解鎖這個起點');
    return [...new Set(err)];
  }

  /* ---------- 基本查詢 ---------- */
  const has = (S, r) => S.relics.includes(r);
  const hasMod = (S, m) => !!(S.mods && S.mods.includes(m));
  const hasAff = (e, a) => !!(e.affixes && e.affixes.includes(a));
  const endless = (S) => S.mode === 'endless';
  const BASE_HAND = 4;
  // 上限：遺物欄位與生命上限有天花板，取捨才有意義（也讓每一局長得不一樣）
  const RELIC_CAP = 6, HP_CAP = 12;
  const minDeck = (S) => handSize(S) + 3;
  const handSize = (S) => Math.max(2, BASE_HAND + (has(S, 'satchel') ? 1 : 0) + (S.handBonus || 0) - (hasMod(S, 'cursed') ? 1 : 0));
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
  // 迅捷：不佔用「步」或「技」的機會。S 可省略（只看牌本身）
  function isQuick(c, S) {
    return !!CARDS[c.k].quick || (c.plus && (c.k === 'bishop' || c.k === 'swap' || c.k === 'execute')) ||
      (!!S && c.k === 'guard' && has(S, 'bulwark'));
  }
  const ctype = (c) => CARDS[c.k].t;
  const quickNow = (S, c) => isQuick(c, S) || (hasMod(S, 'surge') && S.turn === 1);
  // 這張牌依照「先步後技」的規則現在能不能出（不看落點）
  function slotOK(S, c) {
    if (quickNow(S, c) || S.bonus > 0) return true;
    return ctype(c) === 'move' ? S.mv > 0 : S.st > 0;
  }
  function spendSlot(S, c) {
    if (quickNow(S, c)) return;
    if (ctype(c) === 'move') { if (S.mv > 0) S.mv = 0; else S.bonus--; }
    else if (S.st > 0) {
      // 出招之後這回合就不能再走；紮馬：還沒走過步的第一招不算數
      if (has(S, 'rooted') && !S.stepped && !S.rootUsed) S.rootUsed = true;
      else S.st = 0;
      S.mv = 0;
    }
    else S.bonus--;
  }
  function resetActs(S) { S.mv = 1; S.st = 1; S.bonus = 0; S.stepped = false; S.rootUsed = false; S.guard = 0; S.conduitN = 0; }
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
    if (r === 'heart') { S.maxHp = Math.min(HP_CAP, S.maxHp + 2); S.hp = Math.min(S.maxHp, S.hp + 2); }
    if (r === 'hourglass') S.undoLeft += 2;
  }
  function dropRelic(S, r) {
    if (!has(S, r)) return;
    S.relics = S.relics.filter((x) => x !== r);
    if (r === 'heart') { S.maxHp = Math.max(1, S.maxHp - 2); S.hp = Math.min(S.hp, S.maxHp); }
    if (r === 'hourglass') S.undoLeft = Math.max(0, S.undoLeft - 2);
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
    const isTower = o.mode === 'endless' && o.build;
    const heroId = HEROES[o.hero] ? o.hero : 'ranger';
    const hero = HEROES[heroId];
    const seed = (o.seed >>> 0) || 1;
    const hp0 = isTower ? o.build.hp : hero.hp;
    const S = {
      v: 3, mode: isTower ? 'endless' : 'story', seed, rng: seed, daily: !!o.daily, hero: isTower ? null : heroId,
      floor: 0, hp: hp0, maxHp: hp0,
      skills: [], handBonus: 0, undoBase: 1, mods: [], fire: [], door: null, doors: null,
      shards: 0, lastShards: 0, draftLeft: 0, startFloor: 1,
      cards: {}, deck: [], nextCard: 1, draw: [], hand: [], discard: [],
      relics: [], tiles: [], player: { x: 3, y: 6 }, enemies: [], spawns: [], reserve: [], cracks: [], nextUid: 1,
      turn: 1, par: 0, turnKills: 0, chain: 0, echoUsed: false, aegisUsed: false, undoLeft: 1, fangCount: 0,
      mv: 1, st: 1, bonus: 0, stepped: false, guard: 0, task: null, fs: null, taskDone: false,
      phase: 'player', rewards: null, boss: false, won: false, justWon: false,
      score: 0, floorDmg: 0, lastPar: false, lastFlawless: false,
      stats: { kills: 0, friendly: 0, pit: 0, bestChain: 0, dmgTaken: 0, turns: 0, floors: 0, blocked: 0 },
    };
    if (isTower) {
      const b = o.build;
      b.deck.forEach(([k, plus]) => addCard(S, k, plus));
      b.relics.forEach((r) => addRelic(S, r));
      S.skills = b.skills.map((id) => ({ id, left: 0 }));
      S.handBonus = b.hand ? 1 : 0;
      S.undoBase = 1 + (b.undo || 0);
      S.build = JSON.parse(JSON.stringify(b));
      S.startFloor = b.start || 1;
      if (S.startFloor > 1) {
        // 跳關：先挑幾次補給，再選門進塔
        S.floor = S.startFloor - 1;
        S.draftLeft = draftPicks(S.startFloor);
        S.phase = 'draft';
        S.rewards = genDraft(S);
        return S;
      }
    } else {
      hero.deck.forEach((k) => addCard(S, k, false));
      hero.relics.forEach((r) => addRelic(S, r));
    }
    startFloor(S, 1, [], null);
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
      if (has(S, 'abyss')) for (let k = 0; k < 2; k++) t[idx(rint(S, W), 1 + rint(S, H - 3))] = 'o';
      const floors = t.filter((c) => c === '.').length;
      if (floors >= (has(S, 'abyss') ? 34 : 36) && connected(t)) { S.tiles = t; return; }
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
  // 同時在場的敵人上限；無盡之塔第 30、45 層之後再各 +1（越高越擠，安全的格子越少）
  const maxActive = (S) => Math.min(8, 3 + Math.floor((Math.min(S.floor, 14) + 1) / 3)) + (hasMod(S, 'horde') ? 1 : 0) +
    (endless(S) ? (S.floor >= 30 ? 1 : 0) + (S.floor >= 45 ? 1 : 0) : 0);

  // 無盡之塔的成長曲線：血量成長很慢（保住連鎖的爽感），主要靠詞條與傷害變強
  function towerScale(S, d) {
    const f = S.floor;
    if (!endless(S)) return { hp: f > 10 ? (d.boss ? f - 10 : Math.floor((f - 8) / 4)) : 0, dmg: 0 };
    const dmg = Math.floor(Math.max(0, f - 15) / 8);
    if (d.boss) return { hp: Math.floor((f - 5) * 0.8) + Math.max(0, f - 25), dmg };
    return { hp: Math.floor(Math.max(0, f - 12) / 10) + Math.floor(Math.max(0, f - 30) / 8), dmg };
  }
  function affixAllowed(type, a) {
    const d = ENEMIES[type];
    if (d.boss) return ['shield', 'tough', 'fierce', 'regen', 'phantom', 'thorny', 'volatile'].includes(a);
    if (a === 'swift') return ['imp', 'spiker', 'puffer', 'archer', 'brute'].includes(type);
    if (a === 'volatile') return type !== 'puffer';
    if (a === 'thorny') return type !== 'spiker';
    if (a === 'anchored') return !d.heavy;
    if (a === 'split') return type !== 'imp';
    if (a === 'ward') return type !== 'spiker'; // 結界和荊棘不會同時出現：總要留一種打法
    return true;
  }
  function rollAffixes(S, type) {
    const f = S.floor; const d = ENEMIES[type];
    let n = 0;
    if (d.boss) n = f >= 30 ? 2 : f >= 15 ? 1 : 0;
    else {
      if (rnd(S) < Math.min(0.85, Math.max(0, (f - 2) * 0.07))) n++;
      if (n && rnd(S) < Math.min(0.7, Math.max(0, (f - 11) * 0.05))) n++;
      if (n > 1 && rnd(S) < Math.min(0.5, Math.max(0, (f - 24) * 0.04))) n++;
    }
    if (hasMod(S, 'elite')) n++;
    const pool = shuffle(S, Object.keys(AFFIXES).filter((a) => affixAllowed(type, a) && a !== 'swift'));
    const out = [];
    for (const a of pool) {
      if (out.length >= n) break;
      if ((a === 'ward' && out.includes('thorny')) || (a === 'thorny' && out.includes('ward'))) continue;
      out.push(a);
    }
    if (out.length && affixAllowed(type, 'swift') && rnd(S) < 0.15) out[out.length - 1] = 'swift';
    if (hasMod(S, 'swift') && affixAllowed(type, 'swift') && !out.includes('swift')) out.push('swift');
    return out;
  }

  function startFloor(S, f, ev, door) {
    S.floor = f;
    S.boss = f % 5 === 0;
    S.door = door || null;
    S.mods = door ? door.mods.slice() : [];
    S.doors = null;
    genTiles(S);
    S.enemies = []; S.spawns = []; S.reserve = []; S.cracks = []; S.fire = [];
    S.player = { x: -9, y: -9 };
    const p = randomEmpty(S, (x, y) => y >= H - 2) || randomEmpty(S);
    S.player = { x: p.x, y: p.y };
    const far = (x, y) => y <= 3 && cheb({ x, y }, S.player) >= 3;

    if (S.boss) {
      const bossType = (f / 5) % 2 === 1 ? 'kboss' : 'qboss';
      S.bossName = ENEMIES[bossType].name;
      const b = randomEmpty(S, (x, y) => y <= 1 && cheb({ x, y }, S.player) >= 4) || randomEmpty(S, far) || randomEmpty(S);
      spawnEnemy(S, bossType, b.x, b.y, ev, true, endless(S));
      const minions = f >= 10 ? ['imp', 'imp', 'archer'] : ['imp', 'imp'];
      for (const m of minions) { const t = randomEmpty(S, far) || randomEmpty(S); if (t) spawnEnemy(S, m, t.x, t.y, ev, true, endless(S)); }
      S.par = 14;
    } else {
      // 無盡之塔：第 20 層之後敵人數量繼續緩慢成長
      const fe = endless(S) ? Math.min(f, 14) + Math.max(0, f - 20) * 0.2 : f;
      let budget = 3 + Math.round(fe * 1.25 + Math.max(0, fe - 5) * 0.4);
      if (hasMod(S, 'horde')) budget = Math.round(budget * 1.5);
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

    if (hasMod(S, 'fire')) {
      const n = 5 + Math.min(4, Math.floor(f / 10));
      for (let i = 0; i < n; i++) {
        const t = randomEmpty(S, (x, y) => !S.fire.includes(idx(x, y)) && cheb({ x, y }, S.player) >= 1);
        if (t) S.fire.push(idx(t.x, t.y));
      }
    }
    S.collapseAt = hasMod(S, 'crumble') ? 2 : 0;
    if (hasMod(S, 'spring')) healPlayer(S, 2, ev);
    for (const sk of S.skills || []) sk.left = 0;
    S.turn = 1; S.played = 0; S.turnKills = 0; S.chain = 0; S.echoUsed = false; S.aegisUsed = false; S.floorDmg = 0;
    resetActs(S);
    S.task = (door && door.task) || null; S.taskDone = false;
    S.fs = { friendly: 0, pit: 0, maxTK: 0, strikeK: 0, moveK: 0 };
    S.undoLeft = (S.undoBase || 1) + (has(S, 'hourglass') ? 2 : 0);
    S.draw = shuffle(S, S.deck.slice()); S.hand = []; S.discard = [];
    drawTo(S, handSize(S), ev);
    for (const e of S.enemies.slice().sort((a, b) => a.uid - b.uid)) { e.fresh = false; enemyTurn(S, e, ev, false); }
    placeSpawnMarkers(S, ev);
    S.phase = 'player';
    S.rewards = null;
  }

  function spawnEnemy(S, type, x, y, ev, fresh, gen) {
    const d = ENEMIES[type];
    const sc = towerScale(S, d);
    // 故事模式用「精英」，無盡之塔改用詞條
    const elite = !!gen && !endless(S) && !d.boss && S.floor >= 2 && rnd(S) < Math.min(0.6, 0.2 + 0.07 * (S.floor - 2));
    const affixes = gen && endless(S) ? rollAffixes(S, type) : [];
    const hp = d.hp + sc.hp + (elite ? 1 : 0) + (affixes.includes('tough') ? 2 : 0);
    const e = { uid: S.nextUid++, type, x, y, hp, maxHp: hp, elite, affixes, shield: affixes.includes('shield') ? 1 : 0, dmgUp: sc.dmg,
      intent: null, cd: type === 'warlock' ? 2 : 0, tick: 0, stun: false, fresh: !!fresh };
    S.enemies.push(e);
    ev.push({ t: 'spawn', uid: e.uid, type, x, y, hp, elite, affixes, shield: e.shield });
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
    if (S.phase !== 'player') return [];
    const c = S.cards[S.hand[hi]];
    if (!c || !slotOK(S, c)) return [];
    return cardTargets(S, c);
  }
  const immovable = (e) => !!ENEMIES[e.type].heavy || hasAff(e, 'anchored');
  function cardTargets(S, c) {
    const out = [];
    if (!c) return out;
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
          if (e && (!immovable(e) || has(S, 'ram'))) add(e.x, e.y, 'push');
        }
        break;
      case 'swap':
        for (const e of alive(S)) if (!ENEMIES[e.type].boss && !hasAff(e, 'anchored') && cheb(e, P) <= 3) add(e.x, e.y, 'swap');
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
      case 'slash':
        for (const d of D8) {
          const x = P.x + d[0], y = P.y + d[1];
          if (!inb(x, y)) continue;
          if (sweepTiles(S, P, { dx: d[0], dy: d[1] }).some(([tx, ty]) => enemyAt(S, tx, ty))) add(x, y, 'attack', { dir: d });
        }
        break;
      case 'bolt':
        for (const d of (c.plus ? D8 : D4)) {
          const r = traceLine(S, P.x, P.y, d[0], d[1], { stopAtEntity: true });
          if (r.hit) add(r.hit[0], r.hit[1], 'attack', { dir: d });
        }
        break;
      case 'hook':
        for (const d of D4) {
          for (let i = 1; i <= 3; i++) {
            const x = P.x + d[0] * i, y = P.y + d[1] * i;
            if (!inb(x, y) || tileAt(S, x, y) === '#') break;
            const e = enemyAt(S, x, y);
            if (e) { if (i >= 2 && !immovable(e)) add(x, y, 'push', { dir: d }); break; }
          }
        }
        break;
      case 'execute':
        for (const [dx, dy] of D8) if (enemyAt(S, P.x + dx, P.y + dy)) add(P.x + dx, P.y + dy, 'attack');
        break;
      case 'guard':
        add(P.x, P.y, 'self');
        break;
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
    let d = c.k === 'lance' ? 2 : ((c.k === 'king' || c.k === 'queen' || c.k === 'knight') && c.plus ? 2 : 1);
    if (c.k === 'execute' && ctx && ctx.target && ctx.target.hp < ctx.target.maxHp) d = 3;
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
    if (S.guard) {
      const g = S.guard; S.guard = 0;
      ev.push({ t: 'block', x: S.player.x, y: S.player.y, src: 'guard' });
      if (g === 2) {
        ev.push({ t: 'ring', x: S.player.x, y: S.player.y });
        for (const e of D8.map(([dx, dy]) => enemyAt(S, S.player.x + dx, S.player.y + dy)).filter(Boolean)) damageEnemy(S, e, 1, ev, 'thorns');
      }
      return;
    }
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
  // how：'melee' 近身攻擊（會被荊棘刺到）、undefined/'player' 你的其他傷害、'enemy' 敵人打敵人……
  function damageEnemy(S, e, amt, ev, how) {
    if (!e || e.dead) return false;
    const k = hurtEnemy(S, e, amt, ev, how);
    if (how === 'melee') prick(S, e, ev);
    return k;
  }
  function hurtEnemy(S, e, amt, ev, how) {
    if (how === 'burstp') {
      if (hasAff(e, 'phantom')) { ev.push({ t: 'text', x: e.x, y: e.y, s: '幽影' }); return false; }
      how = 'player';
    }
    if (hasAff(e, 'phantom') && how === 'enemy') {
      ev.push({ t: 'text', x: e.x, y: e.y, s: '幽影' });
      return false;
    }
    if (hasAff(e, 'ward') && (how === undefined || how === 'player' || how === 'conduit' || how === 'thorns')) {
      ev.push({ t: 'text', x: e.x, y: e.y, s: '結界' });
      return false;
    }
    if (how === 'enemy' && has(S, 'puppet')) amt++;
    if (e.shield > 0 && amt > 0) {
      e.shield = 0;
      ev.push({ t: 'shield', uid: e.uid, x: e.x, y: e.y });
      return false;
    }
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
    if ((e.type === 'puffer' || hasAff(e, 'volatile')) && how !== 'pit' && how !== 'boss') {
      const tiles = D8.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => inb(x, y) && tileAt(S, x, y) !== '#');
      ev.push({ t: 'atk', uid: e.uid, k: 'burst', tiles });
      ev.push({ t: 'text', x: e.x, y: e.y, s: '砰！', c: 'gold' });
      const dmg = e.burstDmg || 1;
      for (const [x, y] of tiles) {
        const o = entityAt(S, x, y);
        if (o === 'P') damagePlayer(S, dmg, ev);
        else if (o) damageEnemy(S, o, dmg, ev, enemyPhase ? 'enemy' : 'burstp');
      }
    }
    if (hasAff(e, 'split') && how !== 'pit' && how !== 'boss') {
      const spots = shuffle(S, D8.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy })).filter((t) => isEmpty(S, t.x, t.y)));
      ev.push({ t: 'text', x: e.x, y: e.y, s: '分裂！', c: 'violet' });
      for (const t of spots.slice(0, 2)) spawnEnemy(S, 'imp', t.x, t.y, ev, true, false);
    }
    if (how === 'self') return;
    S.stats.kills++;
    let pts = 10;
    if (how === 'pit') {
      S.stats.pit++; pts += 10; if (S.fs) S.fs.pit++;
      ev.push({ t: 'text', x: e.x, y: e.y, s: '墜入深淵', c: 'violet' });
    }
    if (how === 'enemy') {
      S.stats.friendly++; pts += 15; if (S.fs) S.fs.friendly++;
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
    if (has(S, 'conduit') && (S.conduitN || 0) < 2) {
      S.conduitN = (S.conduitN || 0) + 1;
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
    const how = S.phase === 'enemy' ? 'enemy' : 'player';
    const ram = has(S, 'ram'), bump = 1 + (ram ? 1 : 0);
    const daze = (z) => { if (ram && z && z !== 'P' && !z.dead && z.intent) { z.intent = null; ev.push({ t: 'text', x: z.x, y: z.y, s: '打斷', c: 'violet' }); } };
    if (immovable(e)) {
      // 破城槌：推不動的敵人改為硬吃一次撞擊
      if (ram) { ev.push({ t: 'bump', uid: e.uid, dx, dy }); damageEnemy(S, e, bump, ev, how); daze(e); }
      else ev.push({ t: 'text', x: e.x, y: e.y, s: '紋風不動' });
      return;
    }
    // 長距離推擠（一路推到底）：每滑行 1 格，撞擊傷害 +1
    const hit = (m) => bump + (dist > 1 ? m : 0);
    for (let m = 0; m < dist; m++) {
      const nx = e.x + dx, ny = e.y + dy;
      const t = tileAt(S, nx, ny);
      if (t === '#') { ev.push({ t: 'bump', uid: e.uid, dx, dy }); damageEnemy(S, e, hit(m), ev, how); daze(e); return; }
      if (t === 'o') {
        e.x = nx; e.y = ny; ev.push({ t: 'move', uid: e.uid, x: nx, y: ny });
        killEnemy(S, e, ev, 'pit'); return;
      }
      const o = entityAt(S, nx, ny);
      if (o === 'P') { ev.push({ t: 'bump', uid: e.uid, dx, dy }); damageEnemy(S, e, hit(m), ev, how); daze(e); return; }
      if (o) {
        ev.push({ t: 'bump', uid: e.uid, dx, dy });
        damageEnemy(S, e, hit(m), ev, how); damageEnemy(S, o, hit(m), ev, how); daze(e); daze(o); return;
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
    if (e.type !== 'spiker' && !hasAff(e, 'thorny')) return;
    if (S.hp <= 0) return;
    ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '被刺！' });
    damagePlayer(S, 1, ev);
  }
  const adjFoes = (S) => D8.map((d) => [d, enemyAt(S, S.player.x + d[0], S.player.y + d[1])]).filter((a) => a[1]);

  /* ---------- 出牌 ---------- */
  function doCard(S, c, tg, ev) {
    const P = S.player;
    if (ctype(c) === 'move') S.stepped = true;
    switch (c.k) {
      case 'king': case 'rook': case 'bishop': case 'queen': {
        const [dx, dy] = tg.dir; const dist = cheb(P, tg);
        if (tg.kind === 'attack') {
          const e = enemyAt(S, tg.x, tg.y);
          if (dist > 1) movePlayer(S, tg.x - dx, tg.y - dy, ev, 'slide');
          ev.push({ t: 'lunge', x: tg.x, y: tg.y });
          const killed = damageEnemy(S, e, cardDmg(S, c, { dist }), ev, 'melee');
          if (S.hp <= 0) break;
          // 連鎖反應（分裂）可能讓目標格又站了東西：那就停在原地
          if (killed) { if (!enemyAt(S, tg.x, tg.y)) movePlayer(S, tg.x, tg.y, ev, 'step'); }
          else if (c.k === 'rook' && c.plus) pushEnemy(S, e, dx, dy, 1, ev);
        } else movePlayer(S, tg.x, tg.y, ev, 'slide');
        break;
      }
      case 'knight': case 'leap': {
        let landed = false;
        if (tg.kind === 'attack') {
          const e = enemyAt(S, tg.x, tg.y);
          ev.push({ t: 'lunge', x: tg.x, y: tg.y });
          const killed = damageEnemy(S, e, cardDmg(S, c, {}), ev, 'melee');
          if (S.hp <= 0) break;
          if (killed && !enemyAt(S, tg.x, tg.y)) { movePlayer(S, tg.x, tg.y, ev, 'jump'); landed = true; }
        } else { movePlayer(S, tg.x, tg.y, ev, 'jump'); landed = true; }
        if (landed) {
          const foes = adjFoes(S);
          // 落地衝擊算是出招：要用掉這回合的「技」，沒有的話用掉一次額外行動；兩者都沒有就不會觸發
          const shock = c.k === 'leap' && c.plus && foes.length && (S.st > 0 || S.bonus > 0);
          if (shock) {
            if (S.st > 0) S.st = 0; else S.bonus--;
            ev.push({ t: 'ring', x: P.x, y: P.y });
            for (const [, e] of foes) { damageEnemy(S, e, 1, ev, 'melee'); if (S.hp <= 0) return; }
          }
          if (has(S, 'quake')) for (const [d, e] of adjFoes(S)) pushEnemy(S, e, d[0], d[1], 1, ev);
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
        for (const [d, e] of adjFoes(S)) {
          const k = damageEnemy(S, e, cardDmg(S, c, {}), ev, 'melee');
          if (S.hp <= 0) return;
          if (!k && c.plus) pushEnemy(S, e, d[0], d[1], 1, ev);
        }
        break;
      }
      case 'slash': {
        const [dx, dy] = tg.dir;
        const tiles = sweepTiles(S, P, { dx, dy });
        ev.push({ t: 'slash', tiles, dx, dy });
        const foes = tiles.map(([x, y]) => enemyAt(S, x, y)).filter(Boolean);
        for (const e of foes) {
          const k = damageEnemy(S, e, cardDmg(S, c, {}), ev, 'melee');
          if (S.hp <= 0) return;
          if (!k && c.plus && !e.dead) pushEnemy(S, e, e.x - P.x, e.y - P.y, 1, ev);
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
      case 'bolt': {
        const e = enemyAt(S, tg.x, tg.y);
        ev.push({ t: 'bolt', x1: P.x, y1: P.y, x2: tg.x, y2: tg.y });
        damageEnemy(S, e, cardDmg(S, c, {}), ev);
        break;
      }
      case 'hook': {
        const e = enemyAt(S, tg.x, tg.y);
        const [dx, dy] = tg.dir;
        ev.push({ t: 'bolt', x1: P.x, y1: P.y, x2: tg.x, y2: tg.y, hook: true });
        for (let guard = 0; guard < 6 && !e.dead; guard++) {
          const nx = e.x - dx, ny = e.y - dy;
          if (nx === P.x && ny === P.y) break;
          const t = tileAt(S, nx, ny);
          if (t === '#' || entityAt(S, nx, ny)) break;
          e.x = nx; e.y = ny;
          ev.push({ t: 'move', uid: e.uid, x: nx, y: ny, fast: true });
          if (t === 'o') { killEnemy(S, e, ev, 'pit'); break; }
        }
        if (c.plus && !e.dead && e.intent) { e.intent = null; ev.push({ t: 'text', x: e.x, y: e.y, s: '打斷', c: 'violet' }); }
        break;
      }
      case 'execute': {
        const e = enemyAt(S, tg.x, tg.y);
        ev.push({ t: 'lunge', x: tg.x, y: tg.y });
        ev.push({ t: 'slash', tiles: [[tg.x, tg.y]], dx: tg.x - P.x, dy: tg.y - P.y });
        damageEnemy(S, e, cardDmg(S, c, { target: e }), ev, 'melee');
        break;
      }
      case 'guard':
        S.guard = c.plus ? 2 : 1;
        ev.push({ t: 'guard', x: P.x, y: P.y });
        break;
      case 'blink':
        movePlayer(S, tg.x, tg.y, ev, 'blink');
        break;
    }
  }

  // 擊殺：多一次行動（步或技都可以）
  function onKill(S, ev) {
    S.bonus++;
    S.chain++;
    S.stats.bestChain = Math.max(S.stats.bestChain, S.chain);
    if (S.chain >= 2) S.score += 10 * (S.chain - 1);
    if (S.fs) S.fs.maxTK = Math.max(S.fs.maxTK, S.turnKills);
    ev.push({ t: 'chain', n: S.chain });
  }
  // 手上還有沒有「現在就能出」的牌
  const canAct = (S) => S.hand.some((_, hi) => legalTargets(S, hi).length > 0);

  function applyCard(S, hi, x, y, ev) {
    if (S.phase !== 'player') return null;
    const id = S.hand[hi]; const c = S.cards[id];
    if (!c) return null;
    const tg = legalTargets(S, hi).find((t) => t.x === x && t.y === y);
    if (!tg) return null;
    S.hand.splice(hi, 1);
    S.played++;
    spendSlot(S, c);
    const k0 = S.turnKills;
    ev.push({ t: 'play', k: c.k, plus: c.plus });
    doCard(S, c, tg, ev);
    cleanup(S);
    const killed = S.turnKills > k0;
    if (S.fs && killed) S.fs[ctype(c) === 'move' ? 'moveK' : 'strikeK'] += S.turnKills - k0;
    if (killed && has(S, 'bell') && !S.echoUsed) {
      S.echoUsed = true; S.hand.push(id);
      ev.push({ t: 'text', x: S.player.x, y: S.player.y, s: '回響！', c: 'gold' });
    } else S.discard.push(id);
    if (killed) onKill(S, ev);
    // 擊殺後一定停下來讓你決定（可以用技能或結束回合）；否則手上沒有能出的牌就自動結束
    return { killed, cont: S.hp > 0 && (killed || canAct(S)) };
  }

  /* ---------- 主動技能 ---------- */
  function skillTargets(S, si) {
    const sk = S.skills && S.skills[si];
    if (!sk || S.phase !== 'player' || sk.left > 0) return [];
    const d = SKILLS[sk.id];
    if (d.card) return cardTargets(S, d.card);
    if (d.target === 'enemy') return alive(S).filter((e) => e.intent).map((e) => ({ x: e.x, y: e.y, kind: 'seal' }));
    if (sk.id === 'mend' && S.hp >= S.maxHp) return [];
    return [{ x: S.player.x, y: S.player.y, kind: 'self' }];
  }
  function applySkill(S, si, x, y, ev) {
    const tg = skillTargets(S, si).find((t) => t.x === x && t.y === y);
    if (!tg) return null;
    const sk = S.skills[si], d = SKILLS[sk.id];
    sk.left = d.cd;
    const k0 = S.turnKills;
    ev.push({ t: 'skill', id: sk.id });
    if (d.card) doCard(S, d.card, tg, ev);
    else if (sk.id === 'redraw') { S.discard.push(...S.hand); S.hand = []; drawTo(S, handSize(S), ev); }
    else if (sk.id === 'mend') healPlayer(S, 1, ev);
    else if (sk.id === 'seal') {
      const e = enemyAt(S, x, y);
      if (e) { e.intent = null; ev.push({ t: 'text', x: e.x, y: e.y, s: '封印', c: 'violet' }); }
    }
    cleanup(S);
    const killed = S.turnKills > k0;
    if (killed) onKill(S, ev);
    return { killed, cont: S.hp > 0 };
  }
  function useSkill(S, si, x, y) {
    if (S.phase !== 'player') return null;
    const ev = [];
    const r = applySkill(S, si, x, y, ev);
    if (!r) return null;
    if (S.hp <= 0) return ev;
    checkClear(S, ev);
    return ev;
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
    resolveFire(S, ev); cleanup(S);
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
    for (const e of S.enemies) {
      if (hasAff(e, 'regen') && e.hp < e.maxHp) { e.hp++; ev.push({ t: 'eheal', uid: e.uid, x: e.x, y: e.y }); }
    }
    for (const sk of S.skills || []) if (sk.left > 0) sk.left--;
    placeSpawnMarkers(S, ev);
    placeCracks(S, ev);
    S.turn++; S.stats.turns++;
    S.turnKills = 0; S.chain = 0; S.echoUsed = false; S.played = 0;
    resetActs(S);
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

  function resolveFire(S, ev) {
    if (!S.fire || !S.fire.length) return;
    const hit = [];
    for (const i of S.fire) {
      const x = i % W, y = (i / W) | 0;
      if (entityAt(S, x, y)) hit.push([x, y]);
    }
    if (!hit.length) return;
    ev.push({ t: 'burn', tiles: hit });
    for (const [x, y] of hit) {
      const o = entityAt(S, x, y);
      if (o === 'P') damagePlayer(S, 1, ev);
      else if (o) damageEnemy(S, o, 1, ev, 'fire');
      if (S.hp <= 0) return;
    }
  }

  // 深淵上升：超過標準回合後，地面開始崩塌（提前一回合標示）
  const collapseTurn = (S) => S.collapseAt || S.par;
  function placeCracks(S, ev) {
    const at = collapseTurn(S);
    if (S.turn < at) return;
    let floors = 0;
    for (const t of S.tiles) if (t === '.') floors++;
    const n = Math.min(3, 1 + Math.floor((S.turn - at) / 3));
    if (S.turn === at) ev.push({ t: 'log', s: '深淵開始上升，地面即將崩塌！' });
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
      if (S.fire) S.fire = S.fire.filter((i) => i !== idx(k.x, k.y));
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
    if (!endless(S) && S.boss && S.floor === 10 && !S.won) { S.won = true; S.justWon = true; }
    S.taskDone = !!S.task && taskProgress(S) >= TASKS[S.task].goal;
    // 魂晶：無盡之塔越高越值錢；故事模式也給一點，兩邊的進度是相通的
    let gain;
    if (endless(S)) {
      gain = Math.round((3 + S.floor * 0.8) * ((S.door && S.door.bounty) || 1));
      if (S.boss) gain += 10 + S.floor;
      if (S.floor % 10 === 0) gain += 20;
      if (S.taskDone) gain = Math.round(gain * 1.5);
    } else gain = 2 + (S.boss ? 10 : 0) + (S.justWon ? 30 : 0);
    S.shards += gain; S.lastShards = gain;
    S.rewards = genRewards(S);
    ev.push({ t: 'clear', floor: S.floor, shards: gain, task: S.taskDone ? S.task : null });
    return true;
  }
  function taskProgress(S) {
    const f = S.fs; if (!f || !S.task) return 0;
    switch (S.task) {
      case 'chain': return f.maxTK;
      case 'friendly': return f.friendly;
      case 'pit': return f.pit;
      case 'strike': return f.strikeK;
      case 'capture': return f.moveK;
      case 'flawless': return S.floorDmg === 0 ? 1 : 0;
    }
    return 0;
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
        push(it.x, it.y, it.dmg || 2, 'hit', { land: true });
        for (const [dx, dy] of D8) {
          const x = it.x + dx, y = it.y + dy;
          if (tileAt(S, x, y) !== '#' && !(x === e.x && y === e.y)) push(x, y, (it.dmg || 2) - 1, 'hit');
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
          damagePlayer(S, it.dmg || 2, ev);
        } else {
          if (o) killEnemy(S, o, ev, 'enemy');
          e.x = it.x; e.y = it.y;
          ev.push({ t: 'move', uid: e.uid, x: it.x, y: it.y, jump: true });
        }
        if (S.hp <= 0) break;
        ev.push({ t: 'atk', uid: e.uid, k: 'slam', tiles: ring });
        for (const [x, y] of ring) if (!(x === e.x && y === e.y)) hitTile(S, x, y, (it.dmg || 2) - 1, ev, e);
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
    // 疾行：再想一次（多走一步，重新鎖定攻擊）
    if (canMove && hasAff(e, 'swift') && !e.stun && affixAllowed(e.type, 'swift')) enemyThink(S, e, ev, true);
    if (e.intent && e.intent.dmg) e.intent.dmg += (e.elite ? 1 : 0) + (hasAff(e, 'fierce') ? 1 : 0) + (e.dmgUp || 0);
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
        if (best) e.intent = { k: 'leap', x: best.x, y: best.y, dmg: 2 };
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
  // 生命上限到頂之後，「強健」改成「休息」
  const hpOpt = (S, n) => (S.maxHp >= HP_CAP ? { t: 'heal', n: 2 } : { t: 'maxhp', n });
  function genRewards(S) {
    const door = S.door || {};
    const n = 3 + (has(S, 'gambler') ? 1 : 0) + (S.lastPar ? 1 : 0) + (door.extra || 0) + (S.taskDone ? 1 : 0);
    let opts = [];
    if (S.boss) {
      opts = relicOpts(S, n);
      while (opts.length < n) opts.push(hpOpt(S, 1));
      return opts;
    }
    opts.push(cardOpt(S, []));
    if (S.deck.some((id) => !S.cards[id].plus)) opts.push({ t: 'upgrade' });
    const r = rnd(S);
    if (r < 0.38) { const ro = relicOpts(S, 1); if (ro.length) opts.push(ro[0]); }
    else if (r < 0.66) opts.push(S.hp < S.maxHp ? { t: 'heal', n: 2 } : hpOpt(S, 1));
    else if (r < 0.84 && S.deck.length > minDeck(S)) opts.push({ t: 'remove' });
    else opts.push(hpOpt(S, 1));
    if (door.relic && !opts.some((o) => o.t === 'relic')) { const ro = relicOpts(S, 1); if (ro.length) opts.push(ro[0]); }
    while (opts.length < n) opts.push(cardOpt(S, opts.filter((o) => o.t === 'card').map((o) => o.k)));
    return opts;
  }
  // 跳關時的起始補給
  function genDraft(S) {
    const n = 3 + (has(S, 'gambler') ? 1 : 0);
    if (S.draftLeft % 3 === 0) {
      const opts = relicOpts(S, n);
      while (opts.length < n) opts.push(hpOpt(S, 1));
      return opts;
    }
    const opts = [cardOpt(S, [])];
    if (S.deck.some((id) => !S.cards[id].plus)) opts.push({ t: 'upgrade' });
    if (S.draftLeft % 3 === 2 && S.deck.length > minDeck(S)) opts.push({ t: 'remove' });
    while (opts.length < n) opts.push(cardOpt(S, opts.filter((o) => o.t === 'card').map((o) => o.k)));
    return opts;
  }
  // 選門：越危險的門，魂晶越多、獎勵越好
  function pickMods(S, n, good) {
    const next = S.floor + 1;
    const pool = shuffle(S, Object.keys(MODS).filter((m) => MODS[m].bad === !good && MODS[m].from <= next));
    return pool.slice(0, n);
  }
  // 高塔的壓力：第 30 層起每道門多一個干擾，第 45 層起多兩個
  const pressure = (f) => (f >= 30 ? 1 : 0) + (f >= 45 ? 1 : 0);
  function genDoors(S) {
    const next = S.floor + 1, pr = pressure(next);
    if (next % 5 === 0) {
      return [{ boss: true, mods: pickMods(S, (next >= 15 ? 1 : 0) + pr, false), bounty: 1.5, extra: 0, relic: true }];
    }
    const calm = pr ? pickMods(S, pr, false) : [];
    if (rnd(S) < 0.5) calm.push(...pickMods(S, 1, true));
    const doors = [{ tier: 0, mods: calm, bounty: 1, extra: 0 }];
    doors.push({ tier: 1, mods: pickMods(S, 1 + pr, false), bounty: 1.5, extra: 1 });
    if (next >= 3) doors.push({ tier: 2, mods: pickMods(S, 2 + pr, false), bounty: 2.2, extra: 1, relic: true });
    // 每道門各帶一個不同的懸賞（第 2 層起）
    if (next >= 2) {
      const tasks = shuffle(S, Object.keys(TASKS));
      doors.forEach((d, i) => { d.task = tasks[i]; });
    }
    return doors;
  }
  function chooseDoor(S, i) {
    if (S.phase !== 'door' || !S.doors || !S.doors[i]) return null;
    const ev = [];
    startFloor(S, S.floor + 1, ev, S.doors[i]);
    return ev;
  }
  function applyReward(S, i, param) {
    if ((S.phase !== 'reward' && S.phase !== 'draft') || !S.rewards) return null;
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
          if (!S.deck.includes(param) || S.deck.length <= minDeck(S)) return null;
          S.deck = S.deck.filter((id) => id !== param); delete S.cards[param]; break;
        case 'relic':
          // 欄位滿了要先丟掉一件（param = 要丟的遺物）
          if (S.relics.length >= RELIC_CAP) { if (!has(S, param)) return null; dropRelic(S, param); }
          addRelic(S, o.r); break;
        case 'heal': healPlayer(S, o.n, ev); break;
        case 'maxhp': { const g = Math.min(o.n, HP_CAP - S.maxHp); S.maxHp += g; S.hp += Math.max(0, g); break; }
      }
    } else S.score += 20; // 略過獎勵
    S.justWon = false;
    if (S.phase === 'draft') {
      S.draftLeft--;
      if (S.draftLeft > 0) { S.rewards = genDraft(S); return ev; }
    }
    S.rewards = null;
    if (endless(S)) { S.phase = 'door'; S.doors = genDoors(S); return ev; }
    startFloor(S, S.floor + 1, ev, null);
    return ev;
  }

  /* ---------- 預覽（滑鼠移到格子上時，模擬結果） ---------- */
  const clone = (S) => JSON.parse(JSON.stringify(S));
  function simulateEnd(T) {
    // 回傳回合結束時玩家會受到的傷害（含增援阻擋）
    const before = T.hp; const ev = [];
    T.phase = 'enemy';
    resolveAttacks(T, ev); cleanup(T);
    if (T.hp > 0) { resolveFire(T, ev); cleanup(T); }
    if (T.hp > 0) { resolveCracks(T, ev); cleanup(T); }
    if (T.hp > 0) resolveSpawns(T, ev);
    return Math.max(0, before - T.hp);
  }
  // a：手牌索引（數字），或 { si } 表示技能
  function preview(S, a, x, y) {
    const T = clone(S); const ev = [];
    let r;
    const isSkill = a && typeof a === 'object';
    if (isSkill) { r = applySkill(T, a.si, x, y, ev); if (!r) return null; }
    else if (a < 0) r = { killed: false, cont: false };
    else { r = applyCard(T, a, x, y, ev); if (!r) return null; }
    const res = { T, killed: r.killed, cont: r.cont && (isSkill || T.hand.length > 0), cleared: false, dmg: 0, dead: T.hp <= 0, kills: [] };
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
    W, H, D8, KN, CARDS, ENEMIES, RELICS, HEROES, SKILLS, AFFIXES, MODS, TOWER, TASKS, TYPE_NAME, BASE_HAND, RELIC_CAP, HP_CAP, minDeck,
    newRun, legalTargets, cardTargets, playCard, waitTurn, canWait, applyReward, chooseDoor, computeThreats, intentArea, preview,
    skillTargets, useSkill, budgetOf, buildCost, validateBuild, draftPicks, taskProgress,
    isQuick, quickNow, slotOK, ctype, handSize, hashStr, idx, inb, alive, tileAt, has, hasMod, hasAff, collapseTurn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
