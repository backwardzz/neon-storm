'use strict';
// ---------- свечение ----------
const GlowCache = Object.create(null);
function glowSprite(color) {
  let s = GlowCache[color];
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 128;
  const c = s.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(color, 0.9));
  g.addColorStop(0.22, rgba(color, 0.38));
  g.addColorStop(0.55, rgba(color, 0.1));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  GlowCache[color] = s;
  return s;
}
// вызывать при globalCompositeOperation = 'lighter'
function drawGlow(c, x, y, rad, color, alpha = 1) {
  if (alpha <= 0 || rad <= 0) return;
  const s = glowSprite(color);
  if (alpha !== 1) c.globalAlpha = alpha;
  c.drawImage(s, x - rad, y - rad, rad * 2, rad * 2);
  if (alpha !== 1) c.globalAlpha = 1;
}

// ---------- частицы и всплывающий текст ----------
const FX = {
  parts: [],
  texts: [],
  max: 1600,      // лимиты снижаются автоматически на слабом железе
  maxTexts: 70,

  add(p) {
    if (this.parts.length >= this.max) return;
    p.max = p.life;
    if (p.drag === undefined) p.drag = 3;
    this.parts.push(p);
  },

  spark(x, y, color, n, spd, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + rand(-o.spread, o.spread) : rand(0, TAU);
      const s = rand(spd * 0.25, spd);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.45) * (o.life || 1), size: o.size || 2, color, drag: o.drag || 5 });
    }
  },

  dots(x, y, color, n, spd, size, life) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0, spd);
      this.add({ type: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), size: rand(size * 0.5, size), color, drag: 3 });
    }
  },

  ring(x, y, color, r0, r1, life, width) {
    this.add({ type: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, width: width || 3, color, drag: 0 });
  },

  smoke(x, y, n, size, color) {
    for (let i = 0; i < n; i++) {
      this.add({ type: 'smoke', x: x + rand(-size, size) * 0.4, y: y + rand(-size, size) * 0.4, vx: rand(-50, 50), vy: rand(-50, 50), life: rand(0.5, 1.1), size: rand(size * 0.5, size), grow: size * 0.9, color: color || '#241a3a', drag: 2 });
    }
  },

  shards(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      this.add({ type: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), size: rand(3, 7), rot: rand(0, TAU), vr: rand(-12, 12), color, drag: 4 });
    }
  },

  muzzle(x, y, a, color) {
    this.add({ type: 'dot', x, y, vx: 0, vy: 0, life: 0.06, size: 24, color, drag: 0 });
    this.spark(x, y, color, 3, 320, { angle: a, spread: 0.35, life: 0.5 });
  },

  text(x, y, str, color, size, pop) {
    if (this.texts.length > this.maxTexts) this.texts.shift();
    this.texts.push({ x, y, str: String(str), color, size: size || 14, life: 0.85, max: 0.85, vy: -70, pop: !!pop });
  },

  clear() { this.parts.length = 0; this.texts.length = 0; },

  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { removeAt(P, i); continue; }
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    const T = this.texts;
    for (let i = T.length - 1; i >= 0; i--) {
      const t = T[i];
      t.life -= dt;
      if (t.life <= 0) { T.splice(i, 1); continue; }
      t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt);
    }
  },

  draw(c, v) {
    const P = this.parts;
    // дым — обычное смешивание
    c.globalCompositeOperation = 'source-over';
    for (const p of P) {
      if (p.type !== 'smoke' && p.type !== 'shard') continue;
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      const k = p.life / p.max;
      if (p.type === 'smoke') {
        c.globalAlpha = k * 0.45;
        c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
      } else {
        c.globalAlpha = Math.min(1, k * 2);
        c.fillStyle = p.color;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        c.restore();
      }
    }
    // остальное — аддитивное свечение
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    // искры группируются по цвету/толщине/прозрачности и рисуются одним stroke на группу
    const groups = this._groups || (this._groups = new Map());
    for (const g of groups.values()) g.length = 0;
    for (const p of P) {
      if (p.type === 'smoke' || p.type === 'shard') continue;
      if (p.x < v.l - 200 || p.x > v.r + 200 || p.y < v.t - 200 || p.y > v.b + 200) continue;
      const k = p.life / p.max;
      switch (p.type) {
        case 'spark': {
          const key = p.color + '|' + p.size + '|' + Math.ceil(k * 4);
          let g = groups.get(key);
          if (!g) { g = []; groups.set(key, g); }
          g.push(p);
          break;
        }
        case 'dot':
          drawGlow(c, p.x, p.y, p.size * (0.4 + k * 0.6), p.color, k);
          break;
        case 'ring': {
          const e = 1 - Math.pow(k, 2);
          c.globalAlpha = k;
          c.strokeStyle = p.color;
          c.lineWidth = Math.max(0.5, p.width * k);
          c.beginPath(); c.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, TAU); c.stroke();
          break;
        }
        case 'ghost':
          c.globalAlpha = k * 0.5;
          c.strokeStyle = p.color;
          c.lineWidth = 2;
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.stroke();
          break;
      }
    }
    for (const [key, g] of groups) {
      if (!g.length) continue;
      const parts = key.split('|');
      c.strokeStyle = parts[0];
      c.lineWidth = +parts[1];
      c.globalAlpha = +parts[2] / 4;
      c.beginPath();
      for (const p of g) { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  },

  drawTexts(c) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let font = '';
    for (const t of this.texts) {
      const k = t.life / t.max;
      c.globalAlpha = Math.min(1, k * 2.5);
      const s = t.pop ? t.size * (1 + Math.max(0, k - 0.7) * 2.5) : t.size;
      const f = `${Math.round(s)}px ${FONT}`;
      if (f !== font) { c.font = f; font = f; }
      // дешёвая тень вместо strokeText
      c.fillStyle = 'rgba(0,0,0,0.85)';
      c.fillText(t.str, t.x + 1.5, t.y + 1.5);
      c.fillStyle = t.color;
      c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;
  },
};

// ---------- следы на полу ----------
// Пол разбит на плитки в половинном разрешении: при каждом убийстве
// в видеокарту перезаливается только одна маленькая плитка, а не вся арена.
const Decals = {
  T: 256, S: 0.5, tiles: [], cols: 0, rows: 0,
  init(w, h) {
    this.cols = Math.ceil((w * this.S) / this.T);
    this.rows = Math.ceil((h * this.S) / this.T);
    this.tiles = [];
    for (let i = 0; i < this.cols * this.rows; i++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = this.T;
      this.tiles.push({ cv, c: cv.getContext('2d'), used: false });
    }
  },
  clear() { for (const t of this.tiles) { if (t.used) t.c.clearRect(0, 0, this.T, this.T); t.used = false; } },
  // вызывает fn(ctx) для каждой плитки, задетой кругом (x, y, r), с мировой системой координат
  paint(x, y, r, fn) {
    const span = this.T / this.S;
    const c0 = Math.max(0, Math.floor((x - r) / span)), c1 = Math.min(this.cols - 1, Math.floor((x + r) / span));
    const r0 = Math.max(0, Math.floor((y - r) / span)), r1 = Math.min(this.rows - 1, Math.floor((y + r) / span));
    for (let ty = r0; ty <= r1; ty++) {
      for (let tx = c0; tx <= c1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        t.c.setTransform(this.S, 0, 0, this.S, -tx * this.T, -ty * this.T);
        fn(t.c);
        t.used = true;
      }
    }
  },
  splat(x, y, color, r) {
    const blobs = [];
    for (let i = 0; i < 5; i++) blobs.push([x + rand(-r, r) * 0.7, y + rand(-r, r) * 0.7, rand(r * 0.2, r * 0.6), +rand(0.07, 0.16).toFixed(2)]);
    for (let i = 0; i < 4; i++) { const a = rand(0, TAU), d = rand(r, r * 2.4); blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d, rand(2, 4.5), 0.2]); }
    this.paint(x, y, r * 2.6, (c) => {
      for (const b of blobs) {
        c.fillStyle = rgba(color, b[3]);
        c.beginPath(); c.arc(b[0], b[1], b[2], 0, TAU); c.fill();
      }
    });
  },
  scorch(x, y, r) {
    this.paint(x, y, r, (c) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(0.5, 'rgba(40,10,20,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    });
  },
  fade() {
    for (const t of this.tiles) {
      if (!t.used) continue;
      const c = t.c;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.1)';
      c.fillRect(0, 0, this.T, this.T);
      c.globalCompositeOperation = 'source-over';
    }
  },
  draw(c, v) {
    const span = this.T / this.S;
    const c0 = Math.max(0, Math.floor(v.l / span)), c1 = Math.min(this.cols - 1, Math.floor(v.r / span));
    const r0 = Math.max(0, Math.floor(v.t / span)), r1 = Math.min(this.rows - 1, Math.floor(v.b / span));
    for (let ty = r0; ty <= r1; ty++) {
      for (let tx = c0; tx <= c1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (t.used) c.drawImage(t.cv, tx * span, ty * span, span, span);
      }
    }
  },
};
