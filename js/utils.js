'use strict';
// ---------- математика и общие хелперы ----------
const TAU = Math.PI * 2;
const FONT = '"Russo One", "Exo 2", sans-serif';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }

// быстрое удаление без сохранения порядка
function removeAt(arr, i) { arr[i] = arr[arr.length - 1]; arr.pop(); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function weighted(list, key = 'w') {
  let total = 0;
  for (const it of list) total += it[key];
  let r = Math.random() * total;
  for (const it of list) { r -= it[key]; if (r <= 0) return it; }
  return list[list.length - 1];
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const _rgbaCache = Object.create(null);
function rgba(hex, a) {
  const key = hex + '|' + a;
  let s = _rgbaCache[key];
  if (!s) {
    const [r, g, b] = hexToRgb(hex);
    s = _rgbaCache[key] = `rgba(${r},${g},${b},${a})`;
  }
  return s;
}

// ---------- коллизии ----------
// выталкивает круг o (x,y) радиуса r из прямоугольника w; true если было касание
function resolveCircleRect(o, r, w) {
  const nx = clamp(o.x, w.x, w.x + w.w), ny = clamp(o.y, w.y, w.y + w.h);
  const dx = o.x - nx, dy = o.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2), p = r - d;
    o.x += (dx / d) * p; o.y += (dy / d) * p;
  } else {
    const l = o.x - w.x, rr = w.x + w.w - o.x, t = o.y - w.y, b = w.y + w.h - o.y;
    const m = Math.min(l, rr, t, b);
    if (m === l) o.x = w.x - r;
    else if (m === rr) o.x = w.x + w.w + r;
    else if (m === t) o.y = w.y - r;
    else o.y = w.y + w.h + r;
  }
  return true;
}

function pushOutCircle(o, r, b) {
  const dx = o.x - b.x, dy = o.y - b.y, rr = r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 < rr * rr && d2 > 0.0001) {
    const d = Math.sqrt(d2);
    o.x = b.x + (dx / d) * rr; o.y = b.y + (dy / d) * rr;
    return true;
  }
  return false;
}

function pointInRect(x, y, w, pad = 0) {
  return x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad;
}

// отрезок vs круг: параметр t [0..1] первого пересечения или -1
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return fx * fx + fy * fy <= r * r ? 0 : -1;
  const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a);
  if (t1 <= 1 && t2 >= 0) return Math.max(0, t1);
  return -1;
}

// отрезок vs прямоугольник (Лианг-Барски): t входа или -1
function segRect(x1, y1, x2, y2, w) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return -1; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; }
      else { if (t < t0) return -1; if (t < t1) t1 = t; }
    }
  }
  return t0;
}
