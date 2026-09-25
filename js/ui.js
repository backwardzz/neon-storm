'use strict';
const UI = {
  $(id) { return document.getElementById(id); },

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    document.body.classList.toggle('ingame', id === null);
    if (id === 'menu') this.updateBest();
    if (id === 'missions') this.showMissions();
    if (id === 'paused') this.$('pauseNote').style.display = isOnline() ? 'block' : 'none';
    if (id === 'online') { this.$('netStatus').textContent = ''; this.$('netStatus').classList.remove('err'); }
  },

  updateBest() {
    this.$('bestScore').textContent = G.best.score.toLocaleString('ru-RU');
    this.$('bestWave').textContent = G.best.wave;
    this.$('menuStars').textContent = Meta.stars() + ' ★ · ' + Meta.rank().name;
  },

  updateMute() {
    const t = SFX.muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ';
    for (const b of document.querySelectorAll('.mute-btn')) b.textContent = t;
  },

  showUpgrades(list, p, who) {
    this.$('upTitle').textContent = who ? `${who} · ВЫБЕРИ УЛУЧШЕНИЕ` : 'ВЫБЕРИ УЛУЧШЕНИЕ';
    this.$('upTitle').style.setProperty('--pc', p.color);
    this.$('upHint').textContent = p.ctl === 'pad'
      ? 'Геймпад: X · A · B — карточки 1 · 2 · 3'
      : isOnline() ? 'Кликни или нажми 1 · 2 · 3 (игра не останавливается!)' : 'Кликни по карточке или нажми 1 · 2 · 3';
    const box = this.$('cards');
    box.innerHTML = '';
    list.forEach((u, i) => {
      const lvl = p.ups[u.id] || 0;
      const el = document.createElement('button');
      el.className = 'card ' + u.rarity;
      el.style.animationDelay = i * 0.08 + 's';
      el.innerHTML =
        `<span class="key">${i + 1}</span>` +
        `<span class="icon">${u.icon}</span>` +
        `<span class="name">${u.name}</span>` +
        `<span class="desc">${u.desc}</span>` +
        `<span class="lvl">${RARITY[u.rarity].label} · ур. ${lvl + 1}/${u.max}</span>`;
      el.addEventListener('click', () => pickUpgrade(u));
      box.appendChild(el);
    });
  },

  showGameOver(s, res) {
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    const rows = [
      ['Счёт', s.score.toLocaleString('ru-RU')],
      ['Волна', s.wave],
      ['Убийств', s.kills],
      ['Макс. комбо', s.combo],
      ['Время', `${mm}:${String(ss).padStart(2, '0')}`],
      ['Точность', s.acc + '%'],
      ['Урон', s.dmg.toLocaleString('ru-RU')],
    ];
    this.$('goTitle').textContent = G.players.length > 1 ? 'КОМАНДА ПАЛА' : 'ТЫ ПАЛ';
    this.$('goStats').innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    this.$('newRecord').style.display = s.record ? 'block' : 'none';
    const ach = this.$('goAch');
    const fresh = (res && res.fresh) || [], skins = (res && res.skins) || [];
    ach.innerHTML = fresh.length || skins.length
      ? '<div class="ach-title">НОВЫЕ ДОСТИЖЕНИЯ</div>' +
        fresh.map((a) => `<div class="ach-item"><span>${a.icon}</span><b>${a.name}</b><em>${a.desc}</em><i>+1 ★</i></div>`).join('') +
        skins.map((k) => `<div class="ach-item ach-skin"><span class="swatch" style="--sc:${k.color === 'rainbow' ? '#ff4dd2' : k.color}"></span><b>Открыт скин «${k.name}»</b><em>Выбери его в «Миссии и скины»</em></div>`).join('')
      : '';
    const client = G.mode === 'client';
    this.$('btnRetry').style.display = client ? 'none' : '';
    this.$('goHint').textContent = client ? 'Ждём, пока хост начнёт заново…' : G.mode === 'host' ? 'Enter — новая игра для всей команды' : 'Enter — начать заново';
  },

  // ---------- локальный кооп ----------
  padStatus() {
    const el = this.$('padStatus');
    if (!el) return;
    const gp = getPad();
    el.textContent = gp ? '🎮 Геймпад подключён: ' + gp.id.slice(0, 40) : '🎮 Геймпад не найден — подключи и нажми любую кнопку';
    el.classList.toggle('ok', !!gp);
  },

  // ---------- онлайн ----------
  netStatus(msg, err) {
    const el = this.$('netStatus');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    if (G.state === 'lobby' && err) setState('online');
  },

  showLobby() {
    const host = Net.role === 'host';
    const lan = Net.transport === 'lan';
    this.$('lobbyCode').textContent = lan ? Net.lanUrl().replace(/^https?:\/\//, '') : Net.code;
    this.$('lobbyCode').classList.toggle('addr', lan);
    this.$('codeLabel').textContent = lan ? 'АДРЕС' : 'КОД';
    this.$('lobbyList').innerHTML = Net.lobby.map((l) =>
      `<li style="--pc:${skinColor(l.skin, l.id)}"><span class="dot"></span>${escapeHtml(l.name)}${l.id === 0 ? ' <em>хост</em>' : ''}${l.id === (host ? 0 : Net.myId) ? ' <em>ты</em>' : ''}</li>`).join('');
    for (let i = Net.lobby.length; i < NET_MAX_PLAYERS; i++) this.$('lobbyList').innerHTML += '<li class="empty">свободное место</li>';
    this.$('btnStart').style.display = host ? '' : 'none';
    this.$('lobbyWait').style.display = host ? 'none' : '';
    this.$('lobbyHint').textContent = !host ? 'Ждём, пока хост начнёт игру…'
      : lan ? 'На других ноутбуках открой этот адрес в браузере → «Онлайн / Wi-Fi» → «Войти» в блоке Wi-Fi.'
        : 'Отправь код друзьям — они выбирают «Онлайн → Войти». Можно начать и одному.';
  },

  updateLan() {
    const on = !!Net.lan;
    this.$('lanOn').style.display = on ? '' : 'none';
    this.$('lanOff').style.display = on ? 'none' : '';
    if (on) this.$('lanAddr').textContent = Net.lanUrl().replace(/^https?:\/\//, '');
  },

  playerName() {
    const v = this.$('nameInput').value.trim().slice(0, 14) || 'Игрок';
    try { localStorage.setItem('ns_name', v); } catch (e) {}
    return v;
  },

  showMissions() {
    const stars = Meta.stars(), rank = Meta.rank(), next = Meta.nextRank();
    this.$('rankName').textContent = rank.name;
    this.$('starCount').textContent = stars;
    this.$('starTotal').textContent = ACHIEVEMENTS.length;
    this.$('rankNext').textContent = next ? `до звания «${next.name}» — ${next.stars - stars} ★` : 'высшее звание!';
    this.$('skinList').innerHTML = SKINS.map((s) => {
      const open = Meta.skinUnlocked(s), cur = Meta.data.skin === s.id;
      const col = s.color === 'rainbow' ? '' : `--sc:${s.color}`;
      return `<button class="skin ${open ? '' : 'locked'} ${cur ? 'cur' : ''} ${s.color === 'rainbow' ? 'rainbow' : ''}" data-skin="${s.id}" style="${col}">
        <span class="swatch"></span><b>${s.name}</b><em>${open ? (cur ? 'выбран' : 'выбрать') : '🔒 ' + s.stars + ' ★'}</em></button>`;
    }).join('');
    for (const b of this.$('skinList').querySelectorAll('.skin:not(.locked)')) {
      b.addEventListener('click', () => { SFX.play('click'); Meta.setSkin(b.dataset.skin); this.showMissions(); });
    }
    const d = Meta.data;
    this.$('missionList').innerHTML = ACHIEVEMENTS.map((a) => {
      const done = d.done.includes(a.id);
      const v = Math.min(a.goal, a.get(d));
      return `<div class="mission ${done ? 'done' : ''}">
        <span class="m-icon">${a.icon}</span>
        <div class="m-body"><b>${a.name}</b><em>${a.desc}</em>
          <div class="m-bar"><i style="width:${done ? 100 : (v / a.goal) * 100}%"></i></div></div>
        <span class="m-val">${done ? '★' : v.toLocaleString('ru-RU') + '/' + a.goal.toLocaleString('ru-RU')}</span></div>`;
    }).join('');
  },

  tick() {
    if (G.state === 'localSetup') this.padStatus();
  },

  bind() {
    const click = (id, fn) => this.$(id).addEventListener('click', () => { SFX.init(); SFX.play('click'); fn(); });
    click('btnPlay', startSolo);
    click('btnLocal', () => setState('localSetup'));
    click('btnMissions', () => setState('missions'));
    click('btnMissionsBack', () => setState('menu'));
    click('btnOnline', () => setState('online'));
    click('btnP2kb', () => startLocal('kb2'));
    click('btnP2pad', () => startLocal('pad'));
    click('btnLocalBack', () => setState('menu'));
    click('btnCreate', () => Net.create(this.playerName()));
    click('btnJoin', () => Net.join(this.$('codeInput').value, this.playerName()));
    click('btnOnlineBack', () => { Net.leave(); setState('menu'); });
    click('btnStart', () => Net.startGame());
    click('btnLobbyLeave', () => { Net.leave(); setState('online'); });
    click('btnLanCreate', () => Net.createLan(this.playerName()));
    click('btnLanJoin', () => Net.joinLan(this.playerName()));
    click('btnCopy', () => {
      try { navigator.clipboard.writeText(Net.transport === 'lan' ? Net.lanUrl() : Net.code); this.$('btnCopy').textContent = 'СКОПИРОВАНО'; setTimeout(() => (this.$('btnCopy').textContent = 'КОПИРОВАТЬ'), 1500); } catch (e) {}
    });
    click('btnRetry', restartGame);
    click('btnResume', resumeGame);
    click('btnQuit', quitToMenu);
    click('btnMenu', quitToMenu);
    for (const b of document.querySelectorAll('.mute-btn')) b.addEventListener('click', () => { SFX.init(); SFX.toggleMute(); this.updateMute(); });

    const code = this.$('codeInput');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { SFX.init(); Net.join(code.value, this.playerName()); } });
    let saved = '';
    try { saved = localStorage.getItem('ns_name') || ''; } catch (e) {}
    this.$('nameInput').value = saved || 'Пилот-' + randi(10, 99);

    if (!Net.available()) this.$('netLibWarn').style.display = 'block';

    // игра открыта с lan-server.ps1? — тогда включаем Wi-Fi-режим
    if (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) {
      fetch('lan.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j && j.lan) { Net.lan = j; this.updateLan(); } })
        .catch(() => {});
    }

    // первое взаимодействие запускает музыку меню
    const kick = () => { SFX.init(); if (MENU_STATES.includes(G.state)) SFX.music(0.5); removeEventListener('pointerdown', kick); removeEventListener('keydown', kick); };
    addEventListener('pointerdown', kick);
    addEventListener('keydown', kick);
    this.updateMute();
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- запуск ----------
G.best = loadBest();
Decals.init(G.W, G.H);
resize();
bindInput();
UI.bind();
initMenuScene();
setState('menu');
requestAnimationFrame(frame);
