'use strict';
// =====================================================================
//  ЗАДАНИЯ ВОЛНЫ — одно случайное задание на волну (считает хост)
// =====================================================================
const CH_REWARDS = {
  crate: {
    text: 'Ящик с оружием + очки',
    give() {
      const n = Math.max(1, Math.ceil(G.pc / 2));
      for (let i = 0; i < n; i++) {
        const p = pick(G.players.filter((q) => !q.dead)) || G.players[0];
        G.pickups.push(makePickup('weapon', p.x + rand(-60, 60), p.y + rand(-60, 60)));
      }
    },
  },
  heal: {
    text: 'Полное лечение + 50 энергии',
    give() {
      for (const p of G.players) if (!p.dead) { p.hp = p.maxHp; p.energy = Math.min(100, p.energy + 50); }
    },
  },
  upgrade: {
    text: 'Бесплатное улучшение каждому',
    give() {
      for (const p of G.players) {
        const u = rollUpgrades(p)[0];
        if (!u) continue;
        p.ups[u.id] = (p.ups[u.id] || 0) + 1;
        u.apply(p);
        fx('text', Math.round(p.x), Math.round(p.y - 50), '+ ' + u.name, RARITY[u.rarity].color, 18, 1);
      }
    },
  },
};

// info: { counts: {тип: сколько в волне}, total, bestType }
const CHALLENGES = {
  kills: {
    w: 3, hard: false,
    ok: (info) => !!info.bestType,
    make(n, info) {
      const t = info.bestType;
      const goal = Math.max(3, Math.round(info.counts[t] * 0.7));
      return { goal, text: `Убей ${goal} × «${ENEMIES[t].name}»`, target: t };
    },
  },
  nohit: {
    w: 2, hard: true,
    ok: (info, n) => n >= 2,
    make() { return { goal: 1, text: 'Пройди волну без урона', binary: true }; },
  },
  combo: {
    w: 2, hard: false,
    ok: (info) => info.total >= 12,
    make(n, info) {
      const goal = Math.min(60, Math.max(10, Math.round(info.total * 0.45)));
      return { goal, text: `Набери комбо ${goal}` };
    },
  },
  expl: {
    w: 2, hard: false,
    ok: () => true,
    make(n) { const goal = 4 + Math.floor(n / 3); return { goal, text: `Убей ${goal} врагов взрывами` }; },
  },
  speed: {
    w: 2, hard: true,
    ok: (info) => info.total >= 6,
    make(n, info) {
      const t = Math.round(22 + info.total * 1.3);
      return { goal: 1, text: `Зачисти волну за ${t} сек`, time: t, binary: true };
    },
  },
  orbs: {
    w: 2, hard: false,
    ok: () => true,
    make(n) { const goal = 20 + n * 3; return { goal, text: `Собери ${goal} сгустков энергии` }; },
  },
  zone: {
    w: 3, hard: false,
    ok: () => true,
    make() {
      const pos = freePos(300, 130) || { x: G.W / 2, y: G.H / 2 };
      return { goal: 12, text: 'Удерживай зону 12 сек', zone: { x: Math.round(pos.x), y: Math.round(pos.y), r: 120 } };
    },
  },
  elite: {
    w: 3, hard: true,
    ok: (info, n) => n >= 3,
    make() { return { goal: 1, text: 'Убей элитного врага за 35 сек', time: 35, elite: true, binary: true }; },
  },
  // --- интерактивные задания на карте ---
  terminals: {
    w: 3, hard: false,
    ok: (info, n) => n >= 2,
    make() { return { goal: 3, text: 'Взломай 3 терминала (стой рядом)', spawn: 'terminals' }; },
  },
  cells: {
    w: 3, hard: true,
    ok: (info, n) => n >= 3,
    make() { return { goal: 3, text: 'Доставь 3 энергоячейки в реактор', spawn: 'cells' }; },
  },
  bomb: {
    w: 2, hard: true,
    ok: (info, n) => n >= 4,
    make() { return { goal: 1, text: 'Обезвредь бомбу до взрыва', spawn: 'bomb', time: 40, binary: true }; },
  },
  boss: {
    w: 0, hard: true,
    ok: () => false,
    make() { return { goal: 1, text: 'Убей босса за 100 сек', time: 100, binary: true }; },
  },
};

const Ch = {
  start(n, isBoss) {
    G.ch = null;
    if (n < 2) return;
    const counts = {};
    for (const t of G.queue) counts[t] = (counts[t] || 0) + 1;
    let bestType = null;
    for (const t in counts) if (counts[t] >= 4 && (!bestType || counts[t] > counts[bestType])) bestType = t;
    const info = { counts, total: G.queue.length, bestType };

    let id;
    if (isBoss) id = 'boss';
    else {
      const opts = Object.keys(CHALLENGES).filter((k) => CHALLENGES[k].w > 0 && CHALLENGES[k].ok(info, n) && k !== G.lastCh);
      id = opts.length ? weighted(opts.map((k) => ({ k, w: CHALLENGES[k].w }))).k : 'orbs';
    }
    G.lastCh = id;
    const def = CHALLENGES[id];
    const c = Object.assign({ id, p: 0, s: 'active', time: null, zone: null, eliteId: -1 }, def.make(n, info));
    c.reward = def.hard ? 'upgrade' : pick(['crate', 'crate', 'heal', 'upgrade']);
    c.bonus = 250 + n * 60;
    G.ch = c;
    World.clearMission();
    if (c.spawn) World.spawnMission(c.spawn);

    if (c.elite) {
      const pos = freePos(450, 40) || { x: rand(200, G.W - 200), y: rand(200, G.H - 200) };
      const t = n >= 7 ? pick(['tank', 'splitter', 'grunt']) : pick(['grunt', 'splitter']);
      G.spawns.push({ type: t, x: pos.x, y: pos.y, t: 1.4, max: 1.4, elite: true });
    }
  },

  active() { return G.ch && G.ch.s === 'active'; },

  progress(v) {
    const c = G.ch;
    c.p = Math.min(c.goal, v);
    if (c.p >= c.goal) this.complete();
  },

  onKill(e, kind, expl) {
    if (!this.active()) return;
    const c = G.ch;
    if (c.id === 'kills' && e.type === c.target) this.progress(c.p + 1);
    else if (c.id === 'expl' && expl) this.progress(c.p + 1);
    else if (c.id === 'elite' && e.elite) this.complete();
    else if (c.id === 'boss' && e.type === 'boss') this.complete();
  },
  onHurt() { if (this.active() && G.ch.id === 'nohit') this.fail('Получен урон'); },
  onCombo(combo) { if (this.active() && G.ch.id === 'combo' && combo > G.ch.p) this.progress(combo); },
  onOrb() { if (this.active() && G.ch.id === 'orbs') this.progress(G.ch.p + 1); },

  update(dt) {
    if (!this.active()) return;
    const c = G.ch;
    if (c.time !== null) {
      c.time -= dt;
      if (c.time <= 0) {
        c.time = 0;
        if (c.id === 'elite') {
          const e = G.enemies.find((x) => x.id === c.eliteId && !x.dead);
          if (e) {
            e.dead = true;
            fx('ring', Math.round(e.x), Math.round(e.y), '#ffd23b', 10, 140, 0.6, 5);
            fx('text', Math.round(e.x), Math.round(e.y - 40), 'Элита сбежала!', '#ffd23b', 18, 1);
          }
          this.fail('Элита сбежала');
        } else if (c.id === 'bomb') {
          World.bombBlow();
          this.fail('Бомба взорвалась');
        } else this.fail('Время вышло');
        return;
      }
    }
    if (c.zone) {
      let inside = false;
      for (const p of G.players) if (!p.dead && dist2(p.x, p.y, c.zone.x, c.zone.y) < c.zone.r * c.zone.r) { inside = true; break; }
      c.inZone = inside;
      if (inside) this.progress(c.p + dt);
    }
  },

  onWaveClear() {
    if (!this.active()) return;
    const id = G.ch.id;
    if (id === 'nohit' || id === 'speed') this.complete();
    else this.fail('Волна закончилась');
  },

  complete() {
    const c = G.ch;
    if (c.s !== 'active') return;
    c.s = 'done';
    c.p = c.goal;
    G.score += c.bonus;
    G.stats.ch++;
    CH_REWARDS[c.reward].give();
    if (c.id === 'cells') {
      // реактор даёт импульс, сметающий врагов
      const re = G.objs.find((o) => o.kind === 'reactor');
      if (re) { triggerNova(re.x, re.y, 950, 260 * (1 + G.wave * 0.05), true, '#ffb13b', G.players[0]); fx('shake', 20); fx('flash', 0.35); }
    }
    if (c.spawn) World.clearMission();
    fx('banner', 'ЗАДАНИЕ ВЫПОЛНЕНО', CH_REWARDS[c.reward].text + ' · +' + c.bonus + ' очков', 1.8, '#4dff9a');
    fx('sfx', 'weapon');
    fx('flash', 0.15);
  },

  fail(why) {
    const c = G.ch;
    if (c.s !== 'active') return;
    c.s = 'fail';
    c.why = why;
    if (c.spawn) World.clearMission();
    fx('sfx', 'hurt');
    const p = G.me || G.players[0];
    if (p) fx('text', Math.round(p.x), Math.round(p.y - 50), 'Задание провалено: ' + why, '#ff6b8e', 16, 1);
  },
};

function makeElite(e) {
  e.elite = true;
  e.maxHp = e.hp = e.maxHp * 5;
  e.speed *= 1.15;
  e.dmg *= 1.3;
  e.heavy = Math.max(e.heavy, 0.6);
  if (G.ch && G.ch.id === 'elite') G.ch.eliteId = e.id;
  fx('ring', Math.round(e.x), Math.round(e.y), '#ffd23b', 10, 120, 0.6, 5);
  fx('text', Math.round(e.x), Math.round(e.y - 40), 'ЭЛИТА!', '#ffd23b', 20, 1);
}

// =====================================================================
//  МИССИИ (достижения между забегами) и скины
// =====================================================================
const ACHIEVEMENTS = [
  { id: 'k100', icon: '🩸', name: 'Первая кровь', desc: 'Убей 100 врагов', goal: 100, get: (m) => m.t.kills },
  { id: 'k1000', icon: '💀', name: 'Жнец', desc: 'Убей 1 000 врагов', goal: 1000, get: (m) => m.t.kills },
  { id: 'k5000', icon: '☠️', name: 'Неоновая буря', desc: 'Убей 5 000 врагов', goal: 5000, get: (m) => m.t.kills },
  { id: 'w5', icon: '🌊', name: 'Выживший', desc: 'Дойди до 5-й волны', goal: 5, get: (m) => m.b.wave },
  { id: 'w10', icon: '🌊', name: 'Ветеран арены', desc: 'Дойди до 10-й волны', goal: 10, get: (m) => m.b.wave },
  { id: 'w15', icon: '🌊', name: 'Несгибаемый', desc: 'Дойди до 15-й волны', goal: 15, get: (m) => m.b.wave },
  { id: 'w20', icon: '👑', name: 'Легенда арены', desc: 'Дойди до 20-й волны', goal: 20, get: (m) => m.b.wave },
  { id: 'b1', icon: '👁️', name: 'Охотник на боссов', desc: 'Победи Овермайнда', goal: 1, get: (m) => m.t.bosses },
  { id: 'b5', icon: '👁️', name: 'Гроза разума', desc: 'Победи 5 боссов', goal: 5, get: (m) => m.t.bosses },
  { id: 'b15', icon: '🏆', name: 'Убийца богов', desc: 'Победи 15 боссов', goal: 15, get: (m) => m.t.bosses },
  { id: 'c25', icon: '🔥', name: 'Мастер комбо', desc: 'Набери комбо 25 за забег', goal: 25, get: (m) => m.b.combo },
  { id: 'c60', icon: '🔥', name: 'Неудержимый', desc: 'Набери комбо 60 за забег', goal: 60, get: (m) => m.b.combo },
  { id: 'ch5', icon: '📋', name: 'Исполнитель', desc: 'Выполни 5 заданий волн', goal: 5, get: (m) => m.t.ch },
  { id: 'ch30', icon: '📋', name: 'Профессионал', desc: 'Выполни 30 заданий волн', goal: 30, get: (m) => m.t.ch },
  { id: 'ex100', icon: '💥', name: 'Подрывник', desc: 'Убей 100 врагов взрывами', goal: 100, get: (m) => m.t.expl },
  { id: 'nova20', icon: '✨', name: 'Сверхновая', desc: 'Используй нову 20 раз', goal: 20, get: (m) => m.t.novas },
  { id: 'sg', icon: '🔫', name: 'Дробь в упор', desc: '300 убийств из дробовика', goal: 300, get: (m) => m.t.wk.shotgun || 0 },
  { id: 'mg', icon: '🔫', name: 'Свинцовый дождь', desc: '500 убийств из минигана', goal: 500, get: (m) => m.t.wk.minigun || 0 },
  { id: 'pl', icon: '🔫', name: 'Плазменный шторм', desc: '300 убийств из плазмагана', goal: 300, get: (m) => m.t.wk.plasma || 0 },
  { id: 'rl', icon: '🚀', name: 'Ракетчик', desc: '200 убийств из ракетницы', goal: 200, get: (m) => m.t.wk.rocket || 0 },
  { id: 'rg', icon: '🎯', name: 'Снайпер', desc: '200 убийств из рельсотрона', goal: 200, get: (m) => m.t.wk.rail || 0 },
  { id: 's10k', icon: '⭐', name: 'Десять тысяч', desc: 'Набери 10 000 очков за забег', goal: 10000, get: (m) => m.b.score },
  { id: 's50k', icon: '🌟', name: 'Звезда арены', desc: 'Набери 50 000 очков за забег', goal: 50000, get: (m) => m.b.score },
  { id: 'coop', icon: '🤝', name: 'Плечом к плечу', desc: 'Сыграй в кооп на одном ПК', goal: 1, get: (m) => m.t.local },
  { id: 'online', icon: '🌐', name: 'По сети', desc: 'Сыграй с друзьями по сети', goal: 1, get: (m) => m.t.online },
  { id: 'runs10', icon: '🔁', name: 'Упорство', desc: 'Сыграй 10 забегов', goal: 10, get: (m) => m.t.runs },
  { id: 'lz', icon: '🔦', name: 'Лучемёт', desc: '300 убийств лазером', goal: 300, get: (m) => m.t.wk.laser || 0 },
  { id: 'fl', icon: '🔥', name: 'Пироман', desc: '300 убийств огнём (огнемёт + поджог)', goal: 300, get: (m) => (m.t.wk.flamer || 0) + (m.t.wk.burn || 0) },
  { id: 'ts', icon: '⚡', name: 'Повелитель молний', desc: '300 убийств теслой', goal: 300, get: (m) => m.t.wk.tesla || 0 },
  { id: 'sw', icon: '💿', name: 'Бумеранг', desc: '200 убийств дископилом', goal: 200, get: (m) => m.t.wk.saw || 0 },
  { id: 'tur', icon: '🛰️', name: 'Инженер', desc: 'Захвати 10 турелей', goal: 10, get: (m) => m.t.turrets },
  { id: 'sec', icon: '🗺️', name: 'Путешественник', desc: 'Пройди 5 секторов', goal: 5, get: (m) => m.t.sectors },
];

const RAINBOW = ['#ff4d6d', '#ff7a1a', '#ffb13b', '#ffe23b', '#a6ff4d', '#4dff9a', '#33ffff', '#4db8ff', '#7d7dff', '#b46bff', '#ff4dd2', '#ff2d95'];
const SKINS = [
  { id: 'cyan', name: 'Неон', color: '#33ffff', stars: 0 },
  { id: 'lime', name: 'Токсик', color: '#a6ff4d', stars: 3 },
  { id: 'gold', name: 'Золото', color: '#ffd23b', stars: 6 },
  { id: 'ruby', name: 'Рубин', color: '#ff4d6d', stars: 9 },
  { id: 'violet', name: 'Аметист', color: '#b46bff', stars: 12 },
  { id: 'ice', name: 'Лёд', color: '#dff4ff', stars: 16 },
  { id: 'rainbow', name: 'Радуга', color: 'rainbow', stars: 20 },
];
const RANKS = [
  { stars: 0, name: 'Новобранец' }, { stars: 4, name: 'Боец' }, { stars: 8, name: 'Ветеран' },
  { stars: 13, name: 'Элита' }, { stars: 18, name: 'Мастер' }, { stars: 24, name: 'Легенда' },
];

function skinColor(id, pid) {
  const s = SKINS.find((k) => k.id === id);
  if (!s || s.id === 'cyan') return PCOLORS[(pid || 0) % 4];
  return s.color === 'rainbow' ? RAINBOW[0] : s.color;
}

// одинаковые скины у нескольких игроков → у повторов стандартный цвет слота
function dedupeColors(players) {
  const used = new Set();
  for (const p of players) {
    if (used.has(p.skin) && p.skin !== 'cyan') { p.skin = 'cyan'; p.color = PCOLORS[p.id % 4]; }
    used.add(p.skin);
  }
}

const Meta = {
  data: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('ns_meta')); } catch (e) {}
    d = d || {};
    d.t = Object.assign({ kills: 0, bosses: 0, ch: 0, expl: 0, novas: 0, runs: 0, local: 0, online: 0, turrets: 0, sectors: 0, wk: {} }, d.t || {});
    d.t.wk = d.t.wk || {};
    d.b = Object.assign({ wave: 0, combo: 0, score: 0 }, d.b || {});
    d.done = Array.isArray(d.done) ? d.done : [];
    d.skin = d.skin || 'cyan';
    this.data = d;
  },
  save() { try { localStorage.setItem('ns_meta', JSON.stringify(this.data)); } catch (e) {} },
  stars() { return this.data.done.length; },
  rank() { let r = RANKS[0]; for (const k of RANKS) if (this.stars() >= k.stars) r = k; return r; },
  nextRank() { return RANKS.find((k) => k.stars > this.stars()) || null; },
  skinUnlocked(s) { return this.stars() >= s.stars; },
  setSkin(id) {
    const s = SKINS.find((k) => k.id === id);
    if (s && this.skinUnlocked(s)) { this.data.skin = id; this.save(); }
  },
  // run: итоги забега; возвращает { fresh: [новые миссии], skins: [открытые скины] }
  record(run) {
    const d = this.data, t = d.t, b = d.b;
    const starsBefore = this.stars();
    t.kills += run.kills || 0;
    t.bosses += run.bosses || 0;
    t.ch += run.ch || 0;
    t.expl += run.expl || 0;
    t.novas += run.novas || 0;
    t.turrets += run.turrets || 0;
    t.sectors += run.sectors || 0;
    t.runs++;
    if (run.mode === 'local') t.local++;
    if (run.mode === 'host' || run.mode === 'client') t.online++;
    for (const k in run.wk || {}) t.wk[k] = (t.wk[k] || 0) + run.wk[k];
    b.wave = Math.max(b.wave, run.wave || 0);
    b.combo = Math.max(b.combo, run.combo || 0);
    b.score = Math.max(b.score, run.score || 0);
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (!d.done.includes(a.id) && a.get(d) >= a.goal) { d.done.push(a.id); fresh.push(a); }
    }
    const skins = SKINS.filter((s) => s.stars > starsBefore && s.stars <= this.stars());
    this.save();
    return { fresh, skins };
  },
};
Meta.load();

function buildRun() {
  const s = G.stats || {};
  return {
    kills: G.kills, bosses: s.bosses || 0, ch: s.ch || 0, expl: s.expl || 0, novas: s.novas || 0,
    turrets: s.turrets || 0, sectors: s.sectors || 0,
    wk: s.wk || {}, wave: G.wave, combo: G.maxCombo, score: G.score, mode: G.mode,
  };
}

// засчитать забег (один раз): при поражении или выходе в меню
function recordRun(run) {
  if (G.recorded) return { fresh: [], skins: [] };
  G.recorded = true;
  if (!run || (run.wave || 0) < 1) return { fresh: [], skins: [] };
  return Meta.record(run);
}
