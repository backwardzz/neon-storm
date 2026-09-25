'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1, ZOOM = 1;

const input = { keys: Object.create(null), pressed: new Set(), mx: innerWidth / 2, my: innerHeight / 2, wx: 0, wy: 0, down: false, wheel: 0, pads: [], padPrev: {} };

// индексы для компактной передачи по сети
const ETYPES = Object.keys(ENEMIES);
const BKINDS = WEAPON_ORDER.concat(['drone']);
const ECOLS = ['#ff4dd2', '#d66bff', '#ff2d95', '#ff7ad9', '#ffb13b'];
const WSTATES = ['none', 'countdown', 'active', 'cleared', 'upgrade'];
const BSTATES = ['chase', 'spiral', 'burst', 'volley', 'charge', 'summon'];
const PTYPES = ['orb', 'health', 'weapon'];
const PCOLORS = ['#33ffff', '#ff9dff', '#f4f4ff', '#5dffc8'];
const MENU_STATES = ['menu', 'localSetup', 'online', 'lobby', 'missions'];

const G = {
  state: 'menu', mode: 'solo', W: 2600, H: 1800,
  time: 0, slowmo: 0, hitstop: 0,
  players: [], me: null, p2ctl: 'kb2', pc: 1,
  enemies: [], bullets: [], ebullets: [], pickups: [], barrels: [], walls: [],
  beams: [], bolts: [], novas: [], novaFx: [], spawns: [],
  wave: 0, waveState: 'none', queue: [], spawnTimer: 0, waveTimer: 0, remaining: 0,
  upPending: new Set(), upWaiting: 0, upTimer: 0, upQueue: [], picking: -1, upgradeChoices: [],
  score: 0, kills: 0, combo: 0, comboTimer: 0, maxCombo: 0,
  cam: { x: 1300, y: 900 }, camX: 0, camY: 0, zoom: 1, view: { l: 0, t: 0, r: 0, b: 0 },
  shake: 0, hurt: 0, whiteFlash: 0, banner: null, boss: null, dying: 0,
  stats: null, decalTimer: 0, nextId: 1, best: { score: 0, wave: 0 }, menuTimer: 0,
};

// ================= ХЕЛПЕРЫ РЕЖИМОВ =================
const isOnline = () => G.mode === 'host' || G.mode === 'client';
const isAuth = () => G.mode !== 'client';
const isLocalPlayer = (p) => !!p && (p.ctl === 'kbm' || p.ctl === 'kb2' || p.ctl === 'pad');
const isDashing = (p) => p.dashTime > 0 || p.dashing;
function playerById(id) { for (const p of G.players) if (p.id === id) return p; return null; }
function anyAlive() { for (const p of G.players) if (!p.dead) return true; return false; }
function nearestPlayer(x, y) {
  let best = null, bd = Infinity;
  for (const p of G.players) {
    if (p.dead) continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function nearestEnemy(x, y, range) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ================= ЭФФЕКТЫ (реплицируются по сети) =================
// Всё, что видно/слышно, проходит через fx(): хост выполняет и пересылает клиентам.
function fx(name, ...a) {
  EFX[name](...a);
  if (G.mode === 'host') Net.events.push([name, ...a]);
}

const EFX = {
  kill(x, y, ti) {
    const d = ENEMIES[ETYPES[ti]], r = d.r;
    FX.spark(x, y, d.color, 12 + r, 430);
    FX.dots(x, y, d.color, 6, 200, r * 0.8, 0.6);
    FX.ring(x, y, d.color, r * 0.5, r * 3, 0.35, 3);
    FX.shards(x, y, d.color, 4 + Math.floor(r / 5), 300);
    Decals.splat(x, y, d.color, r * 1.4);
    addShake(r > 20 ? 6 : 2);
    SFX.play('kill');
  },
  boom(x, y, r, color) {
    color = color || '#ffb13b';
    FX.add({ type: 'dot', x, y, vx: 0, vy: 0, life: 0.2, size: r * 1.5, color: '#fff2d0', drag: 0 });
    FX.ring(x, y, color, r * 0.2, r * 1.15, 0.45, 7);
    FX.spark(x, y, color, 26, r * 6, { size: 3 });
    FX.spark(x, y, '#ffffff', 10, r * 4);
    FX.dots(x, y, '#ff5a3b', 10, r * 2.5, r * 0.35, 0.55);
    FX.smoke(x, y, 8, r * 0.5);
    Decals.scorch(x, y, r * 0.9);
    addShake(r / 9);
    SFX.play('explosion');
  },
  num(x, y, v, crit) {
    FX.text(x + rand(-10, 10), y, v, crit ? '#ffe23b' : '#ffffff', crit ? 21 : 14, !!crit);
    SFX.play('hit');
  },
  shot(pid, x, y, a, wi) {
    const w = WEAPONS[WEAPON_ORDER[wi]];
    FX.muzzle(x, y, a, w.color);
    SFX.play(w.sound);
    const p = playerById(pid);
    if (p) { p.recoil = 1; if (isLocalPlayer(p)) addShake(w.shake * 0.6); }
  },
  dshot(x, y, a) { FX.muzzle(x, y, a, '#7dd8ff'); },
  rail(x1, y1, x2, y2, color) {
    G.beams.push({ x1, y1, x2, y2, life: 0.32, max: 0.32, color, w: 12 });
    FX.spark(x2, y2, color, 16, 520);
    FX.ring(x2, y2, color, 4, 44, 0.3, 3);
    const L = dist(x1, y1, x2, y2), segs = Math.floor(L / 55), a = Math.atan2(y2 - y1, x2 - x1);
    const nx = -Math.sin(a), ny = Math.cos(a);
    for (let i = 0; i < segs; i++) {
      const t = i / segs, s = rand(-60, 60);
      FX.add({ type: 'dot', x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, vx: nx * s, vy: ny * s, life: rand(0.25, 0.5), size: 8, color, drag: 3 });
    }
  },
  spark(x, y, color, n, spd) { FX.spark(x, y, color, n, spd); },
  ring(x, y, color, r0, r1, life, w) { FX.ring(x, y, color, r0, r1, life, w); },
  shards(x, y, color, n, spd) { FX.shards(x, y, color, n, spd); },
  text(x, y, s, color, size, pop) { FX.text(x, y, s, color, size, !!pop); },
  sfx(n) { SFX.play(n); },
  bolt(flat) {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
    G.bolts.push({ pts, life: 0.22, max: 0.22 });
    SFX.play('chain');
  },
  nova(x, y, max, color) {
    G.novaFx.push({ x, y, r: 0, max, color, speed: Math.max(900, max * 2.2) });
    FX.add({ type: 'dot', x, y, vx: 0, vy: 0, life: 0.25, size: max * 0.4, color, drag: 0 });
  },
  ult(pid, x, y) {
    SFX.play('nova');
    FX.dots(x, y, '#33ffff', 30, 600, 18, 0.8);
    const p = playerById(pid);
    if (p && isLocalPlayer(p)) { addShake(26); G.whiteFlash = 0.5; } else addShake(8);
  },
  dash(x, y, color) { SFX.play('dash'); FX.ring(x, y, color, 8, 50, 0.3, 3); },
  banner(t, s, d, c) { showBanner(t, s, d, c); },
  hurt(pid, x, y, dmg) {
    FX.spark(x, y, '#ff3b6b', 14, 360);
    FX.text(x, y - 28, '-' + dmg, '#ff3b6b', 19, true);
    const p = playerById(pid);
    if (!p) return;
    p.flash = 0.15;
    if (isLocalPlayer(p)) { G.hurt = 0.5; addShake(12); SFX.play('hurt'); }
  },
  knock(pid, vx, vy) {
    const p = playerById(pid);
    if (p && isLocalPlayer(p)) { p.vx += vx; p.vy += vy; }
  },
  pdie(pid, x, y) {
    const p = playerById(pid), col = p ? p.color : '#33ffff';
    EFX.boom(x, y, 170, col);
    FX.spark(x, y, '#ffffff', 40, 700);
    FX.shards(x, y, col, 20, 400);
    if (p && isLocalPlayer(p)) SFX.play('gameOver');
  },
  revive(pid, x, y) {
    const p = playerById(pid), col = p ? p.color : '#33ffff';
    FX.ring(x, y, col, 10, 120, 0.6, 5);
    FX.dots(x, y, col, 16, 300, 12, 0.6);
    FX.text(x, y - 34, 'В СТРОЮ!', col, 18, true);
    SFX.play('heal');
  },
  flash(v) { G.whiteFlash = Math.max(G.whiteFlash, v); },
  shake(v) { addShake(v); },
  music(l) { SFX.music(l); },
  ready(pid) {
    const p = playerById(pid);
    if (p && isLocalPlayer(p)) { FX.text(p.x, p.y - 40, 'НОВА ГОТОВА!', '#4dff9a', 20, true); SFX.play('ready'); }
  },
  spawned(x, y, ti) { const d = ENEMIES[ETYPES[ti]]; FX.ring(x, y, d.color, 5, d.r * 2.6, 0.3, 3); },
  ptext(pid, s, color, sound) {
    const p = playerById(pid);
    if (!p) return;
    FX.text(p.x, p.y - 34, s, color, 18, true);
    if (sound) SFX.play(sound);
  },
};

// ================= ИГРОК =================
function makePlayer(id, name, ctl, skin) {
  const ox = [0, 70, -70, 0][id % 4], oy = [0, 0, 0, 70][id % 4];
  const x = G.W / 2 + ox, y = G.H / 2 + oy;
  return {
    id, name, ctl, skin: skin || 'cyan', color: skinColor(skin, id),
    x, y, rx: x, ry: y, vx: 0, vy: 0, r: 15, angle: 0,
    hp: 100, maxHp: 100, speed: 270, dead: false, revive: 0, tp: 0,
    dashCd: 0, dashMax: 1.1, dashTime: 0, dashDx: 0, dashDy: 0, dashing: false, wasDashing: false, invuln: 0,
    owned: ['blaster'], ammo: { blaster: Infinity }, cur: 'blaster', fireCd: 0, recoil: 0,
    energy: 0,
    dmgMult: 1, rateMult: 1, extraProj: 0, pierce: 0, bounce: 0, lifesteal: 0, crit: 0.05,
    magnet: 130, ultMult: 1, regen: 0, ammoMult: 1, cryo: 0, chain: 0, dashNova: 0, drones: 0,
    droneAngle: 0, droneCd: [], ups: {}, choices: null, flash: 0,
    intent: { mx: 0, my: 0, aim: 0, fire: false, dash: false, ult: false, weapon: null, cycle: 0 },
  };
}

// ---------- ввод: клавиатура+мышь / клавиатура-2 / геймпад ----------
function getPad() {
  for (const gp of input.pads) if (gp && gp.connected) return gp;
  return null;
}
function padPressed(gp, i) {
  if (!gp || !gp.buttons[i]) return false;
  const prev = input.padPrev[gp.index] || [];
  return gp.buttons[i].pressed && !prev[i];
}
function pollPads() {
  try { input.pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { input.pads = []; }
}
function savePadPrev() {
  for (const gp of input.pads) if (gp) input.padPrev[gp.index] = gp.buttons.map((b) => b.pressed);
}

function setMove(I, x, y) {
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  I.mx = x; I.my = y;
}

function readIntent(p) {
  const I = p.intent;
  I.dash = false; I.ult = false; I.weapon = null; I.cycle = 0;
  if (G.state !== 'playing' || p.dead) { I.mx = I.my = 0; I.fire = false; return; }
  const k = input.keys, pr = input.pressed;
  if (p.ctl === 'kbm') {
    const arrows = !(G.mode === 'local' && G.p2ctl === 'kb2');
    setMove(I,
      (k.KeyD || (arrows && k.ArrowRight) ? 1 : 0) - (k.KeyA || (arrows && k.ArrowLeft) ? 1 : 0),
      (k.KeyS || (arrows && k.ArrowDown) ? 1 : 0) - (k.KeyW || (arrows && k.ArrowUp) ? 1 : 0));
    I.aim = Math.atan2(input.wy - p.y, input.wx - p.x);
    I.fire = input.down;
    I.dash = pr.has('Space') || pr.has('ShiftLeft') || pr.has('Mouse2') || (arrows && pr.has('ShiftRight'));
    I.ult = pr.has('KeyF');
    for (let i = 0; i < WEAPON_ORDER.length; i++) if (pr.has('Digit' + (i + 1))) I.weapon = WEAPON_ORDER[i];
    if (input.wheel) I.cycle = input.wheel > 0 ? 1 : -1;
    else if (pr.has('KeyQ')) I.cycle = -1;
    else if (pr.has('KeyE')) I.cycle = 1;
  } else if (p.ctl === 'kb2') {
    setMove(I, (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0));
    const t = nearestEnemy(p.x, p.y, 750);
    if (t) I.aim = Math.atan2(t.y - p.y, t.x - p.x);
    else if (I.mx || I.my) I.aim = Math.atan2(I.my, I.mx);
    I.fire = !!(k.Slash || k.ControlRight || k.Numpad0);
    I.dash = pr.has('ShiftRight') || pr.has('NumpadDecimal');
    I.ult = pr.has('Enter') || pr.has('NumpadEnter');
    if (pr.has('Comma')) I.cycle = -1; else if (pr.has('Period')) I.cycle = 1;
  } else if (p.ctl === 'pad') {
    const gp = getPad();
    if (!gp) { I.mx = I.my = 0; I.fire = false; return; }
    const ax = gp.axes;
    let lx = ax[0] || 0, ly = ax[1] || 0;
    if (Math.hypot(lx, ly) < 0.2) lx = ly = 0;
    setMove(I, lx, ly);
    const rx = ax[2] || 0, ry = ax[3] || 0, rm = Math.hypot(rx, ry);
    if (rm > 0.35) I.aim = Math.atan2(ry, rx);
    else {
      const t = nearestEnemy(p.x, p.y, 600);
      if (t) I.aim = Math.atan2(t.y - p.y, t.x - p.x);
      else if (lx || ly) I.aim = Math.atan2(ly, lx);
    }
    I.fire = (gp.buttons[7] && gp.buttons[7].value > 0.3) || rm > 0.6;
    I.dash = padPressed(gp, 6) || padPressed(gp, 0) || padPressed(gp, 4);
    I.ult = padPressed(gp, 3);
    if (padPressed(gp, 5)) I.cycle = 1; else if (padPressed(gp, 2)) I.cycle = -1;
  }
}

// ================= МИР =================
function genWalls() {
  const walls = [];
  let tries = 0;
  while (walls.length < 13 && tries < 600) {
    tries++;
    let w, h;
    const r = Math.random();
    if (r < 0.35) { w = rand(170, 330); h = rand(46, 70); }
    else if (r < 0.7) { w = rand(46, 70); h = rand(170, 330); }
    else { w = h = rand(80, 140); }
    const x = Math.round(rand(160, G.W - 160 - w)), y = Math.round(rand(160, G.H - 160 - h));
    w = Math.round(w); h = Math.round(h);
    if (dist(x + w / 2, y + h / 2, G.W / 2, G.H / 2) < 360) continue;
    let ok = true;
    for (const o of walls) {
      if (x < o.x + o.w + 150 && x + w + 150 > o.x && y < o.y + o.h + 150 && y + h + 150 > o.y) { ok = false; break; }
    }
    if (ok) walls.push({ x, y, w, h });
  }
  return walls;
}

function isFree(x, y, r) {
  if (x < r || y < r || x > G.W - r || y > G.H - r) return false;
  for (const w of G.walls) if (pointInRect(x, y, w, r)) return false;
  for (const b of G.barrels) if (dist2(x, y, b.x, b.y) < (r + b.r) ** 2) return false;
  return true;
}

function freePos(minDist, r) {
  for (let i = 0; i < 60; i++) {
    const x = rand(80, G.W - 80), y = rand(80, G.H - 80);
    let near = false;
    for (const p of G.players) if (dist(x, y, p.x, p.y) < minDist) { near = true; break; }
    if (near || !isFree(x, y, r)) continue;
    return { x, y };
  }
  return null;
}

function placeBarrels(n) {
  for (let i = 0; i < n; i++) {
    const pos = freePos(260, 34);
    if (pos) G.barrels.push({ x: pos.x, y: pos.y, r: 17, hp: 25, fuse: -1, flash: 0, pulse: rand(0, TAU) });
  }
}

// ================= ПОТОК ИГРЫ =================
function loadBest() {
  try { return JSON.parse(localStorage.getItem('ns_best')) || { score: 0, wave: 0 }; } catch (e) { return { score: 0, wave: 0 }; }
}
function saveBest() { try { localStorage.setItem('ns_best', JSON.stringify(G.best)); } catch (e) {} }

function setState(s) {
  G.state = s;
  UI.show(s === 'playing' ? null : s);
}

function resetWorld() {
  Object.assign(G, {
    time: 0, slowmo: 0, hitstop: 0,
    enemies: [], bullets: [], ebullets: [], pickups: [], barrels: [], beams: [], bolts: [], novas: [], novaFx: [], spawns: [],
    wave: 0, waveState: 'countdown', waveTimer: 2.5, queue: [], spawnTimer: 0, remaining: 0,
    upPending: new Set(), upWaiting: 0, upQueue: [], picking: -1,
    score: 0, kills: 0, combo: 0, comboTimer: 0, maxCombo: 0,
    shake: 0, hurt: 0, whiteFlash: 0, banner: null, boss: null, dying: 0,
  });
  G.stats = { shots: 0, hits: 0, dmg: 0, time: 0, bosses: 0, ch: 0, expl: 0, novas: 0, wk: {} };
  G.ch = null; G.lastCh = null; G.recorded = false;
  FX.clear();
  Decals.clear();
  input.pressed.clear(); input.down = false;
}

// defs: [{id, name, ctl}]
function newGame(defs) {
  resetWorld();
  G.players = [];
  G.walls = genWalls();
  G.players = defs.map((d) => makePlayer(d.id, d.name, d.ctl, d.skin));
  dedupeColors(G.players);
  G.me = G.players.find((p) => p.ctl === 'kbm') || G.players[0];
  G.pc = G.players.length;
  placeBarrels(8 + G.pc * 2);
  G.cam.x = G.me.x; G.cam.y = G.me.y; G.zoom = ZOOM;
  setState('playing');
  SFX.music(1);
  const hint = G.mode === 'local'
    ? 'Держитесь вместе — упавшего союзника можно поднять'
    : isOnline() ? 'Команда в сборе. Упавших союзников можно поднять!' : 'WASD — бег · ЛКМ — огонь · Пробел — рывок';
  fx('banner', 'ГОТОВЬСЯ', hint, 2.2, '#33ffff');
}

function startSolo() { SFX.init(); SFX.play('click'); Net.leave(); G.mode = 'solo'; newGame([{ id: 0, name: 'Игрок', ctl: 'kbm', skin: Meta.data.skin }]); }
function startLocal(p2ctl) {
  SFX.init(); SFX.play('click'); Net.leave();
  G.mode = 'local'; G.p2ctl = p2ctl;
  newGame([{ id: 0, name: 'Игрок 1', ctl: 'kbm', skin: Meta.data.skin }, { id: 1, name: 'Игрок 2', ctl: p2ctl }]);
}
function restartGame() {
  if (G.mode === 'host') Net.startGame();
  else if (G.mode === 'local') startLocal(G.p2ctl);
  else if (G.mode === 'solo') startSolo();
}
function quitToMenu() {
  if (G.mode !== 'client' && G.stats && G.me && !MENU_STATES.includes(G.state)) recordRun(buildRun());
  Net.leave();
  G.mode = 'solo';
  SFX.music(0.5);
  initMenuScene();
  setState('menu');
}

function showBanner(title, sub, dur, color) {
  G.banner = { title, sub, t: dur, max: dur, color: color || '#b46bff' };
}

function comboMult() { return 1 + Math.min(G.combo, 60) * 0.05; }

function startWave() {
  G.wave++;
  const n = G.wave, boss = n % 5 === 0;
  for (const p of G.players) if (p.dead) revivePlayer(p, 0.5, true);
  G.queue = [];
  let budget = (6 + n * 3 + Math.floor(n * n * 0.12)) * (1 + 0.5 * (G.pc - 1));
  if (boss) budget = Math.floor(budget * 0.4);
  const table = SPAWN_TABLE.filter((t) => t.from <= n);
  while (budget > 0) {
    const opts = table.filter((t) => t.cost <= budget);
    if (!opts.length) break;
    const t = weighted(opts);
    G.queue.push(t.type);
    budget -= t.cost;
  }
  shuffle(G.queue);
  G.waveState = 'active';
  G.spawnTimer = boss ? 4 : 0.4;

  if (boss) {
    const pos = freePos(600, 90) || { x: G.me.x < G.W / 2 ? G.W - 300 : 300, y: G.H / 2 };
    spawnEnemyAt('boss', pos.x, pos.y, 2.4);
    fx('banner', 'ВНИМАНИЕ', 'Приближается босс — ОВЕРМАЙНД', 3, '#ff2d95');
    fx('sfx', 'bossWarn');
    fx('music', 2);
  } else {
    const fresh = SPAWN_TABLE.filter((t) => t.from === n).map((t) => ENEMIES[t.type].name);
    fx('banner', 'ВОЛНА ' + n, fresh.length ? 'Новый враг: ' + fresh.join(', ') : '', 2.2, '#b46bff');
    fx('sfx', 'waveStart');
  }
  if (n >= 2) {
    const crates = G.pc > 2 ? 2 : 1;
    for (let i = 0; i < crates; i++) {
      const pos = freePos(300, 30);
      if (pos) G.pickups.push(makePickup('weapon', pos.x, pos.y));
    }
  }
  if (G.barrels.length < 14) placeBarrels(2);
  Ch.start(n, boss);
}

function updateWaves(dt) {
  if (G.waveState === 'countdown') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) startWave();
    return;
  }
  if (G.waveState === 'active') {
    G.spawnTimer -= dt;
    const alive = G.enemies.length + G.spawns.length;
    if (G.spawnTimer <= 0 && G.queue.length && alive < 40 + G.wave * 2 + G.pc * 8) {
      const n = G.wave;
      const group = Math.min(G.queue.length, randi(1, Math.min(5, 1 + Math.floor(n / 3))));
      const pos = freePos(520, 40) || { x: rand(100, G.W - 100), y: rand(100, G.H - 100) };
      for (let i = 0; i < group; i++) {
        const t = G.queue.pop();
        const a = rand(0, TAU), d = rand(0, 70);
        spawnEnemyAt(t, clamp(pos.x + Math.cos(a) * d, 40, G.W - 40), clamp(pos.y + Math.sin(a) * d, 40, G.H - 40), 0.9 + i * 0.08);
      }
      G.spawnTimer = Math.max(0.3, 1.25 - n * 0.05) * (0.6 + group * 0.3) / (1 + 0.3 * (G.pc - 1));
    }
    if (!G.queue.length && !G.enemies.length && !G.spawns.length) {
      Ch.onWaveClear();
      G.waveState = 'cleared';
      G.waveTimer = 1.8;
      G.ebullets.length = 0;
      for (const p of G.players) if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + 15);
      for (const pk of G.pickups) if (pk.type === 'orb') pk.attract = true;
      fx('banner', 'ВОЛНА ПРОЙДЕНА', '+15 HP', 1.8, '#4dff9a');
      fx('sfx', 'upgrade');
    }
    return;
  }
  if (G.waveState === 'cleared') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) openUpgrades();
    return;
  }
  if (G.waveState === 'upgrade' && isOnline()) {
    G.upTimer -= dt;
    if (G.upTimer <= 0) {
      for (const id of [...G.upPending]) {
        const p = playerById(id);
        if (p && p.choices && p.choices.length) applyUpgrade(p, p.choices[0].id);
        else G.upPending.delete(id);
      }
      if (G.state === 'upgrade') setState('playing');
      if (G.waveState === 'upgrade') finishUpgrades();
    }
  }
}

// ---------- улучшения (у каждого игрока свои) ----------
function rollUpgrades(p) {
  const pool = UPGRADES.filter((u) => (p.ups[u.id] || 0) < u.max).map((u) => ({ u, w: RARITY[u.rarity].w }));
  const out = [];
  while (out.length < 3 && pool.length) {
    const it = weighted(pool);
    out.push(it.u);
    pool.splice(pool.indexOf(it), 1);
  }
  return out;
}

function openUpgrades() {
  G.waveState = 'upgrade';
  G.upPending = new Set();
  G.upTimer = 30;
  for (const p of G.players) {
    p.choices = rollUpgrades(p);
    if (p.choices.length) G.upPending.add(p.id);
  }
  if (!G.upPending.size) { finishUpgrades(); return; }
  if (G.mode === 'host') {
    for (const p of G.players) if (p.ctl === 'net' && G.upPending.has(p.id)) Net.sendTo(p.id, { t: 'ups', c: p.choices.map((u) => u.id) });
    if (G.upPending.has(G.me.id)) showUpgradeFor(G.me);
  } else {
    G.upQueue = G.players.filter((p) => G.upPending.has(p.id)).map((p) => p.id);
    showUpgradeFor(playerById(G.upQueue[0]));
  }
}

function showUpgradeFor(p) {
  G.picking = p.id;
  G.upgradeChoices = p.choices;
  UI.showUpgrades(p.choices, p, G.mode === 'local' ? `ИГРОК ${p.id + 1}` : '');
  setState('upgrade');
}

// выбор из локального интерфейса
function pickUpgrade(u) {
  if (!u || G.state !== 'upgrade') return;
  input.pressed.clear(); input.down = false;
  if (G.mode === 'client') {
    Net.send({ t: 'pick', u: u.id });
    SFX.play('upgrade');
    setState('playing');
    return;
  }
  applyUpgrade(playerById(G.picking), u.id);
  if (G.mode === 'solo' || G.mode === 'local') {
    G.upQueue.shift();
    if (G.upQueue.length) { showUpgradeFor(playerById(G.upQueue[0])); return; }
  }
  if (G.state === 'upgrade') setState('playing');
}

function applyUpgrade(p, uid) {
  if (!p || !G.upPending.has(p.id) || !p.choices) return;
  const u = p.choices.find((x) => x.id === uid);
  if (!u) return;
  p.ups[u.id] = (p.ups[u.id] || 0) + 1;
  u.apply(p);
  G.upPending.delete(p.id);
  if (isLocalPlayer(p)) SFX.play('upgrade');
  fx('text', Math.round(p.x), Math.round(p.y - 36), u.name, RARITY[u.rarity].color, 20, 1);
  fx('ring', Math.round(p.x), Math.round(p.y), RARITY[u.rarity].color, 10, 120, 0.6, 5);
  if (!G.upPending.size) finishUpgrades();
}

function finishUpgrades() {
  G.waveState = 'countdown';
  G.waveTimer = 2.5;
}

function gameOver() {
  const s = G.stats;
  const rec = G.score > G.best.score;
  if (rec) G.best.score = G.score;
  if (G.wave > G.best.wave) G.best.wave = G.wave;
  saveBest();
  const stats = {
    score: G.score, wave: G.wave, kills: G.kills, combo: G.maxCombo, time: s.time,
    acc: s.shots ? Math.min(100, Math.round((s.hits / s.shots) * 100)) : 0, dmg: Math.round(s.dmg), record: rec,
  };
  const run = buildRun();
  const res = recordRun(run);
  if (G.mode === 'host') Net.broadcast({ t: 'over', s: Object.assign({}, stats, { record: false }), run });
  UI.showGameOver(stats, res);
  setState('gameover');
}

function pauseGame() { if (G.state === 'playing' && G.me && !(G.dying > 0)) { setState('paused'); input.down = false; } }
function resumeGame() { if (G.state === 'paused') { input.pressed.clear(); setState('playing'); } }

// ================= ВРАГИ =================
function spawnEnemyAt(type, x, y, delay) {
  G.spawns.push({ type, x, y, t: delay, max: delay });
}

function makeEnemy(type, x, y) {
  const d = ENEMIES[type], n = Math.max(1, G.wave);
  const hpS = (1 + 0.15 * (n - 1) + 0.01 * (n - 1) * (n - 1)) * (1 + 0.55 * (G.pc - 1));
  let hp = d.hp * hpS;
  if (type === 'boss') { const k = Math.max(1, Math.floor(n / 5)); hp = d.hp * (1 + 0.75 * (k - 1)) * (1 + 0.7 * (G.pc - 1)); }
  return {
    id: G.nextId++, type, x, y, vx: 0, vy: 0, kvx: 0, kvy: 0, r: d.r,
    hp, maxHp: hp,
    speed: d.speed * (1 + Math.min(0.35, 0.025 * (n - 1))) * rand(0.9, 1.1),
    dmg: d.dmg * (1 + 0.04 * (n - 1)),
    angle: rand(0, TAU), flash: 0, slow: 0, spawnT: 0.3, seed: rand(0, 100),
    fireCd: rand(1, 2.5), dir: Math.random() < 0.5 ? -1 : 1, fuse: 0, dead: false, heavy: d.heavy || 0,
    bstate: 'chase', bt: 2, shotT: 0, spin: 0, spin2: 0, chargeA: 0, charging: false, summoned: false, enraged: false, last: '',
  };
}

function enemyShot(x, y, a, spd, dmg, color, r) {
  G.ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: r || 6, dmg, color: color || '#ff4dd2', life: 5 });
}

// ================= ПИКАПЫ =================
function makePickup(type, x, y) {
  const pk = { id: G.nextId++, type, x, y, vx: rand(-140, 140), vy: rand(-140, 140), r: type === 'orb' ? 5 : 14, life: type === 'orb' ? 14 : type === 'health' ? 20 : 40, bob: rand(0, TAU), mag: false, attract: false };
  if (type === 'weapon') {
    const pool = WEAPON_ORDER.slice(1);
    const notOwned = pool.filter((w) => G.players.some((p) => !p.owned.includes(w)));
    pk.weapon = notOwned.length && Math.random() < 0.7 ? pick(notOwned) : pick(pool);
    pk.vx *= 0.3; pk.vy *= 0.3;
  }
  return pk;
}

function dropOrbs(x, y, n) {
  for (let i = 0; i < n; i++) G.pickups.push(makePickup('orb', x, y));
}

function giveWeapon(p, id) {
  const w = WEAPONS[id], max = maxAmmo(p, id);
  if (p.owned.includes(id)) {
    p.ammo[id] = Math.min(max, p.ammo[id] + Math.ceil(max * 0.6));
    fx('ptext', p.id, '+ПАТРОНЫ: ' + w.name, w.color, 'pickup');
  } else {
    p.owned.push(id);
    p.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
    p.ammo[id] = max;
    p.cur = id;
    fx('ptext', p.id, 'НОВОЕ ОРУЖИЕ: ' + w.name.toUpperCase(), w.color, 'weapon');
    fx('ring', Math.round(p.x), Math.round(p.y), w.color, 10, 90, 0.5, 4);
  }
}

function collectPickup(pk, p) {
  if (pk.type === 'orb') {
    const was = p.energy;
    p.energy = Math.min(100, p.energy + 3.5 * p.ultMult);
    G.score += 2;
    fx('sfx', 'orb');
    Ch.onOrb();
    if (was < 100 && p.energy >= 100) fx('ready', p.id);
  } else if (pk.type === 'health') {
    p.hp = Math.min(p.maxHp, p.hp + 30);
    fx('ptext', p.id, '+30 HP', '#ff6b8e', 'heal');
  } else if (pk.type === 'weapon') {
    giveWeapon(p, pk.weapon);
  }
}

// ================= ИГРОКИ: ДВИЖЕНИЕ И ДЕЙСТВИЯ =================
// движение считает тот, кто управляет игроком (хост — для своих, клиент — для себя)
function movePlayer(p, dt) {
  if (p.dead) return;
  const I = p.intent;
  p.angle = I.aim;
  p.dashCd -= dt;
  const il = Math.hypot(I.mx, I.my);
  if (I.dash && p.dashCd <= 0 && p.dashTime <= 0) {
    let dx = I.mx, dy = I.my;
    if (il < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
    else { dx /= il; dy /= il; }
    p.dashTime = 0.17; p.dashDx = dx * 1150; p.dashDy = dy * 1150;
    p.dashCd = p.dashMax;
    if (isAuth()) { p.invuln = Math.max(p.invuln, 0.3); fx('dash', Math.round(p.x), Math.round(p.y), p.color); }
    else EFX.dash(p.x, p.y, p.color);
  }
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x += p.dashDx * dt; p.y += p.dashDy * dt;
    p.vx = p.dashDx * 0.3; p.vy = p.dashDy * 0.3;
    if (p.dashTime <= 0 && isAuth()) dashNova(p);
  } else {
    const f = 1 - Math.exp(-dt * 14);
    p.vx += (I.mx * p.speed - p.vx) * f;
    p.vy += (I.my * p.speed - p.vy) * f;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (const w of G.walls) resolveCircleRect(p, p.r, w);
  for (const b of G.barrels) pushOutCircle(p, p.r, b);
  p.x = clamp(p.x, p.r, G.W - p.r); p.y = clamp(p.y, p.r, G.H - p.r);
}

function dashNova(p) {
  if (p.dashNova <= 0) return;
  triggerNova(p.x, p.y, 100 + p.dashNova * 25, 25 * p.dashNova * p.dmgMult, false, p.color, p);
  fx('sfx', 'slam');
  fx('shake', 5);
}

function switchWeapon(p, id) {
  if (!p.owned.includes(id) || p.cur === id) return;
  p.cur = id;
  p.fireCd = Math.max(p.fireCd, 0.12);
  if (isLocalPlayer(p)) SFX.play('click');
}

// стрельба, ульта, регенерация — только у авторитетной стороны
function actPlayer(p, dt) {
  const I = p.intent;
  if (p.ctl === 'net') {
    if (p.dashing && !p.wasDashing) p.invuln = Math.max(p.invuln, 0.3);
    if (!p.dashing && p.wasDashing && !p.dead) dashNova(p);
    p.wasDashing = p.dashing;
  }
  p.invuln -= dt; p.flash -= dt;
  if (p.dead) { I.ult = false; I.weapon = null; I.cycle = 0; return; }

  if (I.weapon) switchWeapon(p, I.weapon);
  else if (I.cycle) {
    const idx = p.owned.indexOf(p.cur), n = p.owned.length;
    switchWeapon(p, p.owned[(idx + I.cycle + n) % n]);
  }
  p.fireCd -= dt;
  if (I.fire && p.fireCd <= 0) fireWeapon(p);

  if (I.ult) {
    if (p.energy >= 100) {
      p.energy = 0;
      triggerNova(p.x, p.y, 720, 170 * p.dmgMult, true, '#ffffff', p);
      fx('ult', p.id, Math.round(p.x), Math.round(p.y));
      G.stats.novas++;
      if (!isOnline()) G.hitstop = 0.07;
    } else if (isLocalPlayer(p)) {
      FX.text(p.x, p.y - 30, 'Нужно больше энергии', '#8fe8b8', 13);
    }
  }
  if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  if (p.ctl === 'net') { I.ult = false; I.weapon = null; I.cycle = 0; }
}

function fireWeapon(p) {
  const w = WEAPONS[p.cur];
  if (p.ammo[p.cur] <= 0) { switchWeapon(p, 'blaster'); return; }
  p.fireCd = w.rate / p.rateMult;
  if (p.ammo[p.cur] !== Infinity) p.ammo[p.cur]--;
  const a = p.angle, ca = Math.cos(a), sa = Math.sin(a);
  const mx = p.x + ca * 24, my = p.y + sa * 24;

  if (w.hitscan) {
    const n = 1 + p.extraProj;
    for (let i = 0; i < n; i++) fireRail(p, mx, my, a + (i - (n - 1) / 2) * 0.07, w);
    G.stats.shots++;
  } else {
    const n = w.count > 1 ? w.count + p.extraProj * 2 : 1 + p.extraProj;
    for (let i = 0; i < n; i++) {
      let ang;
      if (w.count > 1) ang = a + rand(-w.spread / 2, w.spread / 2);
      else ang = a + (i - (n - 1) / 2) * 0.13 + rand(-w.spread, w.spread);
      const sp = w.speed * (w.speedVar ? rand(1 - w.speedVar, 1 + w.speedVar) : 1);
      G.bullets.push({
        x: mx, y: my, px: mx, py: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: w.r,
        dmg: w.dmg * p.dmgMult, life: w.life * (w.speedVar ? rand(0.85, 1.1) : 1), color: w.color,
        pierce: (w.pierce || 0) + p.pierce, bounce: (w.bounce || 0) + p.bounce, explode: w.explode || null,
        homing: w.homing || 0, knock: w.knock || 120, kind: p.cur, hit: null, drone: false, counted: false, own: p,
      });
    }
    G.stats.shots += n;
  }
  if (w.push && isLocalPlayer(p) && p.dashTime <= 0) { p.vx -= ca * w.push; p.vy -= sa * w.push; }
  fx('shot', p.id, Math.round(mx), Math.round(my), +a.toFixed(2), WEAPON_ORDER.indexOf(p.cur));
}

function fireRail(p, x, y, a, w) {
  const len = 2600, dx = Math.cos(a) * len, dy = Math.sin(a) * len;
  const tx = dx > 0 ? (G.W - x) / dx : dx < 0 ? -x / dx : Infinity;
  const ty = dy > 0 ? (G.H - y) / dy : dy < 0 ? -y / dy : Infinity;
  let tEnd = Math.min(1, tx, ty);
  for (const wl of G.walls) { const t = segRect(x, y, x + dx, y + dy, wl); if (t >= 0 && t < tEnd) tEnd = t; }
  const ex = x + dx * tEnd, ey = y + dy * tEnd;
  const dmg = w.dmg * p.dmgMult;
  let any = false;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (segCircle(x, y, ex, ey, e.x, e.y, e.r + 5) >= 0) {
      damageEnemy(e, dmg, { kx: Math.cos(a) * 320, ky: Math.sin(a) * 320, src: p, kind: 'rail' });
      any = true;
    }
  }
  if (any) G.stats.hits++;
  for (const b of G.barrels) if (segCircle(x, y, ex, ey, b.x, b.y, b.r) >= 0) hitBarrel(b, dmg);
  fx('rail', Math.round(x), Math.round(y), Math.round(ex), Math.round(ey), w.color);
}

function damagePlayer(p, dmg, sx, sy) {
  if (p.dead || p.invuln > 0 || isDashing(p)) return;
  p.hp -= dmg;
  p.invuln = 0.7;
  G.combo = 0;
  Ch.onHurt();
  if (!isOnline()) G.hitstop = 0.04;
  const a = Math.atan2(p.y - sy, p.x - sx);
  fx('knock', p.id, Math.round(Math.cos(a) * 380), Math.round(Math.sin(a) * 380));
  fx('hurt', p.id, Math.round(p.x), Math.round(p.y), Math.round(dmg));
  if (p.hp <= 0) { p.hp = 0; killPlayer(p); }
}

function killPlayer(p) {
  p.dead = true;
  p.revive = 0;
  fx('pdie', p.id, Math.round(p.x), Math.round(p.y));
  if (!anyAlive()) {
    G.dying = 2.4;
    if (!isOnline()) G.slowmo = 2;
    fx('music', 0);
  } else {
    fx('text', Math.round(p.x), Math.round(p.y - 40), p.name + ' повержен!', '#ff6b8e', 18, 1);
  }
}

function revivePlayer(p, frac, teleport) {
  p.dead = false;
  p.revive = 0;
  p.hp = Math.max(1, Math.round(p.maxHp * frac));
  p.invuln = 2;
  if (teleport) {
    const a = G.players.find((q) => !q.dead && q !== p);
    if (a) { p.x = clamp(a.x + rand(-40, 40), 20, G.W - 20); p.y = clamp(a.y + rand(-40, 40), 20, G.H - 20); }
    p.tp++;
    p.rx = p.x; p.ry = p.y; p.vx = p.vy = 0;
  }
  fx('revive', p.id, Math.round(p.x), Math.round(p.y));
}

function updateRevives(dt) {
  if (G.players.length < 2) return;
  for (const p of G.players) {
    if (!p.dead) continue;
    let near = false;
    for (const q of G.players) if (q !== p && !q.dead && dist2(p.x, p.y, q.x, q.y) < 80 * 80) { near = true; break; }
    if (near) { p.revive += dt; if (p.revive >= 2.5) revivePlayer(p, 0.4, false); }
    else p.revive = Math.max(0, p.revive - dt * 0.5);
  }
}

// ================= БОЙ =================
function addShake(v) { G.shake = Math.min(28, G.shake + v); }

function damageEnemy(e, dmg, o) {
  if (e.dead) return;
  o = o || {};
  const src = o.src || G.players[0];
  let crit = false;
  if (o.canCrit !== false && Math.random() < src.crit) { dmg *= 2; crit = true; }
  G.stats.dmg += Math.min(dmg, Math.max(0, e.hp));
  e.hp -= dmg; e.flash = 0.07;
  if (o.kx) { const h = 1 - e.heavy; e.kvx += o.kx * h; e.kvy += o.ky * h; }
  if (src.cryo > 0 && Math.random() < src.cryo) e.slow = 2;
  fx('num', Math.round(e.x), Math.round(e.y - e.r - 4), Math.round(dmg), crit ? 1 : 0);
  if (o.chain !== false && src.chain > 0 && Math.random() < src.chain) chainLightning(e, dmg * 0.7, src);
  if (e.hp <= 0) killEnemy(e, src, o.kind, o.expl);
}

function killEnemy(e, src, kind, expl) {
  if (e.dead) return;
  e.dead = true;
  const d = ENEMIES[e.type];
  G.kills++; G.combo++; G.comboTimer = 2.5;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  if (kind) G.stats.wk[kind] = (G.stats.wk[kind] || 0) + 1;
  if (expl) G.stats.expl++;
  if (e.type === 'boss') G.stats.bosses++;
  Ch.onKill(e, kind, expl);
  Ch.onCombo(G.combo);
  if (e.elite) G.pickups.push(makePickup('weapon', e.x, e.y));
  const pts = Math.round(d.score * comboMult());
  G.score += pts;
  fx('kill', Math.round(e.x), Math.round(e.y), ETYPES.indexOf(e.type));

  if (src && src.lifesteal > 0 && !src.dead) src.hp = Math.min(src.maxHp, src.hp + src.lifesteal);
  dropOrbs(e.x, e.y, d.energy);
  const lowHp = G.players.some((p) => !p.dead && p.hp < p.maxHp * 0.4);
  if (Math.random() < (lowHp ? 0.07 : 0.035)) G.pickups.push(makePickup('health', e.x, e.y));
  if (Math.random() < (e.type === 'tank' ? 0.3 : 0.015)) G.pickups.push(makePickup('weapon', e.x, e.y));

  if (e.type === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + rand(-0.3, 0.3);
      const m = makeEnemy('mini', e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12);
      m.kvx = Math.cos(a) * 320; m.kvy = Math.sin(a) * 320; m.spawnT = 0;
      G.enemies.push(m);
    }
  }
  if (e.type === 'bomber') explode(e.x, e.y, 95, e.dmg, 'both', e.dmg, src, 'bomber');
  if (e.type === 'boss') bossDeath(e, pts);
}

function bossDeath(e, pts) {
  if (!isOnline()) G.slowmo = 1.6;
  fx('flash', 0.7);
  fx('shake', 30);
  for (let i = 0; i < 6; i++) fx('boom', Math.round(e.x + rand(-80, 80)), Math.round(e.y + rand(-80, 80)), Math.round(rand(80, 160)), pick(['#ff2d95', '#ffb13b', '#b46bff']));
  fx('shards', Math.round(e.x), Math.round(e.y), '#ff2d95', 30, 600);
  G.ebullets.length = 0;
  for (let i = 0; i < 1 + G.pc; i++) G.pickups.push(makePickup('weapon', e.x + rand(-70, 70), e.y + rand(-70, 70)));
  for (let i = 0; i < 2 + G.pc; i++) G.pickups.push(makePickup('health', e.x + rand(-70, 70), e.y + rand(-70, 70)));
  fx('banner', 'БОСС ПОВЕРЖЕН', '+' + pts.toLocaleString('ru-RU') + ' очков', 2.6, '#ffb13b');
  G.boss = null;
  fx('music', 1);
}

// owner: 'p' — бьёт только врагов, 'e' — только игроков, 'both' — всех
function explode(x, y, r, dmg, owner, pdmg, src, kind) {
  fx('boom', Math.round(x), Math.round(y), Math.round(r), '#ffb13b');
  if (owner !== 'e') {
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < r + e.r) {
        const a = Math.atan2(e.y - y, e.x - x);
        damageEnemy(e, dmg * (1 - 0.5 * Math.min(1, d / r)), { kx: Math.cos(a) * 460, ky: Math.sin(a) * 460, chain: false, src, kind, expl: true });
      }
    }
  }
  if (owner !== 'p') {
    for (const p of G.players) {
      if (p.dead) continue;
      const d = dist(x, y, p.x, p.y);
      if (d < r + p.r) damagePlayer(p, (pdmg === undefined ? dmg : pdmg) * (1 - 0.5 * Math.min(1, d / r)), x, y);
    }
  }
  for (const b of G.barrels) if (b.fuse < 0 && dist(x, y, b.x, b.y) < r + b.r) b.fuse = 0.12;
}

function hitBarrel(b, dmg) {
  b.hp -= dmg; b.flash = 0.08;
  if (b.hp <= 0 && b.fuse < 0) b.fuse = 0.04;
}

function chainLightning(srcE, dmg, src) {
  const hit = [srcE.id];
  let cur = srcE;
  const pts = [{ x: srcE.x, y: srcE.y }];
  for (let k = 0; k < 3; k++) {
    let best = null, bd = 240 * 240;
    for (const e of G.enemies) {
      if (e.dead || hit.includes(e.id)) continue;
      const d2 = dist2(cur.x, cur.y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) break;
    hit.push(best.id);
    pts.push({ x: best.x, y: best.y });
    damageEnemy(best, dmg, { chain: false, canCrit: false, src, kind: 'chain' });
    cur = best;
  }
  if (pts.length > 1) {
    const flat = [Math.round(pts[0].x), Math.round(pts[0].y)];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1;
      for (let s = 1; s <= 5; s++) {
        const t = s / 6, off = rand(-18, 18);
        flat.push(Math.round(a.x + (b.x - a.x) * t + (nx / L) * off), Math.round(a.y + (b.y - a.y) * t + (ny / L) * off));
      }
      flat.push(Math.round(b.x), Math.round(b.y));
    }
    fx('bolt', flat);
  }
}

function triggerNova(x, y, max, dmg, clear, color, src) {
  G.novas.push({ x, y, r: 0, max, dmg, clear, hit: new Set(), speed: Math.max(900, max * 2.2), src });
  fx('nova', Math.round(x), Math.round(y), Math.round(max), color);
}

// ================= ОБНОВЛЕНИЯ СИМУЛЯЦИИ =================
function updateBullets(dt) {
  const B = G.bullets, E = G.enemies;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      if (b.homing) {
        const best = nearestEnemy(b.x, b.y, 460);
        if (best) {
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
          const na = cur + clamp(angleDiff(cur, want), -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;

      let hitWall = false;
      if (b.x < 0 || b.x > G.W) { if (b.bounce > 0) { b.vx = -b.vx; b.x = b.px; b.bounce--; fx('sfx', 'bounce'); } else hitWall = true; }
      if (b.y < 0 || b.y > G.H) { if (b.bounce > 0) { b.vy = -b.vy; b.y = b.py; b.bounce--; fx('sfx', 'bounce'); } else hitWall = true; }
      if (!hitWall) {
        for (const w of G.walls) {
          if (!pointInRect(b.x, b.y, w)) continue;
          if (b.bounce > 0) {
            const outX = b.px <= w.x || b.px >= w.x + w.w, outY = b.py <= w.y || b.py >= w.y + w.h;
            if (outX) b.vx = -b.vx;
            if (outY) b.vy = -b.vy;
            if (!outX && !outY) { b.vx = -b.vx; b.vy = -b.vy; }
            b.x = b.px; b.y = b.py; b.bounce--;
            fx('sfx', 'bounce');
          } else hitWall = true;
          break;
        }
      }
      if (hitWall) {
        dead = true;
        fx('spark', Math.round(b.x), Math.round(b.y), b.color, 4, 200);
      } else {
        for (const e of E) {
          if (e.dead || e.spawnT > 0.15) continue;
          const rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
          if (b.hit && b.hit.includes(e.id)) continue;
          if (!b.drone && !b.counted) { G.stats.hits++; b.counted = true; }
          const sp = Math.hypot(b.vx, b.vy) || 1;
          damageEnemy(e, b.dmg, { kx: (b.vx / sp) * b.knock, ky: (b.vy / sp) * b.knock, src: b.own, kind: b.kind });
          if (b.explode) { dead = true; break; }
          if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = [])).push(e.id); b.dmg *= 0.85; }
          else { dead = true; break; }
        }
        if (!dead) {
          for (const br of G.barrels) {
            if (br.fuse < 0 && dist2(b.x, b.y, br.x, br.y) < (br.r + b.r) ** 2) { hitBarrel(br, b.dmg); dead = true; break; }
          }
        }
      }
    }
    if (dead) {
      if (b.explode) explode(b.x, b.y, b.explode.r, b.explode.dmg * b.own.dmgMult, 'p', 0, b.own, b.kind);
      removeAt(B, i);
    }
  }
}

function updateEnemyBullets(dt) {
  const B = G.ebullets;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > G.W || b.y > G.H;
    if (!dead) for (const w of G.walls) if (pointInRect(b.x, b.y, w)) { dead = true; break; }
    if (!dead) for (const br of G.barrels) if (br.fuse < 0 && dist2(b.x, b.y, br.x, br.y) < (br.r + b.r) ** 2) { hitBarrel(br, 10); dead = true; break; }
    if (!dead) {
      for (const p of G.players) {
        if (p.dead || p.invuln > 0 || isDashing(p)) continue;
        const rr = p.r + b.r - 4;
        if (dist2(b.x, b.y, p.x, p.y) < rr * rr) { damagePlayer(p, b.dmg, b.x, b.y); dead = true; break; }
      }
    }
    if (dead) removeAt(B, i);
  }
}

function updateSpawns(dt) {
  const S = G.spawns;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i];
    s.t -= dt;
    if (s.t <= 0) {
      const e = makeEnemy(s.type, s.x, s.y);
      if (s.elite) makeElite(e);
      G.enemies.push(e);
      if (s.type === 'boss') {
        G.boss = e;
        fx('shake', 20);
        fx('ring', Math.round(s.x), Math.round(s.y), '#ff2d95', 20, 300, 0.8, 8);
        fx('sfx', 'slam');
      }
      fx('spawned', Math.round(s.x), Math.round(s.y), ETYPES.indexOf(s.type));
      removeAt(S, i);
    }
  }
}

function updateEnemies(dt) {
  const E = G.enemies;
  for (let i = E.length - 1; i >= 0; i--) if (E[i].dead) removeAt(E, i);

  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), ov = (rr - d) * 0.5, nx = dx / d, ny = dy / d;
        const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
        a.x -= nx * ov * (mb / tot) * 2; a.y -= ny * ov * (mb / tot) * 2;
        b.x += nx * ov * (ma / tot) * 2; b.y += ny * ov * (ma / tot) * 2;
      }
    }
  }

  for (const e of E) {
    if (e.dead) continue;
    if (e.spawnT > 0) e.spawnT -= dt;
    e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    const tgt = nearestPlayer(e.x, e.y);
    const tx = tgt ? tgt.x : e.x, ty = tgt ? tgt.y : e.y;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, faceA = Math.atan2(dy, dx);
    let mx = ux, my = uy, sp = e.speed * (e.slow > 0 ? 0.5 : 1);

    switch (e.type) {
      case 'runner': {
        const w = Math.sin(G.time * 5 + e.seed) * 0.9;
        mx = ux - uy * w; my = uy + ux * w;
        break;
      }
      case 'shooter': {
        if (d > 400) { mx = ux; my = uy; }
        else if (d < 260) { mx = -ux; my = -uy; }
        else { mx = -uy * e.dir; my = ux * e.dir; if (Math.random() < dt * 0.3) e.dir *= -1; }
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 650 && tgt) {
          e.fireCd = ENEMIES.shooter.fireRate * rand(0.8, 1.25);
          const n = G.wave >= 9 ? 3 : 1;
          for (let k = 0; k < n; k++) enemyShot(e.x, e.y, faceA + (k - (n - 1) / 2) * 0.2, 300 + G.wave * 6, e.dmg, '#d66bff', 6);
          fx('sfx', 'enemyShoot');
        }
        break;
      }
      case 'bomber': {
        if (e.fuse > 0) {
          e.fuse -= dt; mx = 0; my = 0;
          if (e.fuse <= 0) { killEnemy(e, null); continue; }
        } else if (d < 80 && tgt) { e.fuse = 0.5; fx('sfx', 'arm'); }
        break;
      }
      case 'boss': {
        const r = updateBoss(e, dt, ux, uy, faceA);
        mx = r.mx; my = r.my; sp = r.sp;
        break;
      }
    }
    if (!tgt) { mx = Math.cos(e.seed + G.time * 0.4); my = Math.sin(e.seed + G.time * 0.4); sp *= 0.4; }

    const f = 1 - Math.exp(-dt * (e.charging ? 20 : 6));
    e.vx += (mx * sp - e.vx) * f; e.vy += (my * sp - e.vy) * f;
    e.x += (e.vx + e.kvx) * dt; e.y += (e.vy + e.kvy) * dt;
    const kf = Math.exp(-dt * 7);
    e.kvx *= kf; e.kvy *= kf;

    let hit = false;
    for (const w of G.walls) if (resolveCircleRect(e, e.r, w)) hit = true;
    for (const b of G.barrels) pushOutCircle(e, e.r, b);
    if (e.x < e.r || e.x > G.W - e.r || e.y < e.r || e.y > G.H - e.r) {
      e.x = clamp(e.x, e.r, G.W - e.r); e.y = clamp(e.y, e.r, G.H - e.r); hit = true;
    }
    if (hit && e.charging) {
      e.charging = false; e.bt = 0;
      fx('shake', 16); fx('sfx', 'slam');
      fx('spark', Math.round(e.x), Math.round(e.y), '#ff2d95', 30, 500);
      fx('ring', Math.round(e.x), Math.round(e.y), '#ff2d95', e.r, e.r * 3, 0.5, 6);
      const n = e.enraged ? 16 : 10;
      for (let k = 0; k < n; k++) enemyShot(e.x, e.y, (k * TAU) / n, 240, e.dmg * 0.45, '#ff7ad9', 7);
      bossNext(e);
    }

    if (e.type === 'splitter' || e.type === 'mini') e.angle += dt * (e.type === 'mini' ? 4 : 1.5);
    else if (e.type === 'tank') e.angle += dt * 0.8;
    else if (e.type !== 'boss') e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-dt * 10));

    if (e.spawnT <= 0 && e.type !== 'bomber') {
      for (const p of G.players) {
        if (p.dead) continue;
        const rr = e.r + p.r - 3;
        if (dist2(e.x, e.y, p.x, p.y) < rr * rr) damagePlayer(p, e.dmg * (e.charging ? 1.5 : 1), e.x, e.y);
      }
    }
  }
}

function updateBoss(e, dt, ux, uy, faceA) {
  if (!e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    fx('banner', 'ЯРОСТЬ', 'Босс в бешенстве!', 1.6, '#ff2d95');
    fx('shake', 16);
    fx('ring', Math.round(e.x), Math.round(e.y), '#ff2d95', e.r, e.r * 4, 0.7, 8);
    fx('sfx', 'bossWarn');
  }
  const k = e.enraged ? 1.4 : 1;
  e.bt -= dt;
  e.spin2 += dt * (e.enraged ? 2.2 : 1);
  let mx = 0, my = 0, sp = e.speed * k;
  switch (e.bstate) {
    case 'chase':
      mx = ux; my = uy;
      if (e.bt <= 0) bossNext(e);
      break;
    case 'spiral':
      sp = 0;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.1 / k;
        e.spin += 0.22;
        const arms = e.enraged ? 5 : 3;
        for (let i = 0; i < arms; i++) enemyShot(e.x, e.y, e.spin + (i * TAU) / arms, 230, e.dmg * 0.45, '#ff2d95', 7);
        fx('sfx', 'enemyShoot');
      }
      if (e.bt <= 0) bossNext(e);
      break;
    case 'burst':
      mx = ux * 0.3; my = uy * 0.3;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.75 / k;
        const n = e.enraged ? 26 : 18, off = rand(0, TAU);
        for (let i = 0; i < n; i++) enemyShot(e.x, e.y, off + (i * TAU) / n, 210, e.dmg * 0.45, '#ff7ad9', 8);
        fx('ring', Math.round(e.x), Math.round(e.y), '#ff2d95', e.r, e.r * 2, 0.3, 4);
        fx('sfx', 'enemyShoot');
      }
      if (e.bt <= 0) bossNext(e);
      break;
    case 'volley':
      sp = e.speed * 0.5; mx = -uy; my = ux;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        e.shotT = 0.38 / k;
        for (let i = -2; i <= 2; i++) enemyShot(e.x + ux * e.r, e.y + uy * e.r, faceA + i * 0.14, 340, e.dmg * 0.4, '#ffb13b', 6);
        fx('sfx', 'enemyShoot');
      }
      if (e.bt <= 0) bossNext(e);
      break;
    case 'charge':
      if (e.charging) {
        mx = Math.cos(e.chargeA); my = Math.sin(e.chargeA); sp = 950;
        if (e.bt <= 0) { e.charging = false; bossNext(e); }
      } else {
        sp = 0;
        if (e.bt > 0.28) e.chargeA = faceA;
        if (e.bt <= 0) { e.charging = true; e.bt = 0.65; fx('sfx', 'dash'); fx('shake', 6); }
      }
      break;
    case 'summon':
      sp = 0;
      if (!e.summoned) {
        e.summoned = true;
        const n = (e.enraged ? 7 : 5) + (G.pc - 1) * 2;
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n + rand(-0.2, 0.2);
          const x = clamp(e.x + Math.cos(a) * 150, 40, G.W - 40), y = clamp(e.y + Math.sin(a) * 150, 40, G.H - 40);
          if (isFree(x, y, 20)) spawnEnemyAt(pick(['grunt', 'runner', 'bomber']), x, y, 0.8);
        }
        fx('ring', Math.round(e.x), Math.round(e.y), '#c04dff', e.r, 200, 0.6, 6);
      }
      if (e.bt <= 0) bossNext(e);
      break;
  }
  e.angle = faceA;
  return { mx, my, sp };
}

function bossNext(e) {
  if (e.bstate !== 'chase') { e.bstate = 'chase'; e.bt = e.enraged ? 0.9 : 1.6; e.charging = false; return; }
  const opts = ['spiral', 'burst', 'charge', 'volley', 'summon'].filter((s) => s !== e.last);
  const s = pick(opts);
  e.last = s; e.bstate = s; e.shotT = 0.4; e.summoned = false; e.charging = false;
  e.bt = { spiral: 3.2, burst: 2.6, charge: 0.9, volley: 2.4, summon: 1.2 }[s];
}

function updatePickups(dt) {
  const P = G.pickups;
  for (let i = P.length - 1; i >= 0; i--) {
    const pk = P[i];
    pk.life -= dt; pk.bob += dt * 3;
    if (pk.life <= 0) { removeAt(P, i); continue; }
    const p = nearestPlayer(pk.x, pk.y);
    let d = Infinity, dx = 0, dy = 0;
    if (p) {
      dx = p.x - pk.x; dy = p.y - pk.y; d = Math.hypot(dx, dy) || 1;
      let range = 0;
      if (pk.type === 'orb') range = p.magnet;
      else if (pk.type === 'health' && p.hp < p.maxHp) range = p.magnet * 0.5;
      else if (pk.type === 'weapon') range = 45;
      if (d < range || pk.attract) pk.mag = true;
      if (pk.type === 'health' && p.hp >= p.maxHp) pk.mag = false;
    } else pk.mag = false;
    if (pk.mag) {
      pk.vx += (dx / d) * 2600 * dt; pk.vy += (dy / d) * 2600 * dt;
      const s = Math.hypot(pk.vx, pk.vy);
      if (s > 750) { pk.vx *= 750 / s; pk.vy *= 750 / s; }
    } else {
      const f = Math.exp(-dt * 4); pk.vx *= f; pk.vy *= f;
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    if (!pk.mag) for (const w of G.walls) resolveCircleRect(pk, pk.r, w);
    pk.x = clamp(pk.x, 10, G.W - 10); pk.y = clamp(pk.y, 10, G.H - 10);
    if (p && d < p.r + pk.r + 4) {
      if (pk.type === 'health' && p.hp >= p.maxHp) continue;
      collectPickup(pk, p);
      removeAt(P, i);
    }
  }
}

function updateBarrels(dt) {
  const B = G.barrels;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    b.flash -= dt; b.pulse += dt * 3;
    if (b.fuse >= 0) {
      b.fuse -= dt;
      if (b.fuse <= 0) {
        removeAt(B, i);
        explode(b.x, b.y, 140, 70 * (1 + G.wave * 0.05), 'both', 30, null, 'barrel');
        fx('shards', Math.round(b.x), Math.round(b.y), '#ff5a3b', 10, 450);
      }
    }
  }
}

function updateNovas(dt) {
  const N = G.novas;
  for (let i = N.length - 1; i >= 0; i--) {
    const n = N[i];
    n.r += n.speed * dt;
    for (const e of G.enemies) {
      if (e.dead || n.hit.has(e.id)) continue;
      const d = dist(n.x, n.y, e.x, e.y);
      if (d < n.r + e.r) {
        n.hit.add(e.id);
        const a = Math.atan2(e.y - n.y, e.x - n.x);
        damageEnemy(e, n.dmg, { kx: Math.cos(a) * 650, ky: Math.sin(a) * 650, chain: false, src: n.src, kind: 'nova' });
        e.slow = Math.max(e.slow, 1);
      }
    }
    if (n.clear) {
      const B = G.ebullets;
      for (let j = B.length - 1; j >= 0; j--) {
        const b = B[j];
        if (dist2(n.x, n.y, b.x, b.y) < n.r * n.r) removeAt(B, j);
      }
    }
    for (const b of G.barrels) if (b.fuse < 0 && dist(n.x, n.y, b.x, b.y) < n.r) b.fuse = 0.1;
    if (n.r >= n.max) removeAt(N, i);
  }
}

function dronePos(p, i) {
  const a = p.droneAngle + (i * TAU) / p.drones;
  return { x: p.rx + Math.cos(a) * 50, y: p.ry + Math.sin(a) * 50 };
}

function updateDrones(dt) {
  for (const p of G.players) {
    if (p.dead || p.drones <= 0) continue;
    for (let i = 0; i < p.drones; i++) {
      if (p.droneCd[i] === undefined) p.droneCd[i] = rand(0, 0.4);
      p.droneCd[i] -= dt;
      if (p.droneCd[i] > 0) continue;
      const { x, y } = dronePos(p, i);
      const best = nearestEnemy(x, y, 520);
      if (!best) { p.droneCd[i] = 0.15; continue; }
      const a = Math.atan2(best.y - y, best.x - x);
      G.bullets.push({ x, y, px: x, py: y, vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, r: 3, dmg: 9 * p.dmgMult, life: 0.7, color: '#7dd8ff', pierce: 0, bounce: 0, explode: null, homing: 0, knock: 50, kind: 'drone', hit: null, drone: true, counted: true, own: p });
      fx('dshot', Math.round(x), Math.round(y), +a.toFixed(2));
      p.droneCd[i] = 0.45 / p.rateMult;
    }
  }
}

// ---------- визуальные мелочи, которые обе стороны рисуют сами ----------
function cosmetics(dt) {
  for (const b of G.bullets) {
    if (b.kind === 'rocket') {
      if (Math.random() < 0.7) FX.smoke(b.x, b.y, 1, 7, '#2a2038');
      FX.add({ type: 'dot', x: b.x - b.vx * 0.02, y: b.y - b.vy * 0.02, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.2, size: 10, color: '#ff9d3b', drag: 2 });
    } else if (b.kind === 'plasma' && Math.random() < 0.5) {
      FX.add({ type: 'dot', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, size: 9, color: b.color, drag: 0 });
    }
  }
  for (const p of G.players) {
    const smooth = p.ctl === 'net' || p.ctl === 'remote';
    if (smooth) {
      const f = 1 - Math.exp(-dt * 16);
      if (dist2(p.rx, p.ry, p.x, p.y) > 250 * 250) { p.rx = p.x; p.ry = p.y; }
      p.rx += (p.x - p.rx) * f; p.ry += (p.y - p.ry) * f;
    } else { p.rx = p.x; p.ry = p.y; }
    p.recoil *= Math.exp(-dt * 16);
    if (p.skin === 'rainbow') p.color = RAINBOW[Math.floor(G.time * 8) % RAINBOW.length];
    p.droneAngle += dt * 2.2;
    if (!isAuth() || smooth) p.flash -= dt;
    if (p.dead) continue;
    if (isDashing(p)) FX.add({ type: 'ghost', x: p.rx, y: p.ry, vx: 0, vy: 0, life: 0.3, size: p.r, color: p.color, drag: 0 });
    else if (Math.hypot(p.vx, p.vy) > 60 && Math.random() < dt * 30) {
      const a = Math.atan2(p.vy, p.vx);
      FX.add({ type: 'dot', x: p.rx - Math.cos(a) * 12 + rand(-4, 4), y: p.ry - Math.sin(a) * 12 + rand(-4, 4), vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.3, size: 7, color: '#1a9bff', drag: 2 });
    }
  }
  for (const e of G.enemies) if (e.type === 'boss' && e.charging && Math.random() < 0.8) FX.spark(e.x, e.y, '#ff2d95', 2, 200);
}

function updateVisuals(dt, rdt) {
  for (let i = G.beams.length - 1; i >= 0; i--) { G.beams[i].life -= dt; if (G.beams[i].life <= 0) removeAt(G.beams, i); }
  for (let i = G.bolts.length - 1; i >= 0; i--) { G.bolts[i].life -= dt; if (G.bolts[i].life <= 0) removeAt(G.bolts, i); }
  for (let i = G.novaFx.length - 1; i >= 0; i--) { const n = G.novaFx[i]; n.r += n.speed * dt; if (n.r >= n.max) removeAt(G.novaFx, i); }
  cosmetics(dt);
  FX.update(dt);
  G.shake *= Math.exp(-rdt * 9); if (G.shake < 0.1) G.shake = 0;
  G.hurt = Math.max(0, G.hurt - rdt);
  G.whiteFlash = Math.max(0, G.whiteFlash - rdt);
  if (G.banner) { G.banner.t -= rdt; if (G.banner.t <= 0) G.banner = null; }
  G.decalTimer += dt;
  if (G.decalTimer > 2) { G.decalTimer = 0; Decals.fade(); }
}

function updateCamera(dt) {
  let tx, ty, z = ZOOM;
  if (G.mode === 'local') {
    const alive = G.players.filter((p) => !p.dead);
    const list = alive.length ? alive : G.players;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const p of list) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
    tx = (minx + maxx) / 2; ty = (miny + maxy) / 2;
    z = clamp(Math.min(ZOOM, VW / (maxx - minx + 560), VH / (maxy - miny + 440)), 0.45, ZOOM);
  } else {
    let f = G.me;
    if (f.dead) { const a = G.players.find((p) => !p.dead); if (a) f = a; }
    const look = f === G.me ? 0.22 : 0;
    tx = f.rx + ((input.mx - VW / 2) / G.zoom) * look;
    ty = f.ry + ((input.my - VH / 2) / G.zoom) * look;
  }
  const f = 1 - Math.exp(-dt * 7);
  G.cam.x += (tx - G.cam.x) * f;
  G.cam.y += (ty - G.cam.y) * f;
  G.zoom += (z - G.zoom) * (1 - Math.exp(-dt * 4));
  input.wx = G.cam.x + (input.mx - VW / 2) / G.zoom;
  input.wy = G.cam.y + (input.my - VH / 2) / G.zoom;
}

// полный шаг авторитетной симуляции (соло, локальный кооп, хост)
function update(dt, rdt) {
  G.time += dt;
  G.stats.time += dt;
  updateCamera(rdt);
  for (const p of G.players) if (p.ctl !== 'net') { readIntent(p); movePlayer(p, dt); }
  for (const p of G.players) actPlayer(p, dt);
  updateRevives(dt);
  updateDrones(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateSpawns(dt);
  updateEnemies(dt);
  updatePickups(dt);
  updateBarrels(dt);
  updateNovas(dt);
  Ch.update(dt);
  updateVisuals(dt, rdt);

  if (anyAlive()) updateWaves(dt);
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
  let alive = 0;
  for (const e of G.enemies) if (!e.dead) alive++;
  G.remaining = G.queue.length + G.spawns.length + alive;
  G.upWaiting = G.upPending.size;

  if (G.mode === 'host') Net.hostTick(rdt);
  if (G.dying > 0) { G.dying -= rdt; if (G.dying <= 0) gameOver(); }
}

// шаг клиента: своё движение + сглаживание снапшотов хоста
function clientUpdate(dt) {
  G.time += dt;
  updateCamera(dt);
  readIntent(G.me);
  movePlayer(G.me, dt);
  Net.clientTick(dt);
  updateVisuals(dt, dt);
}

// ================= МЕНЮ-ФОН =================
function initMenuScene() {
  G.players = []; G.me = null; G.pc = 1;
  G.barrels = []; G.pickups = []; G.bullets = []; G.ebullets = []; G.spawns = []; G.novas = []; G.novaFx = []; G.beams = []; G.bolts = [];
  G.boss = null; G.banner = null; G.wave = 1;
  G.walls = genWalls();
  G.enemies = [];
  for (let i = 0; i < 18; i++) {
    const pos = freePos(0, 40) || { x: G.W / 2, y: G.H / 2 };
    const e = makeEnemy(pick(['grunt', 'grunt', 'runner', 'shooter', 'splitter', 'tank', 'bomber']), pos.x, pos.y);
    e.spawnT = 0; e.tx = pos.x; e.ty = pos.y;
    G.enemies.push(e);
  }
  G.zoom = ZOOM;
  Decals.clear();
  FX.clear();
}

function updateMenu(dt) {
  G.time += dt;
  G.cam.x = G.W / 2 + Math.cos(G.time * 0.09) * 600;
  G.cam.y = G.H / 2 + Math.sin(G.time * 0.13) * 380;
  G.zoom = ZOOM;
  for (const e of G.enemies) {
    if (dist2(e.x, e.y, e.tx, e.ty) < 900 || Math.random() < dt * 0.1) { e.tx = rand(100, G.W - 100); e.ty = rand(100, G.H - 100); }
    const a = Math.atan2(e.ty - e.y, e.tx - e.x);
    e.x += Math.cos(a) * e.speed * 0.5 * dt; e.y += Math.sin(a) * e.speed * 0.5 * dt;
    for (const w of G.walls) resolveCircleRect(e, e.r, w);
    if (e.type === 'splitter' || e.type === 'tank') e.angle += dt; else e.angle = lerpAngle(e.angle, a, dt * 5);
    e.flash -= dt;
  }
  G.menuTimer -= dt;
  if (G.menuTimer <= 0) {
    G.menuTimer = rand(0.6, 1.6);
    const e = pick(G.enemies);
    const col = ENEMIES[e.type].color;
    FX.spark(e.x, e.y, col, 20, 400); FX.ring(e.x, e.y, col, 5, 60, 0.4, 3); FX.shards(e.x, e.y, col, 6, 300);
    Decals.splat(e.x, e.y, col, e.r * 1.4);
    const pos = freePos(0, 40);
    if (pos) { e.x = pos.x; e.y = pos.y; }
  }
  G.decalTimer += dt;
  if (G.decalTimer > 1) { G.decalTimer = 0; Decals.fade(); }
  FX.update(dt);
}

// ================= ВВОД / ЦИКЛ =================
// уровни графики: 0 — высокая, 1 — средняя, 2 — низкая (понижается сама, если лагает)
const QUALITY = [
  { name: 'ВЫСОКАЯ', dpr: 1.25, parts: 1600, texts: 70 },
  { name: 'СРЕДНЯЯ', dpr: 1, parts: 1000, texts: 45 },
  { name: 'НИЗКАЯ', dpr: 0.75, parts: 600, texts: 30 },
];
let quality = 0;
try { quality = clamp(parseInt(localStorage.getItem('ns_quality'), 10) || 0, 0, 2); } catch (e) {}
const perf = { ema: 1 / 60, slowT: 0 };

function setQuality(q, note) {
  quality = clamp(q, 0, 2);
  try { localStorage.setItem('ns_quality', String(quality)); } catch (e) {}
  resize();
  if (note && G.me) FX.text(G.me.x, G.me.y - 50, 'Графика: ' + QUALITY[quality].name, '#b9b3ff', 16, true);
}

// следим за FPS и сами снижаем качество, если игра не вытягивает
function trackPerf(raw) {
  if (G.state !== 'playing' || document.hidden) return;
  raw = Math.min(raw, 0.1);
  perf.ema = perf.ema * 0.95 + raw * 0.05;
  if (perf.ema > 0.024) perf.slowT += raw; else perf.slowT = Math.max(0, perf.slowT - raw * 0.5);
  if (perf.slowT > 2.5 && quality < 2) { perf.slowT = 0; perf.ema = 1 / 60; setQuality(quality + 1, true); }
}

function resize() {
  const Q = QUALITY[quality];
  DPR = Math.min(window.devicePixelRatio || 1, Q.dpr);
  FX.max = Q.parts;
  FX.maxTexts = Q.texts;
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR); canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  ZOOM = clamp(Math.min(VW / 1500, VH / 850), 0.6, 1.25);
  buildVignette();
}

function onKey(code) {
  if (code === 'KeyM') { SFX.toggleMute(); UI.updateMute(); }
  if (code === 'KeyG') setQuality((quality + 1) % QUALITY.length, true);
  if (code === 'Escape' || code === 'KeyP') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
    else if (code === 'Escape' && (G.state === 'localSetup' || G.state === 'online' || G.state === 'missions')) setState('menu');
  }
  if (G.state === 'upgrade' && /^Digit[1-3]$/.test(code)) pickUpgrade(G.upgradeChoices[+code[5] - 1]);
  if (G.state === 'menu' && code === 'Enter') startSolo();
  if (G.state === 'gameover' && code === 'Enter' && G.mode !== 'client') restartGame();
}

function bindInput() {
  addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    if (!input.keys[e.code]) input.pressed.add(e.code);
    input.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
    if (!e.repeat) onKey(e.code);
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('mousemove', (e) => { input.mx = e.clientX; input.my = e.clientY; });
  addEventListener('mousedown', (e) => {
    SFX.init();
    if (e.button === 0) input.down = true;
    if (e.button === 2) input.pressed.add('Mouse2');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.down = false; });
  addEventListener('wheel', (e) => { if (G.state === 'playing') input.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  // в онлайне игру нельзя поставить на паузу — только сбрасываем клавиши
  addEventListener('blur', () => { input.keys = Object.create(null); input.down = false; if (!isOnline()) pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !isOnline()) pauseGame(); });
  addEventListener('resize', resize);
}

function simRunning() {
  if (G.state === 'playing') return true;
  return G.mode === 'host' && (G.state === 'upgrade' || G.state === 'paused');
}

let lastT = performance.now();
function frame(now) {
  const raw = (now - lastT) / 1000;
  const rdt = Math.min(0.05, raw);
  lastT = now;
  trackPerf(raw);
  pollPads();
  const gp = getPad();
  if (gp) {
    if (padPressed(gp, 9)) onKey('Escape');
    if (G.state === 'upgrade') {
      if (padPressed(gp, 2)) pickUpgrade(G.upgradeChoices[0]);
      else if (padPressed(gp, 0)) pickUpgrade(G.upgradeChoices[1]);
      else if (padPressed(gp, 1)) pickUpgrade(G.upgradeChoices[2]);
    }
  }

  if (MENU_STATES.includes(G.state)) {
    updateMenu(rdt);
  } else if (G.mode === 'client') {
    if (G.state !== 'gameover') clientUpdate(rdt);
  } else if (simRunning()) {
    let dt = rdt;
    if (G.hitstop > 0) { G.hitstop -= rdt; dt *= 0.05; }
    if (G.slowmo > 0) { G.slowmo -= rdt; dt *= 0.3; }
    update(dt, rdt);
  }
  render();
  UI.tick();
  input.pressed.clear();
  input.wheel = 0;
  savePadPrev();
  requestAnimationFrame(frame);
}
