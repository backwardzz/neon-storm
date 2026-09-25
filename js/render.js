'use strict';
let vignette = null;
function buildVignette() {
  vignette = document.createElement('canvas');
  const w = (vignette.width = Math.max(2, Math.floor(VW / 2)));
  const h = (vignette.height = Math.max(2, Math.floor(VH / 2)));
  const c = vignette.getContext('2d');
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.78)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function render() {
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#04030a';
  c.fillRect(0, 0, VW, VH);

  const Z = G.zoom || ZOOM;
  const sh = G.state === 'playing' ? G.shake : 0;
  const camX = G.cam.x + (sh ? rand(-sh, sh) : 0), camY = G.cam.y + (sh ? rand(-sh, sh) : 0);
  const hw = VW / 2 / Z, hh = VH / 2 / Z;
  const v = { l: camX - hw - 60, t: camY - hh - 60, r: camX + hw + 60, b: camY + hh + 60 };
  G.view = v; G.camX = camX; G.camY = camY;

  c.save();
  c.translate(VW / 2, VH / 2);
  c.scale(Z, Z);
  c.translate(-camX, -camY);
  drawFloor(c, v);
  drawSpawns(c);
  drawPickups(c, v);
  drawBarrels(c, v);
  drawWalls(c);
  drawEnemies(c, v);
  drawPlayers(c);
  drawDrones(c);
  drawProjectiles(c, v);
  drawEffects(c);
  FX.draw(c, v);
  FX.drawTexts(c);
  c.restore();

  c.drawImage(vignette, 0, 0, VW, VH);
  const inGame = !MENU_STATES.includes(G.state);
  const p = G.me;
  if (inGame && p && !p.dead && p.hp / p.maxHp < 0.3) {
    c.fillStyle = `rgba(255,20,60,${0.06 + 0.06 * Math.sin(performance.now() / 180)})`;
    c.fillRect(0, 0, VW, VH);
  }
  if (G.hurt > 0) { c.fillStyle = `rgba(255,30,70,${G.hurt * 0.35})`; c.fillRect(0, 0, VW, VH); }
  if (G.whiteFlash > 0) { c.fillStyle = `rgba(255,255,255,${G.whiteFlash * 0.7})`; c.fillRect(0, 0, VW, VH); }

  if (inGame && p) {
    drawIndicators(c);
    drawHUD(c);
  }
  if (G.state === 'playing' && p && !p.dead && p.ctl === 'kbm') drawCrosshair(c);
}

// ---------- мир ----------
function drawFloor(c, v) {
  c.fillStyle = '#0a0818';
  c.fillRect(0, 0, G.W, G.H);
  const l = Math.max(0, v.l), t = Math.max(0, v.t), r = Math.min(G.W, v.r), b = Math.min(G.H, v.b);
  if (r > l && b > t) c.drawImage(Decals.canvas, l, t, r - l, b - t, l, t, r - l, b - t);

  c.lineWidth = 1;
  c.strokeStyle = 'rgba(110,80,255,0.09)';
  c.beginPath();
  const s = 80;
  for (let x = Math.ceil(l / s) * s; x <= r; x += s) { c.moveTo(x, t); c.lineTo(x, b); }
  for (let y = Math.ceil(t / s) * s; y <= b; y += s) { c.moveTo(l, y); c.lineTo(r, y); }
  c.stroke();
  c.strokeStyle = 'rgba(110,80,255,0.2)';
  c.lineWidth = 2;
  c.beginPath();
  const S = 400;
  for (let x = Math.ceil(l / S) * S; x <= r; x += S) { c.moveTo(x, t); c.lineTo(x, b); }
  for (let y = Math.ceil(t / S) * S; y <= b; y += S) { c.moveTo(l, y); c.lineTo(r, y); }
  c.stroke();

  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(255,45,149,0.22)'; c.lineWidth = 16; c.strokeRect(0, 0, G.W, G.H);
  c.strokeStyle = '#ff2d95'; c.lineWidth = 3; c.strokeRect(0, 0, G.W, G.H);
  c.globalCompositeOperation = 'source-over';
}

function drawWalls(c) {
  c.fillStyle = 'rgba(0,0,0,0.55)';
  for (const w of G.walls) c.fillRect(w.x + 8, w.y + 12, w.w, w.h);
  for (const w of G.walls) {
    c.fillStyle = '#120e2a';
    c.fillRect(w.x, w.y, w.w, w.h);
    c.strokeStyle = 'rgba(120,100,255,0.22)';
    c.lineWidth = 1;
    c.strokeRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16);
  }
  c.globalCompositeOperation = 'lighter';
  for (const w of G.walls) {
    c.strokeStyle = 'rgba(110,90,255,0.22)'; c.lineWidth = 9; c.strokeRect(w.x, w.y, w.w, w.h);
    c.strokeStyle = '#8a7bff'; c.lineWidth = 2; c.strokeRect(w.x, w.y, w.w, w.h);
  }
  c.globalCompositeOperation = 'source-over';
}

function drawSpawns(c) {
  const T = G.time;
  for (const s of G.spawns) {
    const d = ENEMIES[s.type], k = 1 - s.t / s.max;
    const R = d.r * (2.6 - 1.6 * k);
    c.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(T * 14));
    c.strokeStyle = d.color;
    c.lineWidth = s.type === 'boss' ? 5 : 2;
    c.beginPath(); c.arc(s.x, s.y, R, 0, TAU); c.stroke();
    c.beginPath();
    c.moveTo(s.x - R * 0.5, s.y - R * 0.5); c.lineTo(s.x + R * 0.5, s.y + R * 0.5);
    c.moveTo(s.x + R * 0.5, s.y - R * 0.5); c.lineTo(s.x - R * 0.5, s.y + R * 0.5);
    c.stroke();
    if (s.type === 'boss') {
      c.beginPath(); c.arc(s.x, s.y, R * 1.6 + Math.sin(T * 8) * 10, 0, TAU); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

function drawPickups(c, v) {
  const T = G.time;
  for (const pk of G.pickups) {
    if (pk.x < v.l || pk.x > v.r || pk.y < v.t || pk.y > v.b) continue;
    if (pk.life < 3 && Math.floor(pk.life * 8) % 2 === 0) continue;
    const bob = Math.sin(pk.bob) * 3;
    if (pk.type === 'orb') {
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, pk.x, pk.y, 16, '#4dff9a', 0.8);
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(pk.x, pk.y); c.rotate(T * 3 + pk.bob);
      c.fillStyle = '#c8ffe0';
      c.beginPath(); c.moveTo(0, -5); c.lineTo(4, 0); c.lineTo(0, 5); c.lineTo(-4, 0); c.closePath(); c.fill();
      c.restore();
    } else if (pk.type === 'health') {
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, pk.x, pk.y + bob, 34, '#ff3b6b', 0.7);
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(pk.x, pk.y + bob);
      c.fillStyle = '#2a0a14'; c.strokeStyle = '#ff6b8e'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(-12, -12, 24, 24, 5); c.fill(); c.stroke();
      c.fillStyle = '#ff6b8e';
      c.fillRect(-3, -8, 6, 16); c.fillRect(-8, -3, 16, 6);
      c.restore();
    } else if (pk.type === 'weapon') {
      const w = WEAPONS[pk.weapon];
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, pk.x, pk.y + bob, 50, w.color, 0.6 + 0.2 * Math.sin(T * 5));
      c.strokeStyle = w.color; c.lineWidth = 2; c.globalAlpha = 0.5;
      c.beginPath(); c.arc(pk.x, pk.y + bob, 24, T * 2, T * 2 + Math.PI * 1.2); c.stroke();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(pk.x, pk.y + bob);
      c.fillStyle = '#16122a'; c.strokeStyle = w.color; c.lineWidth = 2.5;
      c.beginPath(); c.roundRect(-14, -14, 28, 28, 4); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(14, 0); c.moveTo(0, -14); c.lineTo(0, 14); c.stroke();
      c.restore();
      c.font = `12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.strokeText(w.name, pk.x, pk.y + bob - 28);
      c.fillStyle = w.color; c.fillText(w.name, pk.x, pk.y + bob - 28);
    }
  }
}

function drawBarrels(c, v) {
  for (const b of G.barrels) {
    if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
    const lit = b.fuse >= 0;
    c.globalCompositeOperation = 'lighter';
    drawGlow(c, b.x, b.y, b.r * 2.6, '#ff5a3b', lit ? 1 : 0.35 + 0.15 * Math.sin(b.pulse));
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = b.flash > 0 || (lit && Math.floor(G.time * 30) % 2) ? '#ffffff' : '#2a0d10';
    c.strokeStyle = '#ff5a3b'; c.lineWidth = 3;
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.arc(b.x, b.y, b.r * 0.6, 0, TAU); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#ff5a3b';
    c.beginPath(); c.moveTo(b.x, b.y - 6); c.lineTo(b.x + 5.5, b.y + 4); c.lineTo(b.x - 5.5, b.y + 4); c.closePath(); c.fill();
  }
}

function polyPath(c, n, r, rot) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i * TAU) / n;
    if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}

function drawEnemies(c, v) {
  // свечение одним проходом
  c.globalCompositeOperation = 'lighter';
  for (const e of G.enemies) {
    if (e.x < v.l || e.x > v.r || e.y < v.t || e.y > v.b) continue;
    drawGlow(c, e.x, e.y, e.r * (e.type === 'boss' ? 3.2 : 2.6), ENEMIES[e.type].color, e.type === 'boss' ? 0.8 : 0.5);
  }
  c.globalCompositeOperation = 'source-over';
  for (const e of G.enemies) {
    if (e.x < v.l || e.x > v.r || e.y < v.t || e.y > v.b) continue;
    drawEnemy(c, e);
  }
  // полоски здоровья
  for (const e of G.enemies) {
    if (e.type === 'boss' || e.hp >= e.maxHp || e.dead) continue;
    if (e.x < v.l || e.x > v.r || e.y < v.t || e.y > v.b) continue;
    const w = e.r * 2;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
    c.fillStyle = ENEMIES[e.type].color; c.fillRect(e.x - w / 2, e.y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function drawEnemy(c, e) {
  const d = ENEMIES[e.type], r = e.r;
  const white = e.flash > 0;
  const col = white ? '#ffffff' : d.color;
  const s = e.spawnT > 0 ? Math.max(0.05, 1 - e.spawnT / 0.3) : 1;
  c.save();
  c.translate(e.x, e.y);

  if (e.type === 'boss') { drawBoss(c, e, white); c.restore(); return; }

  if (e.slow > 0) {
    c.strokeStyle = 'rgba(140,220,255,0.7)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r + 6, 0, TAU); c.stroke();
  }
  let sc = s;
  if (e.type === 'bomber' && e.fuse > 0) sc *= 1 + (0.5 - e.fuse) * 0.8;
  c.rotate(e.angle);
  c.scale(sc, sc);
  c.lineWidth = 2.5;
  c.lineJoin = 'round';
  c.strokeStyle = col;
  c.fillStyle = white ? '#ffffff' : d.fill;

  switch (e.type) {
    case 'grunt':
      c.beginPath(); c.moveTo(r * 1.1, 0); c.lineTo(-r * 0.8, r * 0.8); c.lineTo(-r * 0.4, 0); c.lineTo(-r * 0.8, -r * 0.8); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(r * 0.15, 0, r * 0.22, 0, TAU); c.fill();
      break;
    case 'runner':
      c.beginPath(); c.moveTo(r * 1.4, 0); c.lineTo(-r, r * 0.75); c.lineTo(-r * 0.4, 0); c.lineTo(-r, -r * 0.75); c.closePath();
      c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.6, 0); c.lineTo(-r * 1.6, 0); c.stroke();
      break;
    case 'shooter':
      c.fillStyle = col; c.fillRect(r * 0.5, -2.5, r * 0.9, 5);
      c.fillStyle = white ? '#fff' : d.fill;
      c.beginPath(); c.moveTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.lineTo(0, -r); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.fill();
      break;
    case 'splitter':
    case 'mini':
      polyPath(c, 6, r, 0); c.fill(); c.stroke();
      c.lineWidth = 1.5; polyPath(c, 6, r * 0.55, Math.PI / 6); c.stroke();
      if (e.type === 'splitter') {
        c.beginPath();
        for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
        c.stroke();
      }
      break;
    case 'bomber': {
      const blink = e.fuse > 0 && Math.floor(G.time * 24) % 2 === 0;
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * TAU) / 16, rr = i % 2 ? r : r * 1.35;
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = blink ? '#ffffff' : white ? '#fff' : d.fill;
      c.fill(); c.stroke();
      c.fillStyle = blink ? '#ff2d2d' : col;
      c.beginPath(); c.arc(0, 0, r * (0.35 + 0.1 * Math.sin(G.time * 12)), 0, TAU); c.fill();
      break;
    }
    case 'tank':
      c.beginPath(); c.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, 6); c.fill(); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.roundRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9, 3); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.85, -r * 0.85); c.lineTo(-r * 0.45, -r * 0.45); c.moveTo(r * 0.85, -r * 0.85); c.lineTo(r * 0.45, -r * 0.45);
      c.moveTo(-r * 0.85, r * 0.85); c.lineTo(-r * 0.45, r * 0.45); c.moveTo(r * 0.85, r * 0.85); c.lineTo(r * 0.45, r * 0.45); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r * 0.18, 0, TAU); c.fill();
      break;
  }
  c.restore();
}

function drawBoss(c, e, white) {
  const r = e.r, col = white ? '#ffffff' : e.enraged ? '#ff4040' : '#ff2d95';
  if (e.bstate === 'charge' && !e.charging) {
    const a = e.chargeA;
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba('#ff2d95', 0.25 + 0.35 * Math.abs(Math.sin(G.time * 20)));
    c.lineWidth = r * 1.4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 700, Math.sin(a) * 700); c.stroke();
    c.globalCompositeOperation = 'source-over';
  }
  const s = e.spawnT > 0 ? Math.max(0.05, 1 - e.spawnT / 0.3) : 1;
  c.scale(s, s);
  c.save();
  c.rotate(e.spin2);
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16, rr = i % 2 ? r * 0.82 : r * 1.08;
    if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = white ? '#fff' : '#1c0616';
  c.strokeStyle = col; c.lineWidth = 4;
  c.fill(); c.stroke();
  c.restore();
  c.save();
  c.rotate(-e.spin2 * 1.7);
  c.lineWidth = 2.5; c.strokeStyle = col;
  polyPath(c, 6, r * 0.62, 0); c.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    c.fillStyle = col;
    c.beginPath(); c.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 4, 0, TAU); c.fill();
  }
  c.restore();
  const pulse = 1 + 0.08 * Math.sin(G.time * (e.enraged ? 14 : 6));
  c.globalCompositeOperation = 'lighter';
  drawGlow(c, 0, 0, r * 0.8 * pulse, col, 0.9);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#fff0f8';
  c.beginPath(); c.arc(0, 0, r * 0.32 * pulse, 0, TAU); c.fill();
  c.fillStyle = '#12000a';
  c.beginPath(); c.arc(Math.cos(e.angle) * r * 0.14, Math.sin(e.angle) * r * 0.14, r * 0.13, 0, TAU); c.fill();
}

function drawPlayers(c) {
  const multi = G.players.length > 1;
  for (const p of G.players) {
    if (p.dead) { if (multi) drawDowned(c, p); continue; }
    drawPlayer(c, p);
  }
  if (multi) {
    c.font = `12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)';
    for (const p of G.players) {
      if (p.dead) continue;
      c.strokeText(p.name, p.rx, p.ry - 30);
      c.fillStyle = p.color; c.fillText(p.name, p.rx, p.ry - 30);
    }
  }
}

function drawPlayer(c, p) {
  const w = WEAPONS[p.cur] || WEAPONS.blaster;
  const col = p.color;
  c.save();
  c.translate(p.rx, p.ry);
  c.globalCompositeOperation = 'lighter';
  drawGlow(c, 0, 0, 52, col, 0.55);
  c.globalCompositeOperation = 'source-over';
  if (p.invuln > 0 && !isDashing(p) && Math.floor(G.time * 20) % 2 === 0) c.globalAlpha = 0.35;
  if (p === G.me) {
    c.strokeStyle = 'rgba(77,255,154,0.06)'; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, p.magnet, 0, TAU); c.stroke();
  }
  // прицел для игроков без мыши
  if (p.ctl === 'kb2' || p.ctl === 'pad') {
    c.strokeStyle = rgba(col, 0.5); c.lineWidth = 2;
    const ax = Math.cos(p.angle) * 110, ay = Math.sin(p.angle) * 110;
    c.beginPath(); c.arc(ax, ay, 7, 0, TAU); c.stroke();
    c.setLineDash([4, 8]);
    c.beginPath(); c.moveTo(Math.cos(p.angle) * 30, Math.sin(p.angle) * 30); c.lineTo(ax * 0.9, ay * 0.9); c.stroke();
    c.setLineDash([]);
  }

  c.rotate(p.angle);
  const len = { blaster: 16, shotgun: 18, minigun: 22, plasma: 17, rocket: 22, rail: 28 }[p.cur] || 16;
  const gw = { blaster: 6, shotgun: 9, minigun: 8, plasma: 10, rocket: 10, rail: 6 }[p.cur] || 6;
  const rec = p.recoil * 5;
  c.fillStyle = '#0c1a24'; c.strokeStyle = w.color; c.lineWidth = 2;
  c.beginPath(); c.roundRect(6 - rec, -gw / 2, len + 6, gw, 2); c.fill(); c.stroke();
  c.fillStyle = p.flash > 0 ? '#ffffff' : '#07202a';
  c.strokeStyle = col; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = col;
  c.beginPath(); c.moveTo(p.r * 0.7, 0); c.lineTo(-p.r * 0.3, p.r * 0.45); c.lineTo(-p.r * 0.1, 0); c.lineTo(-p.r * 0.3, -p.r * 0.45); c.closePath(); c.fill();
  c.restore();
  c.globalAlpha = 1;

  if (isLocalPlayer(p) && p.dashCd > 0) {
    c.strokeStyle = rgba(col, 0.5); c.lineWidth = 2;
    c.beginPath(); c.arc(p.rx, p.ry, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / p.dashMax)); c.stroke();
  }
}

// упавший союзник: призрак + кольцо прогресса подъёма
function drawDowned(c, p) {
  const T = G.time;
  c.save();
  c.translate(p.rx, p.ry);
  c.globalAlpha = 0.45 + 0.2 * Math.sin(T * 6);
  c.strokeStyle = p.color; c.lineWidth = 2;
  c.setLineDash([5, 5]);
  c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 0.25;
  c.beginPath(); c.arc(0, 0, 80, 0, TAU); c.stroke();
  c.globalAlpha = 1;
  if (p.revive > 0) {
    c.strokeStyle = '#4dff9a'; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, p.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.revive / 2.5)); c.stroke();
  }
  c.font = `12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)';
  const label = p.name + ' — ПОДНИМИ!';
  c.strokeText(label, 0, -32);
  c.fillStyle = Math.floor(T * 3) % 2 ? '#ff6b8e' : p.color;
  c.fillText(label, 0, -32);
  c.restore();
}

function drawDrones(c) {
  for (const p of G.players) {
    if (p.dead || p.drones <= 0) continue;
    for (let i = 0; i < p.drones; i++) {
      const { x, y } = dronePos(p, i);
      c.globalCompositeOperation = 'lighter';
      drawGlow(c, x, y, 18, '#7dd8ff', 0.7);
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(x, y); c.rotate(G.time * 4);
      c.fillStyle = '#0a1a26'; c.strokeStyle = p.color; c.lineWidth = 2;
      polyPath(c, 3, 7, 0); c.fill(); c.stroke();
      c.restore();
    }
  }
}

function drawProjectiles(c, v) {
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  for (const b of G.bullets) {
    if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
    if (b.kind === 'plasma') {
      drawGlow(c, b.x, b.y, b.r * 4, b.color, 0.9);
      c.fillStyle = '#eafff2'; c.beginPath(); c.arc(b.x, b.y, b.r * 0.6, 0, TAU); c.fill();
    } else if (b.kind === 'rocket') {
      drawGlow(c, b.x, b.y, 26, '#ff9d3b', 0.8);
      const a = Math.atan2(b.vy, b.vx);
      c.strokeStyle = '#ffd2dc'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(b.x - Math.cos(a) * 10, b.y - Math.sin(a) * 10); c.lineTo(b.x + Math.cos(a) * 4, b.y + Math.sin(a) * 4); c.stroke();
    } else {
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      const len = Math.min(26, sp * 0.022);
      drawGlow(c, b.x, b.y, b.r * 4, b.color, 0.55);
      c.strokeStyle = b.color; c.lineWidth = b.r * 1.7;
      c.beginPath(); c.moveTo(b.x - ux * len, b.y - uy * len); c.lineTo(b.x, b.y); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = b.r * 0.6;
      c.beginPath(); c.moveTo(b.x - ux * len * 0.6, b.y - uy * len * 0.6); c.lineTo(b.x, b.y); c.stroke();
    }
  }
  for (const b of G.ebullets) {
    if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
    drawGlow(c, b.x, b.y, b.r * 3.4, b.color, 0.95);
  }
  c.globalCompositeOperation = 'source-over';
  for (const b of G.ebullets) {
    if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(b.x, b.y, b.r * 0.55, 0, TAU); c.fill();
    c.strokeStyle = b.color; c.lineWidth = 1.5;
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke();
  }
}

function drawEffects(c) {
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  for (const bm of G.beams) {
    const k = bm.life / bm.max;
    c.globalAlpha = k;
    c.strokeStyle = bm.color; c.lineWidth = bm.w * k + 2;
    c.beginPath(); c.moveTo(bm.x1, bm.y1); c.lineTo(bm.x2, bm.y2); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 3 * k + 1;
    c.beginPath(); c.moveTo(bm.x1, bm.y1); c.lineTo(bm.x2, bm.y2); c.stroke();
  }
  for (const bo of G.bolts) {
    const k = bo.life / bo.max;
    c.globalAlpha = k;
    for (const [col, w] of [['#6bb8ff', 6], ['#e6f4ff', 2]]) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      bo.pts.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y)));
      c.stroke();
    }
  }
  for (const n of G.novaFx) {
    const k = 1 - n.r / n.max;
    c.globalAlpha = Math.max(0, k);
    c.strokeStyle = n.color; c.lineWidth = 6 + 24 * k;
    c.beginPath(); c.arc(n.x, n.y, n.r, 0, TAU); c.stroke();
    c.strokeStyle = '#33ffff'; c.lineWidth = 3;
    c.beginPath(); c.arc(n.x, n.y, n.r * 0.92, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

// ---------- HUD ----------
function hudBar(c, x, y, w, h, f, col, glow) {
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(x, y, w, h);
  f = clamp(f, 0, 1);
  c.fillStyle = col;
  if (glow) { c.shadowColor = col; c.shadowBlur = 12 + 6 * Math.sin(performance.now() / 120); }
  c.fillRect(x, y, w * f, h);
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(x, y, w * f, Math.max(1, h * 0.3));
}

function hudPanel(c, x, y, w, h) {
  c.fillStyle = 'rgba(10,8,24,0.62)';
  c.strokeStyle = 'rgba(120,100,255,0.3)';
  c.lineWidth = 1;
  c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.stroke();
}

function drawHUD(c) {
  const p = G.me, T = performance.now() / 1000;
  const multi = G.players.length > 1;
  c.save();
  c.textBaseline = 'middle';

  // левая панель
  const x = 22, y = 20, w = Math.min(300, VW * 0.28);
  hudPanel(c, x - 12, y - 12, w + 24, 98);
  if (multi) { c.strokeStyle = p.color; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 4, y - 12); c.lineTo(x + 60, y - 12); c.stroke(); }
  c.font = `13px ${FONT}`;
  c.textAlign = 'left'; c.fillStyle = '#ff9ab4'; c.fillText(multi ? p.name.toUpperCase() : 'ЗДОРОВЬЕ', x, y + 3);
  c.textAlign = 'right'; c.fillStyle = '#fff'; c.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x + w, y + 3);
  hudBar(c, x, y + 13, w, 14, p.hp / p.maxHp, '#ff3b6b', p.hp < p.maxHp * 0.3);
  const ready = p.energy >= 100;
  c.textAlign = 'left';
  c.fillStyle = ready ? (Math.floor(T * 4) % 2 ? '#ffffff' : '#4dff9a') : '#8fe8b8';
  c.fillText(ready ? 'НОВА ГОТОВА — ЖМИ [F]' : 'ЭНЕРГИЯ НОВЫ', x, y + 41);  hudBar(c, x, y + 51, w, 9, p.energy / 100, '#4dff9a', ready);
  c.fillStyle = '#8fdcdc'; c.fillText('РЫВОК', x, y + 73);
  hudBar(c, x + 62, y + 70, w - 62, 6, 1 - clamp(p.dashCd / p.dashMax, 0, 1), '#33ffff', false);

  // иконки улучшений
  let ux = x - 4;
  const uy = y + 108;
  for (const u of UPGRADES) {
    const n = p.ups[u.id];
    if (!n) continue;
    c.textAlign = 'left';
    c.font = '17px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    c.fillText(u.icon, ux, uy);
    if (n > 1) { c.font = `11px ${FONT}`; c.fillStyle = '#fff'; c.fillText('×' + n, ux + 20, uy + 7); }
    ux += n > 1 ? 40 : 26;
  }

  // панели союзников
  let ty = y + 128;
  for (const q of G.players) {
    if (q === p) continue;
    drawMatePanel(c, q, x, ty, w);
    ty += 62;
  }

  // центр — волна
  c.textAlign = 'center';
  c.font = `26px ${FONT}`;
  c.fillStyle = '#fff';
  c.shadowColor = '#b46bff'; c.shadowBlur = 14;
  c.fillText(G.wave > 0 ? `ВОЛНА ${G.wave}` : 'ГОТОВЬСЯ', VW / 2, 32);
  c.shadowBlur = 0;
  c.font = `13px ${FONT}`;
  c.fillStyle = '#b9b3ff';
  let sub = '';
  if (G.waveState === 'active') sub = `Врагов осталось: ${G.remaining}`;
  else if (G.waveState === 'countdown') sub = `Следующая волна через ${Math.ceil(Math.max(0, G.waveTimer))}`;
  else if (G.waveState === 'cleared') sub = 'Волна зачищена!';
  else if (G.waveState === 'upgrade') sub = isOnline() ? `Игроки выбирают улучшения… осталось: ${G.upWaiting} (${Math.max(0, Math.ceil(G.upTimer))}с)` : 'Выбор улучшений';
  c.fillText(sub, VW / 2, 56);

  if (multi && p.dead && !(G.dying > 0)) {
    c.font = `22px ${FONT}`;
    c.fillStyle = '#ff6b8e';
    c.shadowColor = '#ff3b6b'; c.shadowBlur = 14;
    c.fillText('ТЫ ПОВЕРЖЕН', VW / 2, VH * 0.68);
    c.shadowBlur = 0;
    c.font = `14px ${FONT}`; c.fillStyle = '#d4d1f2';
    c.fillText('Союзник поднимет тебя, если постоит рядом 2.5 сек. Иначе — возрождение в начале следующей волны.', VW / 2, VH * 0.68 + 28);
  }

  // босс
  if (G.boss && !G.boss.dead) {
    const b = G.boss, bw = clamp(VW - 680, 220, 620), bx = VW / 2 - bw / 2, by = 78;
    c.font = `15px ${FONT}`;
    c.fillStyle = b.enraged ? '#ff5050' : '#ff7ad9';
    c.fillText('ОВЕРМАЙНД' + (b.enraged ? ' · ЯРОСТЬ' : ''), VW / 2, by);
    hudBar(c, bx, by + 12, bw, 14, b.hp / b.maxHp, b.enraged ? '#ff4040' : '#ff2d95', b.enraged);
    c.strokeStyle = 'rgba(255,45,149,0.6)'; c.lineWidth = 1; c.strokeRect(bx - 0.5, by + 11.5, bw + 1, 15);
  }

  // правая панель — счёт
  c.textAlign = 'right';
  c.font = `30px ${FONT}`;
  c.fillStyle = '#fff'; c.shadowColor = '#33ffff'; c.shadowBlur = 12;
  c.fillText(G.score.toLocaleString('ru-RU'), VW - 24, 36);
  c.shadowBlur = 0;
  c.font = `12px ${FONT}`; c.fillStyle = '#8a86b8';
  c.fillText('РЕКОРД ' + Math.max(G.best.score, G.score).toLocaleString('ru-RU'), VW - 24, 60);
  if (G.combo >= 2) {
    const m = comboMult(), hue = (190 + G.combo * 6) % 360;
    const col = `hsl(${hue},100%,65%)`;
    c.font = `${Math.round(18 + Math.min(10, G.combo / 5))}px ${FONT}`;
    c.fillStyle = col;
    c.fillText(`КОМБО ${G.combo} · x${m.toFixed(2)}`, VW - 24, 88);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(VW - 174, 102, 150, 4);
    c.fillStyle = col; c.fillRect(VW - 174, 102, 150 * clamp(G.comboTimer / 2.5, 0, 1), 4);
  }

  // оружие
  const n = WEAPON_ORDER.length, sw = Math.min(88, (VW - 300) / n - 6), shh = 52, gap = 6;
  const tw = n * sw + (n - 1) * gap;
  let sx = VW / 2 - tw / 2;
  const sy = VH - shh - 18;
  for (let i = 0; i < n; i++) {
    const id = WEAPON_ORDER[i], wp = WEAPONS[id];
    const owned = p.owned.includes(id), cur = p.cur === id;
    c.fillStyle = cur ? rgba(wp.color, 0.18) : 'rgba(10,8,24,0.65)';
    c.strokeStyle = cur ? wp.color : owned ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
    c.lineWidth = cur ? 2 : 1;
    if (cur) { c.shadowColor = wp.color; c.shadowBlur = 14; }
    c.beginPath(); c.roundRect(sx, sy, sw, shh, 8); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.font = `11px ${FONT}`; c.textAlign = 'left'; c.fillStyle = owned ? '#9a96c8' : '#4a4670';
    c.fillText(String(i + 1), sx + 7, sy + 11);
    c.textAlign = 'center';
    c.font = `${sw < 80 ? 10 : 12}px ${FONT}`;
    c.fillStyle = owned ? (cur ? '#fff' : '#cfcfe8') : 'rgba(255,255,255,0.18)';
    c.fillText(owned ? wp.short : '???', sx + sw / 2, sy + 22);
    if (owned) {
      const a = p.ammo[id], max = maxAmmo(p, id);
      c.font = `13px ${FONT}`;
      c.fillStyle = a === Infinity ? wp.color : a < max * 0.2 ? '#ff3b6b' : wp.color;
      c.fillText(a === Infinity ? '∞' : String(a), sx + sw / 2, sy + 39);
      if (a !== Infinity) { c.fillStyle = rgba(wp.color, 0.5); c.fillRect(sx + 6, sy + shh - 5, (sw - 12) * Math.min(1, a / max), 2); }
    }
    sx += sw + gap;
  }

  drawMinimap(c);
  drawBanner(c);
  c.restore();
}

function drawMatePanel(c, q, x, y, w) {
  hudPanel(c, x - 12, y - 8, w + 24, 54);
  c.strokeStyle = q.color; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - 4, y - 8); c.lineTo(x + 40, y - 8); c.stroke();
  c.textAlign = 'left'; c.font = `12px ${FONT}`;
  c.fillStyle = q.color;
  c.fillText(q.name, x, y + 4);
  const wp = WEAPONS[q.cur] || WEAPONS.blaster, a = q.ammo[q.cur];
  c.textAlign = 'right';
  c.fillStyle = q.dead ? '#ff6b8e' : wp.color;
  c.fillText(q.dead ? (q.revive > 0 ? 'ПОДНИМАЮТ…' : 'ПОВЕРЖЕН') : `${wp.short} ${a === Infinity || a === undefined ? '∞' : a}`, x + w, y + 4);
  hudBar(c, x, y + 14, w, 9, q.dead ? q.revive / 2.5 : q.hp / q.maxHp, q.dead ? '#4dff9a' : '#ff3b6b', false);
  hudBar(c, x, y + 28, w, 5, q.energy / 100, '#4dff9a', q.energy >= 100);
  if (q.ctl === 'kb2' || q.ctl === 'pad') {
    c.textAlign = 'left'; c.font = `10px ${FONT}`; c.fillStyle = '#8a86b8';
    c.fillText(q.ctl === 'pad' ? (getPad() ? 'геймпад' : 'геймпад не найден — нажми кнопку') : 'стрелки · / огонь · Enter нова', x, y + 42);
  }
}

function drawMinimap(c) {
  const mw = Math.min(200, VW * 0.16), mh = (mw * G.H) / G.W;
  const mx = VW - mw - 18, my = VH - mh - 18, s = mw / G.W;
  hudPanel(c, mx - 4, my - 4, mw + 8, mh + 8);
  c.fillStyle = 'rgba(138,123,255,0.5)';
  for (const w of G.walls) c.fillRect(mx + w.x * s, my + w.y * s, Math.max(1, w.w * s), Math.max(1, w.h * s));
  c.fillStyle = '#ff5a3b';
  for (const b of G.barrels) c.fillRect(mx + b.x * s - 1, my + b.y * s - 1, 2, 2);
  for (const pk of G.pickups) {
    if (pk.type === 'orb') continue;
    c.fillStyle = pk.type === 'weapon' ? WEAPONS[pk.weapon].color : '#ff6b8e';
    c.fillRect(mx + pk.x * s - 2, my + pk.y * s - 2, 4, 4);
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    c.fillStyle = ENEMIES[e.type].color;
    const r = e.type === 'boss' ? 5 : 1.6;
    c.beginPath(); c.arc(mx + e.x * s, my + e.y * s, r, 0, TAU); c.fill();
  }
  for (const p of G.players) {
    c.fillStyle = p.color;
    c.globalAlpha = p.dead ? 0.4 + 0.4 * Math.sin(performance.now() / 150) : 1;
    c.beginPath(); c.arc(mx + p.rx * s, my + p.ry * s, p === G.me ? 3.5 : 3, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  const v = G.view;
  c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
  const l = clamp(v.l + 60, 0, G.W), t = clamp(v.t + 60, 0, G.H), r = clamp(v.r - 60, 0, G.W), b = clamp(v.b - 60, 0, G.H);
  c.strokeRect(mx + l * s, my + t * s, (r - l) * s, (b - t) * s);
}

function drawBanner(c) {
  const b = G.banner;
  if (!b) return;
  const el = b.max - b.t;
  const a = clamp(Math.min(el * 4, b.t * 2), 0, 1);
  const sc = 1 + Math.max(0, 0.25 - el) * 2;
  c.save();
  c.globalAlpha = a;
  c.translate(VW / 2, VH * 0.3);
  c.scale(sc, sc);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${Math.round(Math.min(72, VW / 11))}px ${FONT}`;
  c.fillStyle = '#fff';
  c.shadowColor = b.color; c.shadowBlur = 30;
  c.fillText(b.title, 0, 0);
  if (b.sub) {
    c.font = `${Math.round(Math.min(20, VW / 40))}px ${FONT}`;
    c.shadowBlur = 10;
    c.fillStyle = b.color;
    c.fillText(b.sub, 0, 52);
  }
  c.restore();
}

function drawIndicators(c) {
  const items = [];
  for (const pk of G.pickups) if (pk.type === 'weapon') items.push({ x: pk.x, y: pk.y, color: WEAPONS[pk.weapon].color, s: 9 });
  if (G.boss && !G.boss.dead) items.push({ x: G.boss.x, y: G.boss.y, color: '#ff2d95', s: 14 });
  for (const p of G.players) if (p !== G.me) items.push({ x: p.rx, y: p.ry, color: p.dead ? '#ff6b8e' : p.color, s: p.dead ? 12 : 8 });
  const m = 44, Z = G.zoom || ZOOM;
  for (const it of items) {
    const sx = (it.x - G.camX) * Z + VW / 2, sy = (it.y - G.camY) * Z + VH / 2;
    if (sx > m && sx < VW - m && sy > m && sy < VH - m) continue;
    const cx = clamp(sx, m, VW - m), cy = clamp(sy, m + 70, VH - m - 70);
    const a = Math.atan2(sy - VH / 2, sx - VW / 2);
    c.save();
    c.translate(cx, cy); c.rotate(a);
    c.fillStyle = it.color; c.shadowColor = it.color; c.shadowBlur = 12;
    c.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    c.beginPath(); c.moveTo(it.s, 0); c.lineTo(-it.s * 0.7, it.s * 0.7); c.lineTo(-it.s * 0.3, 0); c.lineTo(-it.s * 0.7, -it.s * 0.7); c.closePath(); c.fill();
    c.restore();
  }
}

function drawCrosshair(c) {
  const x = input.mx, y = input.my, p = G.me, w = WEAPONS[p.cur] || WEAPONS.blaster;
  const gap = 7 + p.recoil * 9;
  c.save();
  c.strokeStyle = w.color; c.lineWidth = 2;
  c.shadowColor = w.color; c.shadowBlur = 8;
  c.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    c.moveTo(x + Math.cos(a) * gap, y + Math.sin(a) * gap);
    c.lineTo(x + Math.cos(a) * (gap + 8), y + Math.sin(a) * (gap + 8));
  }
  c.stroke();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill();
  c.restore();
}
