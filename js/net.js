'use strict';
// Онлайн через WebRTC (PeerJS). Хост считает весь мир, клиенты присылают ввод
// и свою позицию, хост рассылает снапшоты ~20 раз в секунду.
const NET_PREFIX = 'neonstorm-v1-';
const NET_MAX_PLAYERS = 4;

const Net = {
  peer: null, role: null, code: '', lobby: [], myId: 0, myName: '',
  conns: new Map(), hostConn: null, nextId: 1, started: false,
  events: [], snapT: 0, sendT: 0, pendU: false, pendW: null, pendC: 0, joinTimer: null,
  transport: null, ws: null, lanConns: new Map(), lan: null,

  available() { return typeof Peer !== 'undefined'; },

  // ---------- LAN: WebSocket через lan-server.ps1 ----------
  lanUrl() {
    const h = location.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1') return location.origin;
    const ip = this.lan && this.lan.ips && this.lan.ips[0];
    return ip ? `http://${ip}:${this.lan.port}` : location.origin;
  },

  openWs(onMsg, onOpen) {
    const ws = (this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'));
    ws.onopen = onOpen;
    ws.onmessage = (e) => { if (this.ws === ws) onMsg(String(e.data)); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.role === 'client') this.hostLost();
      else if (this.role === 'host') this.lanDown();
    };
    ws.onerror = () => { if (this.ws === ws && G.state === 'online') UI.netStatus('Не удалось связаться с LAN-сервером. Окно сервера открыто?', true); };
    return ws;
  },

  createLan(name) {
    this.leave();
    this.role = 'host'; this.transport = 'lan';
    this.myName = name; this.myId = 0; this.code = '';
    UI.netStatus('Создаю комнату в локальной сети…');
    this.openWs((m) => this.onLanHost(m), () => this.ws.send('host'));
  },

  onLanHost(m) {
    if (m === 'hosted') {
      this.lobby = [{ id: 0, name: this.myName, skin: Meta.data.skin }];
      this.nextId = 1; this.started = false;
      setState('lobby'); UI.showLobby();
    } else if (m === 'hostbusy') {
      UI.netStatus('В этой сети уже есть хост — нажми «Войти».', true);
      this.leave();
    } else if (m[0] === 'O') {
      const lid = +m.slice(1);
      const ws = this.ws;
      const conn = {
        lid, open: true, h: {},
        on(ev, fn) { this.h[ev] = fn; },
        emit(ev, a) { if (this.h[ev]) this.h[ev](a); },
        send(obj) { if (ws.readyState === 1) ws.send('T' + lid + '|' + JSON.stringify(obj)); },
        close() { if (ws.readyState === 1) ws.send('K' + lid); },
      };
      this.lanConns.set(lid, conn);
      this.onConn(conn);
    } else if (m[0] === 'C') {
      const conn = this.lanConns.get(+m.slice(1));
      if (conn) { conn.open = false; this.lanConns.delete(conn.lid); conn.emit('close'); }
    } else if (m[0] === 'D') {
      const bar = m.indexOf('|');
      const conn = this.lanConns.get(+m.slice(1, bar));
      if (conn) { try { conn.emit('data', JSON.parse(m.slice(bar + 1))); } catch (e) {} }
    }
  },

  joinLan(name) {
    this.leave();
    this.role = 'client'; this.transport = 'lan';
    this.myName = name;
    UI.netStatus('Подключаюсь к хосту в локальной сети…');
    this.openWs((m) => {
      if (m === 'joined') {
        const ws = this.ws;
        this.hostConn = { get open() { return ws.readyState === 1; }, send(obj) { ws.send('D' + JSON.stringify(obj)); } };
        this.hostConn.send({ t: 'hello', name, skin: Meta.data.skin });
      } else if (m === 'nohost') {
        UI.netStatus('Хоста пока нет — сначала кто-то должен нажать «Создать».', true);
        this.leave();
      } else if (m === 'X') {
        this.hostLost();
      } else if (m[0] === 'M') {
        try { this.onClientData(JSON.parse(m.slice(1))); } catch (e) {}
      }
    }, () => this.ws.send('join'));
  },

  lanDown() {
    this.leave();
    G.mode = 'solo';
    SFX.music(0.5);
    initMenuScene();
    setState('online');
    UI.netStatus('Связь с LAN-сервером потеряна — окно сервера закрыто?', true);
  },

  genCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  },

  errText(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'Комната не найдена. Проверь код.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Нет связи с сервером соединений. Проверь интернет.';
    if (t === 'browser-incompatible') return 'Браузер не поддерживает WebRTC.';
    return 'Ошибка сети: ' + (t || err);
  },

  // ---------- хост ----------
  create(name) {
    this.leave();
    if (!this.available()) { UI.netStatus('Библиотека PeerJS не загрузилась — нужен интернет.', true); return; }
    this.role = 'host'; this.transport = 'p2p';
    this.myName = name;
    this.myId = 0;
    this.code = this.genCode();
    UI.netStatus('Создаю комнату…');
    const peer = (this.peer = new Peer(NET_PREFIX + this.code, { debug: 1 }));
    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.lobby = [{ id: 0, name, skin: Meta.data.skin }];
      this.nextId = 1;
      this.started = false;
      setState('lobby');
      UI.showLobby();
    });
    peer.on('connection', (conn) => this.onConn(conn));
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id') { this.create(name); return; }
      UI.netStatus(this.errText(err), true);
    });
    peer.on('disconnected', () => { if (this.peer === peer && this.role === 'host') { try { peer.reconnect(); } catch (e) {} } });
  },

  onConn(conn) {
    conn.on('data', (d) => this.onHostData(conn, d));
    conn.on('close', () => this.dropConn(conn));
    conn.on('error', () => this.dropConn(conn));
  },

  onHostData(conn, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      const deny = (r) => { try { conn.send({ t: 'deny', r }); } catch (e) {} setTimeout(() => conn.close(), 400); };
      if (this.started) return deny('Игра уже идёт — дождись конца матча.');
      if (this.lobby.length >= NET_MAX_PLAYERS) return deny('Комната заполнена (максимум 4).');
      const id = this.nextId++;
      conn.pid = id;
      this.conns.set(id, conn);
      const skin = SKINS.some((s) => s.id === d.skin) ? d.skin : 'cyan';
      this.lobby.push({ id, name: String(d.name || 'Игрок').slice(0, 14), skin });
      conn.send({ t: 'welcome', id, code: this.code });
      this.sendLobby();
      SFX.play('pickup');
      if (G.state === 'lobby') UI.showLobby();
      return;
    }
    if (G.mode !== 'host') return;
    const p = playerById(conn.pid);
    if (!p) return;
    if (d.t === 'in') applyNetInput(p, d);
    else if (d.t === 'pick') applyUpgrade(p, d.u);
  },

  dropConn(conn) {
    if (this.role !== 'host' || conn.pid === undefined || !this.conns.has(conn.pid)) return;
    this.conns.delete(conn.pid);
    this.lobby = this.lobby.filter((l) => l.id !== conn.pid);
    this.sendLobby();
    if (G.mode === 'host') {
      const i = G.players.findIndex((p) => p.id === conn.pid);
      if (i >= 0) {
        const p = G.players[i];
        fx('text', Math.round(p.x), Math.round(p.y - 30), p.name + ' вышел', '#ff6b8e', 16, 1);
        G.players.splice(i, 1);
        G.upPending.delete(p.id);
        if (G.waveState === 'upgrade' && !G.upPending.size) finishUpgrades();
        if (!anyAlive() && !(G.dying > 0)) G.dying = 1.5;
      }
    }
    if (G.state === 'lobby') UI.showLobby();
  },

  sendLobby() { this.broadcast({ t: 'lobby', l: this.lobby }); },
  broadcast(m) {
    if (this.transport === 'lan') {
      if (this.ws && this.ws.readyState === 1 && this.conns.size) this.ws.send('T*|' + JSON.stringify(m));
      return;
    }
    for (const c of this.conns.values()) if (c.open) { try { c.send(m); } catch (e) {} }
  },
  sendTo(id, m) { const c = this.conns.get(id); if (c && c.open) { try { c.send(m); } catch (e) {} } },

  startGame() {
    if (this.role !== 'host') return;
    this.started = true;
    G.mode = 'host';
    newGame(this.lobby.map((l) => ({ id: l.id, name: l.name, ctl: l.id === 0 ? 'kbm' : 'net', skin: l.skin })));
    const walls = G.walls.map((w) => [w.x, w.y, w.w, w.h]);
    for (const [id, c] of this.conns) if (c.open) c.send({ t: 'start', you: id, walls, players: this.lobby });
    this.events = [];
    this.snapT = 0;
  },

  hostTick(dt) {
    this.snapT -= dt;
    if (this.snapT > 0) return;
    this.snapT = 0.05;
    if (!this.conns.size) { this.events.length = 0; return; }
    const s = buildSnapshot();
    this.events = [];
    this.broadcast(s);
  },

  // ---------- клиент ----------
  join(code, name) {
    this.leave();
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) { UI.netStatus('Введи код комнаты.', true); return; }
    if (!this.available()) { UI.netStatus('Библиотека PeerJS не загрузилась — нужен интернет.', true); return; }
    this.role = 'client'; this.transport = 'p2p';
    this.myName = name;
    UI.netStatus('Подключаюсь к комнате ' + code + '…');
    const peer = (this.peer = new Peer({ debug: 1 }));
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const c = (this.hostConn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json' }));
      c.on('open', () => c.send({ t: 'hello', name, skin: Meta.data.skin }));
      c.on('data', (d) => this.onClientData(d));
      c.on('close', () => this.hostLost());
      c.on('error', () => this.hostLost());
    });
    peer.on('error', (err) => { if (this.peer === peer) { UI.netStatus(this.errText(err), true); this.leave(); } });
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (this.role === 'client' && G.state === 'online') {
        UI.netStatus('Комната найдена, но прямое соединение не установилось (часто мешает роутер). Попробуй режим «По одному Wi-Fi» ниже.', true);
        this.leave();
      }
    }, 12000);
  },

  onClientData(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'welcome':
        clearTimeout(this.joinTimer);
        this.myId = d.id; this.code = d.code;
        setState('lobby'); UI.showLobby();
        break;
      case 'lobby':
        this.lobby = d.l;
        if (G.state === 'lobby') UI.showLobby();
        break;
      case 'deny':
        UI.netStatus(d.r, true);
        this.leave();
        break;
      case 'start': clientStart(d); break;
      case 's': if (G.mode === 'client') applySnapshot(d); break;
      case 'ups': if (G.mode === 'client') clientShowUpgrades(d.c); break;
      case 'over':
        if (G.mode === 'client') {
          if (d.s.score > G.best.score) { G.best.score = d.s.score; d.s.record = true; }
          if (d.s.wave > G.best.wave) G.best.wave = d.s.wave;
          saveBest();
          SFX.music(0);
          const res = recordRun(Object.assign({}, d.run || {}, { mode: 'client' }));
          UI.showGameOver(d.s, res);
          setState('gameover');
        }
        break;
    }
  },

  hostLost() {
    if (this.role !== 'client') return;
    this.leave();
    G.mode = 'solo';
    SFX.music(0.5);
    initMenuScene();
    setState('online');
    UI.netStatus('Соединение с хостом потеряно.', true);
  },

  send(m) { if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(m); } catch (e) {} } },

  clientTick(dt) {
    const me = G.me, I = me.intent;
    if (I.ult) this.pendU = true;
    if (I.weapon) this.pendW = I.weapon;
    if (I.cycle) this.pendC = I.cycle;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 30;
      this.send({
        t: 'in', x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy),
        a: +me.angle.toFixed(3), f: I.fire ? 1 : 0, d: me.dashTime > 0 ? 1 : 0,
        u: this.pendU ? 1 : 0, w: this.pendW, c: this.pendC,
      });
      this.pendU = false; this.pendW = null; this.pendC = 0;
    }
    // экстраполяция между снапшотами
    const f = 1 - Math.exp(-dt * 18);
    for (const e of G.enemies) {
      e.sx += e.svx * dt; e.sy += e.svy * dt;
      e.x += (e.sx - e.x) * f; e.y += (e.sy - e.y) * f;
    }
    for (const b of G.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const b of G.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const p of G.players) if (p !== G.me && !p.dead) { p.x += p.vx * dt; p.y += p.vy * dt; }
    for (const pk of G.pickups) { pk.bob += dt * 3; pk.life -= dt; }
    for (const b of G.barrels) b.pulse += dt * 3;
    for (const s of G.spawns) s.t = Math.max(0, s.t - dt);
  },

  leave() {
    const had = this.role;
    this.role = null;
    this.started = false;
    clearTimeout(this.joinTimer);
    if (had) { try { this.peer && this.peer.destroy(); } catch (e) {} }
    if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) {} }
    this.transport = null;
    this.lanConns.clear();
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
    this.lobby = [];
    this.events = [];
  },
};

// ================= СНАПШОТЫ =================
const r0 = Math.round;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function buildSnapshot() {
  return {
    t: 's',
    g: [G.wave, WSTATES.indexOf(G.waveState), r1(G.waveTimer), G.score, G.combo, r2(G.comboTimer), G.boss && !G.boss.dead ? G.boss.id : -1, G.remaining, G.upPending.size, G.kills, r0(G.upTimer)],
    p: G.players.map((p) => [
      p.id, r0(p.x), r0(p.y), r0(p.vx), r0(p.vy), r2(p.angle), r1(p.hp), p.maxHp, r1(p.energy),
      WEAPON_ORDER.indexOf(p.cur),
      WEAPON_ORDER.map((id) => (!p.owned.includes(id) ? -2 : p.ammo[id] === Infinity ? -1 : p.ammo[id])),
      p.dead ? 1 : 0, p.invuln > 0 ? 1 : 0, isDashing(p) ? 1 : 0, r0(p.speed), r2(p.dashMax), p.drones, r0(p.magnet), r2(p.revive), p.tp, p.ups,
    ]),
    e: G.enemies.filter((e) => !e.dead).map((e) => [
      e.id, ETYPES.indexOf(e.type), r0(e.x), r0(e.y), r0(e.vx + e.kvx), r0(e.vy + e.kvy), r2(e.angle), r0(e.hp), r0(e.maxHp),
      (e.flash > 0 ? 1 : 0) | (e.slow > 0 ? 2 : 0) | (e.charging ? 4 : 0) | (e.enraged ? 8 : 0) | (e.elite ? 16 : 0),
      r2(e.fuse), r2(Math.max(0, e.spawnT)), BSTATES.indexOf(e.bstate), r2(e.chargeA), r2(e.spin2),
    ]),
    b: G.bullets.map((b) => [r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), BKINDS.indexOf(b.kind)]),
    eb: G.ebullets.map((b) => [r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), b.r, Math.max(0, ECOLS.indexOf(b.color))]),
    k: G.pickups.map((k) => [k.id, PTYPES.indexOf(k.type), r0(k.x), r0(k.y), k.weapon ? WEAPON_ORDER.indexOf(k.weapon) : -1, r1(k.life)]),
    r: G.barrels.map((b) => [r0(b.x), r0(b.y), b.fuse >= 0 ? 1 : 0, b.flash > 0 ? 1 : 0]),
    sp: G.spawns.map((s) => [ETYPES.indexOf(s.type), r0(s.x), r0(s.y), r2(s.t), r2(s.max)]),
    ch: G.ch ? [G.ch.text, r1(G.ch.p), G.ch.goal, ['active', 'done', 'fail'].indexOf(G.ch.s), CH_REWARDS[G.ch.reward].text, G.ch.time === null ? -1 : r1(G.ch.time), G.ch.zone ? [G.ch.zone.x, G.ch.zone.y, G.ch.zone.r] : 0, G.ch.inZone ? 1 : 0, G.ch.why || '', G.ch.binary ? 1 : 0] : 0,
    ev: Net.events,
  };
}

function applyNetInput(p, d) {
  if (!p.dead) {
    p.x = clamp(+d.x || 0, p.r, G.W - p.r);
    p.y = clamp(+d.y || 0, p.r, G.H - p.r);
    p.vx = +d.vx || 0; p.vy = +d.vy || 0;
  }
  p.angle = p.intent.aim = +d.a || 0;
  p.intent.fire = !!d.f;
  p.dashing = !!d.d;
  if (d.u) p.intent.ult = true;
  if (d.w && WEAPONS[d.w]) p.intent.weapon = d.w;
  if (d.c) p.intent.cycle = d.c > 0 ? 1 : -1;
}

function clientStart(d) {
  G.mode = 'client';
  resetWorld();
  G.walls = d.walls.map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] }));
  G.players = d.players.map((l) => makePlayer(l.id, l.name, l.id === d.you ? 'kbm' : 'remote', l.skin));
  dedupeColors(G.players);
  G.me = playerById(d.you);
  G.pc = G.players.length;
  G.cam.x = G.me.x; G.cam.y = G.me.y; G.zoom = ZOOM;
  Net.myId = d.you;
  setState('playing');
  SFX.music(1);
}

function applySnapshot(s) {
  const g = s.g;
  G.wave = g[0];
  const ws = WSTATES[g[1]];
  G.waveState = ws;
  G.waveTimer = g[2]; G.score = g[3]; G.combo = g[4]; G.comboTimer = g[5];
  G.remaining = g[7]; G.upWaiting = g[8]; G.kills = g[9]; G.upTimer = g[10];
  if (G.state === 'upgrade' && ws !== 'upgrade') setState('playing');

  // игроки
  const ids = new Set();
  for (const a of s.p) {
    const p = playerById(a[0]);
    if (!p) continue;
    ids.add(p.id);
    const isMe = p === G.me;
    if (!isMe) { p.x = a[1]; p.y = a[2]; p.vx = a[3]; p.vy = a[4]; p.angle = a[5]; }
    p.hp = a[6]; p.maxHp = a[7]; p.energy = a[8]; p.cur = WEAPON_ORDER[a[9]] || 'blaster';
    p.owned = []; p.ammo = {};
    a[10].forEach((v, i) => {
      if (v === -2) return;
      const id = WEAPON_ORDER[i];
      p.owned.push(id);
      p.ammo[id] = v === -1 ? Infinity : v;
    });
    p.dead = !!a[11]; p.invuln = a[12] ? 0.1 : 0;
    if (!isMe) p.dashing = !!a[13];
    p.speed = a[14]; p.dashMax = a[15]; p.drones = a[16]; p.magnet = a[17]; p.revive = a[18];
    if (isMe && a[19] !== p.tp) { p.x = p.rx = a[1]; p.y = p.ry = a[2]; p.vx = p.vy = 0; }
    p.tp = a[19];
    p.ups = a[20] || {};
  }
  G.players = G.players.filter((p) => ids.has(p.id) || p === G.me);

  // враги (переиспользуем объекты для плавности)
  const old = new Map(G.enemies.map((e) => [e.id, e]));
  G.enemies = s.e.map((a) => {
    const type = ETYPES[a[1]];
    let e = old.get(a[0]);
    if (!e) e = { id: a[0], type, r: ENEMIES[type].r, x: a[2], y: a[3], dead: false, heavy: 0 };
    e.sx = a[2]; e.sy = a[3]; e.svx = a[4]; e.svy = a[5]; e.angle = a[6]; e.hp = a[7]; e.maxHp = a[8];
    const f = a[9];
    e.flash = f & 1 ? 0.05 : 0; e.slow = f & 2 ? 1 : 0; e.charging = !!(f & 4); e.enraged = !!(f & 8); e.elite = !!(f & 16);
    e.fuse = a[10]; e.spawnT = a[11]; e.bstate = BSTATES[a[12]] || 'chase'; e.chargeA = a[13]; e.spin2 = a[14];
    return e;
  });
  G.boss = g[6] >= 0 ? G.enemies.find((e) => e.id === g[6]) || null : null;

  G.bullets = s.b.map((a) => {
    const kind = BKINDS[a[4]], w = WEAPONS[kind];
    return { x: a[0], y: a[1], vx: a[2], vy: a[3], kind, color: w ? w.color : '#7dd8ff', r: w && w.r ? w.r : 3 };
  });
  G.ebullets = s.eb.map((a) => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], r: a[4], color: ECOLS[a[5]] || '#ff4dd2' }));

  const oldK = new Map(G.pickups.map((k) => [k.id, k]));
  G.pickups = s.k.map((a) => {
    const prev = oldK.get(a[0]);
    return { id: a[0], type: PTYPES[a[1]], x: a[2], y: a[3], weapon: a[4] >= 0 ? WEAPON_ORDER[a[4]] : null, life: a[5], r: a[1] === 0 ? 5 : 14, bob: prev ? prev.bob : rand(0, TAU) };
  });
  G.barrels = s.r.map((a) => ({ x: a[0], y: a[1], r: 17, fuse: a[2] ? 0.1 : -1, flash: a[3] ? 0.05 : 0, pulse: G.time * 3 + a[0] }));
  G.ch = s.ch ? { text: s.ch[0], p: s.ch[1], goal: s.ch[2], s: ['active', 'done', 'fail'][s.ch[3]], rewardText: s.ch[4], time: s.ch[5] < 0 ? null : s.ch[5], zone: s.ch[6] ? { x: s.ch[6][0], y: s.ch[6][1], r: s.ch[6][2] } : null, inZone: !!s.ch[7], why: s.ch[8], binary: !!s.ch[9] } : null;
  G.spawns = s.sp.map((a) => ({ type: ETYPES[a[0]], x: a[1], y: a[2], t: a[3], max: a[4] }));

  for (const ev of s.ev) {
    const fn = EFX[ev[0]];
    if (fn) { try { fn(...ev.slice(1)); } catch (e) { console.warn('fx', ev[0], e); } }
  }
}

function clientShowUpgrades(ids) {
  const ch = ids.map((id) => UPGRADES.find((u) => u.id === id)).filter(Boolean);
  if (!ch.length) return;
  G.me.choices = ch;
  G.picking = G.me.id;
  G.upgradeChoices = ch;
  UI.showUpgrades(ch, G.me, '');
  setState('upgrade');
}
