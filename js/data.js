'use strict';
// ---------- оружие ----------
const WEAPONS = {
  blaster: { name: 'Бластер', short: 'БЛАСТЕР', color: '#33ffff', rate: 0.15, dmg: 13, speed: 980, spread: 0.035, count: 1, life: 0.85, r: 3.5, ammo: Infinity, shake: 1, sound: 'blaster', knock: 90 },
  shotgun: { name: 'Дробовик', short: 'ДРОБОВИК', color: '#ffb13b', rate: 0.72, dmg: 10, speed: 880, spread: 0.55, count: 9, life: 0.36, r: 3.2, ammo: 36, shake: 7, sound: 'shotgun', knock: 160, speedVar: 0.22, push: 180 },
  minigun: { name: 'Миниган', short: 'МИНИГАН', color: '#ffe23b', rate: 0.05, dmg: 7.5, speed: 1150, spread: 0.14, count: 1, life: 0.7, r: 2.8, ammo: 320, shake: 1.4, sound: 'minigun', knock: 50, push: 25 },
  plasma: { name: 'Плазмаган', short: 'ПЛАЗМА', color: '#4dff9a', rate: 0.3, dmg: 26, speed: 640, spread: 0.02, count: 1, life: 2.2, r: 8, ammo: 60, shake: 2.5, sound: 'plasma', knock: 180, bounce: 3, pierce: 2 },
  rocket: { name: 'Ракетница', short: 'РАКЕТЫ', color: '#ff4d6d', rate: 0.85, dmg: 30, speed: 560, spread: 0.03, count: 1, life: 2.4, r: 6, ammo: 16, shake: 5, sound: 'rocket', knock: 100, explode: { r: 125, dmg: 75 }, homing: 2.6, push: 120 },
  rail: { name: 'Рельсотрон', short: 'РЕЛЬСА', color: '#b46bff', rate: 0.9, dmg: 95, hitscan: true, ammo: 20, shake: 10, sound: 'rail', push: 260 },
};
const WEAPON_ORDER = ['blaster', 'shotgun', 'minigun', 'plasma', 'rocket', 'rail'];

// ---------- враги ----------
const ENEMIES = {
  grunt:    { name: 'Охотник',   r: 14, hp: 30,   speed: 115, dmg: 12, color: '#ff3b6b', score: 10,   energy: 1 },
  runner:   { name: 'Жало',      r: 10, hp: 16,   speed: 215, dmg: 8,  color: '#ffe23b', score: 15,   energy: 1 },
  shooter:  { name: 'Стрелок',   r: 15, hp: 42,   speed: 95,  dmg: 10, color: '#c04dff', score: 30,   energy: 2, fireRate: 2.1 },
  splitter: { name: 'Делитель',  r: 21, hp: 70,   speed: 85,  dmg: 14, color: '#4dff6b', score: 25,   energy: 2 },
  mini:     { name: 'Осколок',   r: 10, hp: 14,   speed: 160, dmg: 6,  color: '#9dff4d', score: 5,    energy: 0 },
  bomber:   { name: 'Камикадзе', r: 13, hp: 26,   speed: 165, dmg: 30, color: '#ff7a1a', score: 20,   energy: 1 },
  tank:     { name: 'Громила',   r: 27, hp: 200,  speed: 58,  dmg: 25, color: '#ff9d3b', score: 60,   energy: 4, heavy: 0.85 },
  boss:     { name: 'ОВЕРМАЙНД', r: 62, hp: 2400, speed: 75,  dmg: 30, color: '#ff2d95', score: 1500, energy: 30, heavy: 0.97 },
};
for (const k in ENEMIES) ENEMIES[k].fill = rgba(ENEMIES[k].color, 0.18);

const SPAWN_TABLE = [
  { type: 'grunt',    from: 1, w: 6, cost: 1 },
  { type: 'runner',   from: 2, w: 4, cost: 1 },
  { type: 'shooter',  from: 3, w: 3, cost: 2 },
  { type: 'splitter', from: 4, w: 3, cost: 2 },
  { type: 'bomber',   from: 6, w: 3, cost: 2 },
  { type: 'tank',     from: 7, w: 2, cost: 4 },
];

// ---------- улучшения ----------
const RARITY = {
  common: { label: 'Обычное',   color: '#33ffff', w: 10 },
  rare:   { label: 'Редкое',    color: '#b46bff', w: 5 },
  epic:   { label: 'Эпическое', color: '#ffb13b', w: 2.2 },
};

const UPGRADES = [
  { id: 'dmg',      icon: '💥', name: 'Калибр',             desc: '+20% урона всему оружию',                  rarity: 'common', max: 8, apply: (p) => { p.dmgMult *= 1.2; } },
  { id: 'rate',     icon: '⚡', name: 'Скорострельность',   desc: '+15% скорости стрельбы',                   rarity: 'common', max: 8, apply: (p) => { p.rateMult *= 1.15; } },
  { id: 'speed',    icon: '👟', name: 'Реактивные ботинки', desc: '+10% скорости бега',                       rarity: 'common', max: 5, apply: (p) => { p.speed *= 1.1; } },
  { id: 'hp',       icon: '🛡️', name: 'Бронеплиты',         desc: '+25 к макс. здоровью и лечение на 40',     rarity: 'common', max: 8, apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 40); } },
  { id: 'crit',     icon: '🎯', name: 'Меткость',           desc: '+10% шанс крита (двойной урон)',           rarity: 'common', max: 5, apply: (p) => { p.crit += 0.1; } },
  { id: 'magnet',   icon: '🧲', name: 'Магнит',             desc: '+60% радиус сбора энергии',                rarity: 'common', max: 4, apply: (p) => { p.magnet *= 1.6; } },
  { id: 'dash',     icon: '💨', name: 'Форсаж',             desc: '−20% перезарядка рывка',                   rarity: 'common', max: 4, apply: (p) => { p.dashMax *= 0.8; } },
  { id: 'ammo',     icon: '📦', name: 'Подсумок',           desc: '+50% боезапаса и полная перезарядка',      rarity: 'common', max: 3, apply: (p) => { p.ammoMult *= 1.5; for (const id of p.owned) if (id !== 'blaster') p.ammo[id] = maxAmmo(p, id); } },
  { id: 'pierce',   icon: '🗡️', name: 'Бронебойные',        desc: 'Пули пробивают на 1 врага больше',         rarity: 'rare',   max: 3, apply: (p) => { p.pierce++; } },
  { id: 'bounce',   icon: '↩️', name: 'Рикошет',            desc: 'Пули отскакивают от стен +1 раз',          rarity: 'rare',   max: 3, apply: (p) => { p.bounce++; } },
  { id: 'vamp',     icon: '🩸', name: 'Вампиризм',          desc: '+1 HP за каждое убийство',                 rarity: 'rare',   max: 4, apply: (p) => { p.lifesteal++; } },
  { id: 'ult',      icon: '🔋', name: 'Энергоядро',         desc: 'Нова заряжается на 35% быстрее',           rarity: 'rare',   max: 4, apply: (p) => { p.ultMult *= 1.35; } },
  { id: 'regen',    icon: '💚', name: 'Нанороботы',         desc: 'Регенерация +1 HP в секунду',              rarity: 'rare',   max: 4, apply: (p) => { p.regen += 1; } },
  { id: 'cryo',     icon: '❄️', name: 'Криопатроны',        desc: '20% шанс заморозить врага (−50% скорости)', rarity: 'rare',  max: 3, apply: (p) => { p.cryo += 0.2; } },
  { id: 'multi',    icon: '🔱', name: 'Мультивыстрел',      desc: '+1 снаряд к каждому выстрелу',             rarity: 'epic',   max: 3, apply: (p) => { p.extraProj++; } },
  { id: 'drone',    icon: '🛸', name: 'Дрон-напарник',      desc: 'Орбитальный дрон сам стреляет по врагам',  rarity: 'epic',   max: 3, apply: (p) => { p.drones++; } },
  { id: 'chain',    icon: '🌩️', name: 'Цепная молния',      desc: '15% шанс, что попадание бьёт молнией по 3 врагам', rarity: 'epic', max: 3, apply: (p) => { p.chain += 0.15; } },
  { id: 'dashnova', icon: '🌀', name: 'Ударный рывок',      desc: 'Рывок заканчивается взрывной волной',      rarity: 'epic',   max: 3, apply: (p) => { p.dashNova++; } },
];

function maxAmmo(p, id) {
  const a = WEAPONS[id].ammo;
  return a === Infinity ? Infinity : Math.round(a * p.ammoMult);
}
