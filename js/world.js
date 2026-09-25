'use strict';
// =====================================================================
//  КАРТЫ И ИНТЕРАКТИВНЫЕ ОБЪЕКТЫ (обновление 2.0)
// =====================================================================
const MAPS = {
  city:    { name: 'Неоновый город',   accent: '#8a7bff', grid: '110,80,255',  border: '#ff2d95', floor: '#0a0818' },
  reactor: { name: 'Реактор',          accent: '#ff8a3b', grid: '255,120,60',  border: '#ffb13b', floor: '#120a0a' },
  grid:    { name: 'Кибер-решётка',    accent: '#33d6ff', grid: '51,200,255',  border: '#33ffff', floor: '#06101a' },
  canyon:  { name: 'Токсичный каньон', accent: '#4dff9a', grid: '77,255,154',  border: '#a6ff4d', floor: '#07130c' },
};
const MAP_IDS = Object.keys(MAPS);
const OKINDS = ['tele', 'boost', 'heal', 'turret', 'hazard', 'terminal', 'cell', 'reactor', 'bomb'];
const OBJ_R = { tele: 30, boost: 34, heal: 46, turret: 22, hazard: 105, terminal: 26, cell: 14, reactor: 60, bomb: 24 };

const rectW = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

const MAP_GEN = {
  city: () => genWalls(),
  reactor: () => {
    const w = [], cx = G.W / 2, cy = G.H / 2, R = 430, n = 12;
    for (let i = 0; i < n; i++) {
      if (i % 3 === 0) continue;
      const a = (i * TAU) / n, s = 64;
      w.push(rectW(cx + Math.cos(a) * R - s / 2, cy + Math.sin(a) * R - s / 2, s, s));
    }
    for (const [x, y] of [[260, 260], [G.W - 260, 260], [260, G.H - 260], [G.W - 260, G.H - 260]]) {
      const sx = x < cx ? 1 : -1, sy = y < cy ? 1 : -1;
      w.push(rectW(sx > 0 ? x : x - 220, y - 25, 220, 50));
      w.push(rectW(x - 25, sy > 0 ? y : y - 220, 50, 220));
    }
    w.push(rectW(cx - 40, 140, 80, 160), rectW(cx - 40, G.H - 300, 80, 160), rectW(140, cy - 40, 160, 80), rectW(G.W - 300, cy - 40, 160, 80));
    return w;
  },
  grid: () => {
    const w = [];
    for (let i = 1; i <= 5; i++) {
      for (let j = 1; j <= 3; j++) {
        const x = (G.W * i) / 6, y = (G.H * j) / 4;
        if (dist(x, y, G.W / 2, G.H / 2) < 330) continue;
        const s = (i + j) % 2 ? 90 : 130;
        w.push(rectW(x - s / 2, y - s / 2, s, s));
      }
    }
    return w;
  },
  canyon: () => {
    const w = [];
    for (const y of [G.H / 3, (2 * G.H) / 3]) {
      let x = 120;
      for (const g of [G.W * 0.2, G.W * 0.5, G.W * 0.8]) {
        if (g - 120 > x) w.push(rectW(x, y - 28, g - 120 - x, 56));
        x = g + 120;
      }
      if (x < G.W - 120) w.push(rectW(x, y - 28, G.W - 120 - x, 56));
    }
    for (const [x, y] of [[500, 300], [G.W - 500, 300], [500, G.H - 300], [G.W - 500, G.H - 300], [G.W / 2 - 520, G.H / 2], [G.W / 2 + 520, G.H / 2]]) {
      w.push(rectW(x - 45, y - 45, 90, 90));
    }
    return w;
  },
};

const World = {
  objById(id) { for (const o of G.objs) if (o.id === id) return o; return null; },

  addObj(kind, x, y, extra) {
    const o = Object.assign({ id: G.nextId++, kind, x: Math.round(x), y: Math.round(y), r: OBJ_R[kind] }, extra || {});
    G.objs.push(o);
    return o;
  },

  // свободное место для объекта: не в стенах, далеко от центра и от других объектов
  objPos(minCenter, near) {
    for (let i = 0; i < 80; i++) {
      let x, y;
      if (near) { x = near[0] + rand(-160, 160) * (1 + i / 20); y = near[1] + rand(-160, 160) * (1 + i / 20); }
      else { x = rand(140, G.W - 140); y = rand(140, G.H - 140); }
      if (x < 100 || y < 100 || x > G.W - 100 || y > G.H - 100) continue;
      if (dist(x, y, G.W / 2, G.H / 2) < minCenter) continue;
      let ok = true;
      for (const w of G.walls) if (pointInRect(x, y, w, 70)) { ok = false; break; }
      if (ok) for (const o of G.objs) if (dist2(x, y, o.x, o.y) < 200 * 200) { ok = false; break; }
      if (ok) return { x, y };
    }
    return null;
  },

  build(id) {
    G.mapId = id;
    G.theme = MAPS[id];
    G.objs = [];
    G.barrels = [];
    G.walls = MAP_GEN[id]();
    if (id === 'reactor') this.addObj('reactor', G.W / 2, G.H / 2);
    // телепорты — пары в противоположных углах
    for (const [a, b] of [[[300, 300], [G.W - 300, G.H - 300]], [[G.W - 300, 300], [300, G.H - 300]]]) {
      const pa = this.objPos(0, a), pb = this.objPos(0, b);
      if (!pa || !pb) continue;
      const A = this.addObj('tele', pa.x, pa.y), B = this.addObj('tele', pb.x, pb.y);
      A.pair = B.id; B.pair = A.id;
    }
    for (let i = 0; i < 2; i++) { const p = this.objPos(380); if (p) this.addObj('heal', p.x, p.y, { charge: 1, using: false }); }
    for (let i = 0; i < 2; i++) { const p = this.objPos(380); if (p) this.addObj('turret', p.x, p.y, { state: 0, t: 0, prog: 0, ang: rand(0, TAU), fireCd: 0, owner: -1 }); }
    for (let i = 0; i < 2; i++) { const p = this.objPos(420); if (p) this.addObj('hazard', p.x, p.y, { phase: 0, t: rand(4, 8), tick: 0 }); }
    for (let i = 0; i < 3; i++) { const p = this.objPos(300); if (p) this.addObj('boost', p.x, p.y, { dir: +rand(0, TAU).toFixed(2) }); }
  },

  // клиент получает стены и id карты от хоста; объекты придут в снапшоте
  applyNetMap(id, walls) {
    G.mapId = id;
    G.theme = MAPS[id] || MAPS.city;
    G.walls = walls.map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] }));
    G.objs = [];
    Decals.clear();
  },

  netMapMsg() { return { mapId: G.mapId, walls: G.walls.map((w) => [w.x, w.y, w.w, w.h]) }; },

  // переход в новый сектор после босса
  nextSector() {
    const id = pick(MAP_IDS.filter((i) => i !== G.mapId));
    this.build(id);
    G.pickups.length = 0; G.bullets.length = 0; G.ebullets.length = 0; G.spawns.length = 0;
    placeBarrels(8 + G.pc * 2);
    Decals.clear();
    for (const p of G.players) {
      p.x = p.rx = G.W / 2 + [0, 70, -70, 0][p.id % 4];
      p.y = p.ry = G.H / 2 + [0, 0, 0, 70][p.id % 4] + (id === 'reactor' ? 90 : 0);
      p.vx = p.vy = 0; p.tp++; p.carry = -1;
    }
    G.cam.x = G.me.x; G.cam.y = G.me.y;
    G.stats.sectors++;
    if (G.mode === 'host') Net.broadcast(Object.assign({ t: 'map' }, this.netMapMsg()));
    fx('banner', 'НОВЫЙ СЕКТОР', MAPS[id].name, 2.6, MAPS[id].accent);
    fx('sfx', 'tele');
  },

  // ---------- взаимодействие игрока при движении (считает тот, кто управляет игроком) ----------
  playerMove(p, dt) {
    p.teleCd -= dt;
    for (const o of G.objs) {
      if (o.kind === 'tele') {
        if (p.teleCd > 0 || dist2(p.x, p.y, o.x, o.y) > o.r * o.r) continue;
        const t = this.objById(o.pair);
        if (!t) continue;
        const ox = p.x, oy = p.y;
        p.x = t.x; p.y = t.y; p.rx = p.x; p.ry = p.y;
        p.teleCd = 1.2;
        if (isAuth()) fx('teleFx', Math.round(ox), Math.round(oy), Math.round(t.x), Math.round(t.y));
        else EFX.teleFx(ox, oy, t.x, t.y);
        break;
      } else if (o.kind === 'boost') {
        if (p.boostT > 0.1 || dist2(p.x, p.y, o.x, o.y) > o.r * o.r) continue;
        p.boostT = 0.45; p.boostDir = o.dir;
        if (isLocalPlayer(p)) SFX.play('dash');
      }
    }
  },

  // ---------- логика объектов (только у хоста / в соло) ----------
  update(dt) {
    for (const o of G.objs) {
      switch (o.kind) {
        case 'heal': {
          o.charge = Math.min(1, o.charge + dt * 0.04);
          o.using = false;
          if (o.charge < 0.02) break;
          for (const p of G.players) {
            if (p.dead || p.hp >= p.maxHp || dist2(p.x, p.y, o.x, o.y) > o.r * o.r) continue;
            p.hp = Math.min(p.maxHp, p.hp + 32 * dt);
            o.charge = Math.max(0, o.charge - dt * 0.16);
            o.using = true;
          }
          break;
        }
        case 'turret': this.updTurret(o, dt); break;
        case 'hazard': this.updHazard(o, dt); break;
        case 'terminal': {
          if (o.done) break;
          let near = false;
          for (const p of G.players) if (!p.dead && dist2(p.x, p.y, o.x, o.y) < 70 * 70) { near = true; break; }
          if (near) {
            o.prog += dt / 4;
            if (Math.random() < dt * 6) fx('sfx', 'hack');
            if (o.prog >= 1) {
              o.prog = 1; o.done = true;
              fx('ring', o.x, o.y, '#4dff9a', 10, 90, 0.5, 4);
              fx('text', o.x, o.y - 40, 'ТЕРМИНАЛ ВЗЛОМАН', '#4dff9a', 16, 1);
              if (Ch.active() && G.ch.id === 'terminals') Ch.progress(G.objs.filter((x) => x.kind === 'terminal' && x.done).length);
            }
          } else o.prog = Math.max(0, o.prog - dt * 0.08);
          break;
        }
        case 'cell': this.updCell(o, dt); break;
        case 'bomb': {
          let near = false;
          for (const p of G.players) if (!p.dead && dist2(p.x, p.y, o.x, o.y) < 70 * 70) { near = true; break; }
          if (near) { o.prog += dt / 3.5; if (Math.random() < dt * 5) fx('sfx', 'hack'); }
          else o.prog = Math.max(0, o.prog - dt * 0.25);
          if (o.prog >= 1 && Ch.active() && G.ch.id === 'bomb') {
            fx('ring', o.x, o.y, '#4dff9a', 10, 120, 0.5, 5);
            fx('text', o.x, o.y - 40, 'БОМБА ОБЕЗВРЕЖЕНА', '#4dff9a', 18, 1);
            Ch.complete();
          }
          break;
        }
      }
    }
  },

  updTurret(o, dt) {
    if (o.state === 0) {
      let hacker = null;
      for (const p of G.players) if (!p.dead && dist2(p.x, p.y, o.x, o.y) < 75 * 75) { hacker = p; break; }
      if (hacker) {
        o.prog += dt / 2;
        if (o.prog >= 1) {
          o.state = 1; o.t = 25; o.owner = hacker.id; o.prog = 0;
          G.stats.turrets++;
          fx('text', o.x, o.y - 40, 'ТУРЕЛЬ ЗАХВАЧЕНА', '#4dff9a', 16, 1);
          fx('ring', o.x, o.y, '#4dff9a', 10, 90, 0.5, 4);
          fx('sfx', 'upgrade');
        }
      } else o.prog = Math.max(0, o.prog - dt * 0.5);
    } else if (o.state === 1) {
      o.t -= dt;
      const tgt = nearestEnemy(o.x, o.y, 480);
      if (tgt) {
        const want = Math.atan2(tgt.y - o.y, tgt.x - o.x);
        o.ang += clamp(angleDiff(o.ang, want), -dt * 7, dt * 7);
        o.fireCd -= dt;
        if (o.fireCd <= 0 && Math.abs(angleDiff(o.ang, want)) < 0.3) {
          o.fireCd = 0.22;
          const own = playerById(o.owner) || G.players[0];
          const a = o.ang + rand(-0.05, 0.05), bx = o.x + Math.cos(a) * 26, by = o.y + Math.sin(a) * 26;
          G.bullets.push({ x: bx, y: by, px: bx, py: by, vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, r: 3.5, dmg: 13 * (1 + G.wave * 0.08), life: 0.6, color: '#4dff9a', pierce: 0, bounce: 0, explode: null, homing: 0, knock: 60, kind: 'turret', hit: null, drone: true, counted: true, own });
          fx('dshot', Math.round(bx), Math.round(by), +a.toFixed(2));
          fx('sfx', 'turret');
        }
      } else o.ang += dt * 0.6;
      if (o.t <= 0) { o.state = 2; o.t = 15; fx('text', o.x, o.y - 40, 'Турель перегрелась', '#ff8a3b', 14, 0); }
    } else {
      o.t -= dt;
      if (o.t <= 0) { o.state = 0; o.prog = 0; }
    }
  },

  updHazard(o, dt) {
    o.t -= dt;
    if (o.phase === 0 && o.t <= 0) { o.phase = 1; o.t = 1.3; fx('sfx', 'arm'); }
    else if (o.phase === 1 && o.t <= 0) { o.phase = 2; o.t = 2.2; fx('sfx', 'zap'); }
    else if (o.phase === 2) {
      o.tick -= dt;
      if (o.tick <= 0) {
        o.tick = 0.25;
        const rr = o.r * o.r;
        for (const e of G.enemies) {
          if (!e.dead && dist2(e.x, e.y, o.x, o.y) < rr) damageEnemy(e, 18 * (1 + G.wave * 0.06), { canCrit: false, chain: false, quiet: true, kind: 'hazard', src: G.players[0] });
        }
        for (const p of G.players) if (!p.dead && dist2(p.x, p.y, o.x, o.y) < rr) damagePlayer(p, 12, o.x, o.y);
      }
      if (o.t <= 0) { o.phase = 0; o.t = rand(5, 8); }
    }
  },

  updCell(o, dt) {
    if (o.carrier >= 0) {
      const c = playerById(o.carrier);
      if (!c || c.dead) {
        if (c) c.carry = -1;
        o.carrier = -1;
        fx('text', o.x, o.y - 30, 'Ячейка упала!', '#ffe23b', 14, 1);
        return;
      }
      o.x = Math.round(c.x); o.y = Math.round(c.y - 26);
      const re = G.objs.find((x) => x.kind === 'reactor');
      if (re && dist2(c.x, c.y, re.x, re.y) < (re.r + 30) ** 2) {
        c.carry = -1;
        o.dead = true;
        G.objs = G.objs.filter((x) => x !== o);
        fx('ring', re.x, re.y, '#ffb13b', 20, 150, 0.6, 6);
        fx('text', re.x, re.y - 70, 'ЯЧЕЙКА ДОСТАВЛЕНА', '#ffb13b', 18, 1);
        fx('sfx', 'weapon');
        if (Ch.active() && G.ch.id === 'cells') Ch.progress(G.ch.p + 1);
      }
      return;
    }
    for (const p of G.players) {
      if (p.dead || p.carry >= 0 || dist2(p.x, p.y, o.x, o.y) > 34 * 34) continue;
      o.carrier = p.id; p.carry = o.id;
      fx('ptext', p.id, 'Ячейка у тебя — неси в реактор!', '#ffe23b', 'pickup');
      break;
    }
  },

  // ---------- миссии на карте ----------
  spawnMission(kind) {
    if (kind === 'terminals') {
      for (let i = 0; i < 3; i++) { const p = this.objPos(300); if (p) this.addObj('terminal', p.x, p.y, { prog: 0, done: false, mission: true }); }
    } else if (kind === 'cells') {
      let re = G.objs.find((o) => o.kind === 'reactor');
      if (!re) { const p = this.objPos(250) || { x: G.W / 2, y: G.H / 2 - 250 }; re = this.addObj('reactor', p.x, p.y, { mission: true }); }
      for (let i = 0; i < 3; i++) {
        let p = null;
        for (let k = 0; k < 10 && !p; k++) { const q = this.objPos(0); if (q && dist(q.x, q.y, re.x, re.y) > 500) p = q; }
        if (p) this.addObj('cell', p.x, p.y, { carrier: -1, mission: true });
      }
    } else if (kind === 'bomb') {
      let p = null;
      for (let k = 0; k < 20 && !p; k++) {
        const q = this.objPos(0);
        if (q && !G.players.some((pl) => dist(q.x, q.y, pl.x, pl.y) < 650)) p = q;
      }
      p = p || this.objPos(0) || { x: 300, y: 300 };
      this.addObj('bomb', p.x, p.y, { prog: 0, mission: true });
    }
  },

  clearMission() {
    for (const p of G.players) p.carry = -1;
    G.objs = G.objs.filter((o) => !o.mission);
  },

  bombBlow() {
    const b = G.objs.find((o) => o.kind === 'bomb');
    if (!b) return;
    explode(b.x, b.y, 300, 120, 'both', 45, null, 'bomb');
    fx('shake', 25);
    fx('flash', 0.4);
  },

  // ---------- сеть ----------
  snap() {
    return G.objs.map((o) => {
      const a = [o.id, OKINDS.indexOf(o.kind), o.x, o.y];
      switch (o.kind) {
        case 'tele': a.push(o.pair); break;
        case 'boost': a.push(o.dir); break;
        case 'heal': a.push(Math.round(o.charge * 100) / 100, o.using ? 1 : 0); break;
        case 'turret': a.push(o.state, Math.round(o.ang * 100) / 100, Math.round((o.state === 0 ? o.prog : o.t) * 100) / 100, o.owner); break;
        case 'hazard': a.push(o.phase); break;
        case 'terminal': a.push(Math.round(o.prog * 100) / 100, o.done ? 1 : 0); break;
        case 'cell': a.push(o.carrier); break;
        case 'bomb': a.push(Math.round(o.prog * 100) / 100); break;
      }
      return a;
    });
  },

  applySnap(list) {
    const old = new Map(G.objs.map((o) => [o.id, o]));
    G.objs = list.map((a) => {
      const kind = OKINDS[a[1]];
      const o = old.get(a[0]) || { id: a[0], kind, r: OBJ_R[kind] };
      o.x = a[2]; o.y = a[3];
      switch (kind) {
        case 'tele': o.pair = a[4]; break;
        case 'boost': o.dir = a[4]; break;
        case 'heal': o.charge = a[4]; o.using = !!a[5]; break;
        case 'turret': o.state = a[4]; o.ang = a[5]; if (o.state === 0) o.prog = a[6]; else o.t = a[6]; o.owner = a[7]; break;
        case 'hazard': o.phase = a[4]; break;
        case 'terminal': o.prog = a[4]; o.done = !!a[5]; break;
        case 'cell': o.carrier = a[4]; break;
        case 'bomb': o.prog = a[4]; break;
      }
      return o;
    });
  },
};

// длина луча до стены / края арены
function rayLen(x, y, a, max) {
  const dx = Math.cos(a) * max, dy = Math.sin(a) * max;
  const tx = dx > 0 ? (G.W - x) / dx : dx < 0 ? -x / dx : Infinity;
  const ty = dy > 0 ? (G.H - y) / dy : dy < 0 ? -y / dy : Infinity;
  let t = Math.min(1, tx, ty);
  for (const w of G.walls) { const k = segRect(x, y, x + dx, y + dy, w); if (k >= 0 && k < t) t = k; }
  return max * Math.max(0, t);
}

// ломаная молния между точками (плоский массив координат для fx('bolt'))
function jagFlat(pts) {
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
  return flat;
}

// ---------- отрисовка объектов ----------
function drawObjects(c, v) {
  const T = G.time;
  for (const o of G.objs) {
    if (o.x < v.l - 150 || o.x > v.r + 150 || o.y < v.t - 150 || o.y > v.b + 150) continue;
    switch (o.kind) {
      case 'tele': {
        c.globalCompositeOperation = 'lighter';
        drawGlow(c, o.x, o.y, 60, '#b46bff', 0.6 + 0.2 * Math.sin(T * 4));
        c.strokeStyle = '#d6a8ff'; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          c.beginPath(); c.arc(o.x, o.y, o.r - i * 8, T * (2 + i) + i, T * (2 + i) + i + Math.PI * 1.3); c.stroke();
        }
        c.globalCompositeOperation = 'source-over';
        break;
      }
      case 'boost': {
        c.save(); c.translate(o.x, o.y); c.rotate(o.dir);
        c.fillStyle = rgba('#ffe23b', 0.08); c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.fill();
        c.strokeStyle = '#ffe23b'; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const k = ((T * 2 + i / 3) % 1), x = -20 + k * 40;
          c.globalAlpha = Math.sin(k * Math.PI);
          c.beginPath(); c.moveTo(x - 8, -12); c.lineTo(x + 4, 0); c.lineTo(x - 8, 12); c.stroke();
        }
        c.globalAlpha = 1;
        c.restore();
        break;
      }
      case 'heal': {
        c.globalCompositeOperation = 'lighter';
        drawGlow(c, o.x, o.y, 70, '#4dff9a', 0.25 + o.charge * 0.35);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = rgba('#4dff9a', 0.08); c.strokeStyle = rgba('#4dff9a', 0.5); c.lineWidth = 2;
        c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = '#4dff9a'; c.lineWidth = 5;
        c.beginPath(); c.arc(o.x, o.y, o.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * o.charge); c.stroke();
        c.fillStyle = o.charge > 0.05 ? '#4dff9a' : '#335544';
        c.fillRect(o.x - 5, o.y - 16, 10, 32); c.fillRect(o.x - 16, o.y - 5, 32, 10);
        if (o.using) {
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = rgba('#4dff9a', 0.6); c.lineWidth = 3;
          for (const p of G.players) if (!p.dead && dist2(p.rx, p.ry, o.x, o.y) < o.r * o.r * 1.5) { c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(p.rx, p.ry); c.stroke(); }
          c.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'turret': {
        const col = o.state === 1 ? '#4dff9a' : o.state === 2 ? '#ff8a3b' : '#8a86b8';
        if (o.state === 1) { c.globalCompositeOperation = 'lighter'; drawGlow(c, o.x, o.y, 55, '#4dff9a', 0.5); c.globalCompositeOperation = 'source-over'; }
        c.fillStyle = '#10131f'; c.strokeStyle = col; c.lineWidth = 3;
        c.beginPath(); c.roundRect(o.x - 22, o.y - 22, 44, 44, 8); c.fill(); c.stroke();
        c.save(); c.translate(o.x, o.y); c.rotate(o.ang);
        c.fillStyle = col; c.fillRect(4, -4, 26, 8);
        c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
        c.restore();
        c.lineWidth = 4;
        if (o.state === 0 && o.prog > 0) {
          c.strokeStyle = '#4dff9a';
          c.beginPath(); c.arc(o.x, o.y, 32, -Math.PI / 2, -Math.PI / 2 + TAU * o.prog); c.stroke();
        } else if (o.state === 1) {
          c.strokeStyle = rgba('#4dff9a', 0.7);
          c.beginPath(); c.arc(o.x, o.y, 32, -Math.PI / 2, -Math.PI / 2 + TAU * (o.t / 25)); c.stroke();
        }
        if (o.state === 0) label(c, 'ТУРЕЛЬ · встань рядом', o.x, o.y - 40, '#b9b3ff');
        break;
      }
      case 'hazard': {
        const ph = o.phase;
        if (ph === 0) {
          c.strokeStyle = rgba('#33d6ff', 0.18); c.lineWidth = 2;
          c.setLineDash([6, 10]);
          c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke();
          c.setLineDash([]);
        } else if (ph === 1) {
          const on = Math.floor(T * 10) % 2;
          c.fillStyle = rgba('#ffe23b', on ? 0.16 : 0.05);
          c.strokeStyle = '#ffe23b'; c.lineWidth = 3;
          c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); c.stroke();
          label(c, '⚠ ЭЛЕКТРОПОЛЕ', o.x, o.y, '#ffe23b');
        } else {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = rgba('#33d6ff', 0.14);
          c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill();
          c.strokeStyle = '#bff4ff'; c.lineWidth = 2;
          for (let k = 0; k < 5; k++) {
            let a = rand(0, TAU), rr = rand(0, o.r * 0.3);
            c.beginPath(); c.moveTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
            for (let s = 0; s < 5; s++) { a += rand(-0.8, 0.8); rr = Math.min(o.r, rr + o.r * 0.18); c.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr); }
            c.stroke();
          }
          c.strokeStyle = '#33d6ff'; c.lineWidth = 4;
          c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke();
          c.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'terminal': {
        const col = o.done ? '#4dff9a' : '#33ffff';
        c.globalCompositeOperation = 'lighter'; drawGlow(c, o.x, o.y, 55, col, 0.45); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#0c1422'; c.strokeStyle = col; c.lineWidth = 2.5;
        c.beginPath(); c.roundRect(o.x - 18, o.y - 22, 36, 44, 5); c.fill(); c.stroke();
        c.fillStyle = rgba(col, 0.5 + 0.3 * Math.sin(T * 6)); c.fillRect(o.x - 12, o.y - 16, 24, 16);
        c.strokeStyle = col; c.lineWidth = 5;
        c.beginPath(); c.arc(o.x, o.y, 36, -Math.PI / 2, -Math.PI / 2 + TAU * o.prog); c.stroke();
        label(c, o.done ? '✔ ВЗЛОМАН' : 'ТЕРМИНАЛ · стой рядом', o.x, o.y - 46, col);
        break;
      }
      case 'reactor': {
        const pulse = 1 + 0.06 * Math.sin(T * 3);
        c.globalCompositeOperation = 'lighter';
        drawGlow(c, o.x, o.y, 130 * pulse, '#ff8a3b', 0.55);
        c.strokeStyle = '#ffb13b'; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(o.x, o.y, o.r - i * 14, T * (i % 2 ? -1 : 1) + i, T * (i % 2 ? -1 : 1) + i + Math.PI * 1.5); c.stroke(); }
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#ffe0b0'; c.beginPath(); c.arc(o.x, o.y, 14 * pulse, 0, TAU); c.fill();
        if (G.objs.some((x) => x.kind === 'cell')) label(c, 'РЕАКТОР', o.x, o.y - o.r - 16, '#ffb13b');
        break;
      }
      case 'cell': {
        let x = o.x, y = o.y;
        if (o.carrier >= 0) { const p = playerById(o.carrier); if (p) { x = p.rx; y = p.ry - 26; } }
        c.globalCompositeOperation = 'lighter'; drawGlow(c, x, y, 34, '#ffe23b', 0.7); c.globalCompositeOperation = 'source-over';
        c.save(); c.translate(x, y); c.rotate(T * 2);
        c.fillStyle = '#2a2208'; c.strokeStyle = '#ffe23b'; c.lineWidth = 2.5;
        polyPath(c, 6, 12, 0); c.fill(); c.stroke();
        c.fillStyle = '#ffe23b'; c.fillRect(-3, -6, 6, 12);
        c.restore();
        if (o.carrier < 0) label(c, 'ЯЧЕЙКА', x, y - 24, '#ffe23b');
        break;
      }
      case 'bomb': {
        const blink = Math.floor(T * (G.ch && G.ch.time !== null && G.ch.time < 10 ? 8 : 3)) % 2;
        c.globalCompositeOperation = 'lighter'; drawGlow(c, o.x, o.y, 70, '#ff3b3b', blink ? 0.8 : 0.4); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#1a0606'; c.strokeStyle = '#ff3b3b'; c.lineWidth = 3;
        c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = blink ? '#ff3b3b' : '#661111'; c.beginPath(); c.arc(o.x, o.y, 7, 0, TAU); c.fill();
        c.strokeStyle = '#4dff9a'; c.lineWidth = 5;
        c.beginPath(); c.arc(o.x, o.y, o.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * o.prog); c.stroke();
        c.strokeStyle = rgba('#ff3b3b', 0.25); c.lineWidth = 2; c.setLineDash([8, 8]);
        c.beginPath(); c.arc(o.x, o.y, 300, 0, TAU); c.stroke(); c.setLineDash([]);
        const tl = G.ch && G.ch.time !== null ? Math.ceil(G.ch.time) : '';
        label(c, 'БОМБА ' + tl + 'с · стой рядом', o.x, o.y - o.r - 18, '#ff6b6b');
        break;
      }
    }
  }
}

function label(c, s, x, y, col) {
  c.font = `12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(s, x + 1.5, y + 1.5);
  c.fillStyle = col; c.fillText(s, x, y);
}
