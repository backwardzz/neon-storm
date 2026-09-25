'use strict';
// Весь звук синтезируется через WebAudio — никаких файлов.
const SFX = (() => {
  let ac = null, master, sfx, mus, noiseBuf;
  let muted = false;
  try { muted = localStorage.getItem('ns_muted') === '1'; } catch (e) {}
  let musicLevel = 0, timer = null, nextT = 0, step = 0;
  const last = Object.create(null);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(master);
    sfx = ac.createGain(); sfx.gain.value = 0.55; sfx.connect(comp);
    mus = ac.createGain(); mus.gain.value = 0.28; mus.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (musicLevel > 0) music(musicLevel);
  }

  function env(g, t, vol, a, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(o) {
    if (!ac) return;
    const t = (o.at !== undefined ? o.at : ac.currentTime) + (o.t || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    let node = osc;
    if (o.lp) {
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = o.lp;
      osc.connect(fl); node = fl;
    }
    node.connect(g); g.connect(o.dest || sfx);
    env(g, t, o.vol || 0.2, o.a || 0.004, o.dur);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  function noise(o) {
    if (!ac) return;
    const t = (o.at !== undefined ? o.at : ac.currentTime) + (o.t || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const fl = ac.createBiquadFilter();
    fl.type = o.ft || 'lowpass';
    fl.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    fl.Q.value = o.q || 0.7;
    const g = ac.createGain();
    src.connect(fl); fl.connect(g); g.connect(o.dest || sfx);
    env(g, t, o.vol || 0.2, o.a || 0.003, o.dur);
    src.start(t, Math.random() * 0.6); src.stop(t + o.dur + 0.05);
  }

  function throttle(name, ms) {
    const n = performance.now();
    if (last[name] && n - last[name] < ms) return false;
    last[name] = n; return true;
  }

  const S = {
    blaster() { if (!throttle('bl', 40)) return; tone({ type: 'square', f: 880, f2: 240, dur: 0.08, vol: 0.09 }); },
    shotgun() { noise({ dur: 0.28, vol: 0.5, f: 3000, f2: 250 }); tone({ type: 'sawtooth', f: 170, f2: 45, dur: 0.18, vol: 0.28 }); },
    minigun() { if (!throttle('mg', 45)) return; tone({ type: 'sawtooth', f: 520, f2: 180, dur: 0.05, vol: 0.07 }); noise({ dur: 0.04, vol: 0.1, ft: 'highpass', f: 3000 }); },
    rail() { tone({ type: 'sawtooth', f: 2400, f2: 70, dur: 0.55, vol: 0.22 }); tone({ type: 'sine', f: 140, f2: 35, dur: 0.45, vol: 0.45 }); noise({ dur: 0.3, vol: 0.2, ft: 'highpass', f: 5000, f2: 800 }); },
    rocket() { noise({ dur: 0.4, vol: 0.32, ft: 'bandpass', f: 900, f2: 180, q: 1.5 }); tone({ type: 'triangle', f: 300, f2: 90, dur: 0.25, vol: 0.12 }); },
    plasma() { tone({ type: 'sine', f: 280, f2: 950, dur: 0.16, vol: 0.2 }); tone({ type: 'triangle', f: 560, f2: 1300, dur: 0.12, vol: 0.08 }); },
    enemyShoot() { if (!throttle('es', 70)) return; tone({ type: 'triangle', f: 520, f2: 240, dur: 0.13, vol: 0.09 }); },
    hit() { if (!throttle('hit', 35)) return; tone({ type: 'square', f: 280 + Math.random() * 120, f2: 90, dur: 0.05, vol: 0.06 }); },
    kill() { if (!throttle('kill', 40)) return; noise({ dur: 0.16, vol: 0.22, f: 3200, f2: 350 }); tone({ type: 'square', f: 240, f2: 55, dur: 0.13, vol: 0.1 }); },
    explosion() { if (!throttle('ex', 60)) return; noise({ dur: 0.8, vol: 0.7, f: 2000, f2: 50 }); tone({ type: 'sine', f: 95, f2: 28, dur: 0.55, vol: 0.6 }); },
    hurt() { tone({ type: 'sawtooth', f: 220, f2: 55, dur: 0.28, vol: 0.3 }); noise({ dur: 0.15, vol: 0.22, f: 1300 }); },
    pickup() { tone({ type: 'square', f: 660, dur: 0.06, vol: 0.1 }); tone({ type: 'square', f: 990, dur: 0.09, vol: 0.1, t: 0.05 }); },
    heal() { [523, 784, 1047].forEach((f, i) => tone({ type: 'sine', f, dur: 0.12, vol: 0.14, t: i * 0.05 })); },
    orb() { if (!throttle('orb', 28)) return; tone({ type: 'sine', f: 1100 + Math.random() * 500, dur: 0.05, vol: 0.05 }); },
    weapon() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, dur: 0.09, vol: 0.09, t: i * 0.055 })); },
    dash() { noise({ dur: 0.22, vol: 0.3, ft: 'bandpass', f: 500, f2: 3500, q: 2 }); },
    nova() { tone({ type: 'sawtooth', f: 60, f2: 900, dur: 0.6, vol: 0.28 }); noise({ dur: 1.3, vol: 0.6, f: 5000, f2: 90 }); tone({ type: 'sine', f: 55, f2: 20, dur: 1.1, vol: 0.7 }); },
    ready() { [784, 1175].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.15, vol: 0.14, t: i * 0.09 })); },
    upgrade() { [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.18, vol: 0.14, t: i * 0.07 })); },
    waveStart() { tone({ type: 'sawtooth', f: 110, f2: 220, dur: 0.7, vol: 0.18, lp: 1200 }); tone({ type: 'sawtooth', f: 165, f2: 330, dur: 0.7, vol: 0.12, lp: 1200 }); },
    bossWarn() { for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', f: 160, f2: 95, dur: 0.45, vol: 0.28, t: i * 0.55, lp: 900 }); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.45, vol: 0.25, t: i * 0.28 })); },
    click() { tone({ type: 'square', f: 1000, dur: 0.03, vol: 0.06 }); },
    arm() { tone({ type: 'square', f: 1500, dur: 0.05, vol: 0.08 }); tone({ type: 'square', f: 1500, dur: 0.05, vol: 0.08, t: 0.12 }); },
    chain() { if (!throttle('ch', 60)) return; noise({ dur: 0.12, vol: 0.2, ft: 'highpass', f: 4000 }); tone({ type: 'sawtooth', f: 1600, f2: 400, dur: 0.1, vol: 0.07 }); },
    bounce() { if (!throttle('bo', 50)) return; tone({ type: 'sine', f: 900, f2: 500, dur: 0.06, vol: 0.06 }); },
    slam() { noise({ dur: 0.5, vol: 0.5, f: 800, f2: 60 }); tone({ type: 'sine', f: 70, f2: 25, dur: 0.4, vol: 0.6 }); },
  };

  // ---------- процедурная музыка (синтвейв) ----------
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]; // Am F C G
  const BOSS = [[50, 53, 57, 62], [50, 53, 57, 62], [46, 50, 53, 58], [48, 52, 55, 60]]; // Dm Dm Bb C

  function playStep(s, t, spb) {
    const i = s % 16, bar = Math.floor(s / 16) % 4;
    const boss = musicLevel >= 2, full = musicLevel >= 1;
    const ch = (boss ? BOSS : PROG)[bar];
    if (full) {
      if (i % 4 === 0) tone({ at: t, type: 'sine', f: 160, f2: 40, dur: 0.2, vol: 0.55, dest: mus });
      if (i === 4 || i === 12) noise({ at: t, ft: 'bandpass', f: 1800, dur: 0.14, vol: 0.2, dest: mus, q: 0.8 });
      if (i % 2 === 1) noise({ at: t, ft: 'highpass', f: 7000, dur: 0.035, vol: boss ? 0.09 : 0.06, dest: mus });
    }
    if (i % 2 === 0) {
      const root = ch[0] - 24 + (i % 8 === 6 ? 12 : 0);
      tone({ at: t, type: 'sawtooth', f: mtof(root), dur: spb * 1.8, vol: full ? 0.15 : 0.07, lp: full ? 700 : 380, dest: mus });
    }
    const arp = ch[(i * (boss ? 3 : 1)) % 4] + 12;
    if (full || i % 2 === 0) tone({ at: t, type: 'square', f: mtof(arp), dur: spb * 0.9, vol: 0.03, lp: 2800, dest: mus });
    if (i === 0) for (const n of ch.slice(0, 3)) tone({ at: t, type: 'triangle', f: mtof(n), dur: spb * 16, vol: 0.028, a: 0.4, dest: mus });
  }

  function sched() {
    if (!ac) return;
    const spb = 60 / (musicLevel >= 2 ? 134 : 112) / 4;
    if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT, spb); nextT += spb; step++; }
  }

  function music(level) {
    musicLevel = level;
    if (!ac) return;
    if (level <= 0) { if (timer) { clearInterval(timer); timer = null; } return; }
    if (!timer) { nextT = ac.currentTime + 0.08; step = 0; timer = setInterval(sched, 25); }
  }

  return {
    init,
    music,
    play(name) { if (!ac || muted) return; const f = S[name]; if (f) f(); },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('ns_muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    get muted() { return muted; },
  };
})();
