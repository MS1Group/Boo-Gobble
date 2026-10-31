'use strict';
const cv = $('c'), ctx = cv.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const W = 3200, H = 3200, FOOD_N = 520, BOT_N = 22, EAT_RATIO = 1.12;
const CANDY = ['#ff6a1f', '#7cc142', '#5b2a86', '#ffc23d', '#ff4f8b', '#2bb3c0'];
const NAMES = ['BooBerry', 'Sir Spooks', 'Ghostly67', 'Casper Jr', 'Wisp', 'PumpkinPal', 'NoodleBoo', 'Mr Sheet',
  'Phantomz', 'Spectre', 'Gloomy', 'Boo-tiful', 'Haunty', 'Wobble', 'Boogaloo', 'Moonpie', 'Fogsy', 'Banshee Bob',
  'Eek', 'Lil Poltergeist', 'Sheetface', 'Marshmallow', 'Zoomer', 'Creepster'];

const radius = m => 8 + Math.sqrt(m) * 3.4;
const massFor = r => Math.max(0, ((r - 8) / 3.4) ** 2);
let food = [], ghosts = [], floaters = [], parts = [], player, state = 'home', shake = 0, runStats;
let mp = null; // party session, set in party.js
let foodId = 0, ghostId = 0, foodAdded = [], foodRemoved = [];

function spawnFood(x, y, m) {
  const f = { id: ++foodId, x: x ?? rnd(30, W - 30), y: y ?? rnd(30, H - 30), m: m || 1, ci: (Math.random() * CANDY.length) | 0, s: Math.random() * 6.28, wrap: Math.random() < 0.3 };
  f.c = CANDY[f.ci]; food.push(f);
  if (mp && mp.isHost) foodAdded.push(f);
}
const myLook = () => ({ name: save.name || 'You', skin: save.skin, hat: save.hat, lv: Object.assign({}, save.lv), lvl: levelInfo(save.xp).lvl });
function makeGhost(isPlayer, look) {
  let x, y, tries = 0;
  const human = isPlayer || look;
  // humans spawn away from big ghosts; bots spawn away from humans
  const tooClose = (x, y) => human
    ? ghosts.some(o => o.alive && o.r > 30 && Math.hypot(x - o.x, y - o.y) < 500 + o.r)
    : ghosts.some(o => o.alive && o.human && Math.hypot(x - o.x, y - o.y) < 700);
  do { x = rnd(100, W - 100); y = rnd(100, H - 100); tries++; } while (tries < 25 && tooClose(x, y));
  look = look || (isPlayer ? myLook() : null);
  const m = look ? 20 + (look.lv.size || 0) * 8 : rnd(10, 30) + (Math.random() < 0.25 ? rnd(40, 160) : 0);
  return {
    id: ++ghostId, x, y, vx: 0, vy: 0, m, r: radius(m), alive: true, isPlayer, human: !!look,
    lv: look ? look.lv : { speed: 0, magnet: 0, size: 0, dash: 0 },
    name: look ? look.name : NAMES[(Math.random() * NAMES.length) | 0],
    lvl: look ? (look.lvl || 1) : botLevel(),
    body: look ? SKINS[look.skin].body : `hsl(${(Math.random() * 360) | 0} 70% 88%)`,
    hat: look ? look.hat : (Math.random() < 0.4 ? 1 + ((Math.random() * (HATS.length - 1)) | 0) : 0),
    wob: Math.random() * 6.28, dashCd: 0, dashT: 0, tx: x, ty: y, think: 0,
    mood: 'neutral', moodT: 0, happyT: 0, emote: null, emoteT: 0,
    input: [0, 0, 0], born: performance.now(),
  };
}
const botTarget = () => mp ? Math.max(0, mp.slots - ghosts.filter(g => g.human && g.alive).length) : BOT_N;
// home=true fills the world with bots only, as a living backdrop for menus
function resetWorld(home) {
  food = []; ghosts = []; floaters = []; parts = []; foodAdded = []; foodRemoved = [];
  for (let i = 0; i < FOOD_N; i++) spawnFood();
  player = makeGhost(true); player.x = W / 2; player.y = H / 2;
  if (home) player.alive = false;
  ghosts.push(player);
  if (mp && mp.isHost) mp.addRemoteGhosts();
  const n = botTarget();
  for (let i = 0; i < n; i++) ghosts.push(makeGhost(false));
  foodAdded = [];
  newRunStats();
}
function newRunStats() { runStats = { peak: player.m, eaten: 0, t: 0, killer: null, bestRank: 99, tier: 0 }; }
// candy bonus: staying longer and climbing the leaderboard both multiply the payout
const TIER_LEN = 120;
const timeMult = t => t < TIER_LEN ? 1 : Math.min(3, 1.5 + Math.floor((t - TIER_LEN) / TIER_LEN) * 0.5);
const rankMult = r => r === 1 ? 1.5 : r <= 3 ? 1.3 : r <= 5 ? 1.15 : 1;
function payout() {
  const base = Math.round(runStats.peak / 3) + runStats.eaten * 5;
  const tm = timeMult(runStats.t), rm = rankMult(runStats.bestRank);
  return { base, tm, rm, total: Math.round(base * tm * rm) };
}
const earnedSoFar = () => mp ? 0 : payout().total; // party candy is just for fun, it never reaches the wallet
// match XP counts in solo and party; parties get +20% for playing together
const PARTY_XP = 1.2;
function matchXp() {
  const peak = Math.round(runStats.peak / 2), eats = runStats.eaten * 15, time = Math.round(runStats.t / 2);
  const r = runStats.bestRank, place = r === 1 ? 100 : r <= 3 ? 60 : r <= 5 ? 30 : 0;
  const sub = peak + eats + time + place, mult = mp ? PARTY_XP : 1;
  return { peak, eats, time, place, mult, total: Math.round(sub * mult) };
}
const badge = lvl => `${tierOf(lvl).icon}${lvl}`;

// ---------- input ----------
const keys = {};
let mouse = { x: innerWidth / 2, y: innerHeight / 2, active: false };
let touch = null, dashReq = false, isTouch = false;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'Space') { dashReq = true; e.preventDefault(); }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' && performance.now() - lockLostAt < 400) return; // lock release already paused
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); }
  if (e.code === 'Enter' && (state === 'dead' || state === 'home')) startRun();
  const n = /^Digit([1-9])$/.exec(e.code);
  if (n && state === 'play') { const em = save.emotes[+n[1] - 1]; if (em) playerEmote(em); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('mousemove', e => {
  if (document.pointerLockElement === cv) {
    // locked: build a virtual cursor around screen centre from raw movement
    let dx = mouse.x - innerWidth / 2 + e.movementX, dy = mouse.y - innerHeight / 2 + e.movementY;
    const l = Math.hypot(dx, dy), max = 160;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    mouse.x = innerWidth / 2 + dx; mouse.y = innerHeight / 2 + dy;
  } else { mouse.x = e.clientX; mouse.y = e.clientY; }
  mouse.active = true;
});
// pointer lock hides the cursor even outside the game area; Esc releases it natively
function lockPointer() {
  if (isTouch || !cv.requestPointerLock) return;
  try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function unlockPointer() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
let lockLostAt = 0;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === cv) return;
  lockLostAt = performance.now();
  if (state === 'play') togglePause();
});
cv.addEventListener('mousedown', () => { if (state === 'play' && document.pointerLockElement !== cv) lockPointer(); });
cv.addEventListener('contextmenu', e => { e.preventDefault(); dashReq = true; });
cv.addEventListener('touchstart', e => {
  isTouch = true; $('dashBtn').style.display = 'block';
  const t = e.changedTouches[0]; touch = { sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, id: t.identifier };
  e.preventDefault();
}, { passive: false });
cv.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (touch && t.identifier === touch.id) { touch.x = t.clientX; touch.y = t.clientY; }
  e.preventDefault();
}, { passive: false });
cv.addEventListener('touchend', e => { for (const t of e.changedTouches) if (touch && t.identifier === touch.id) touch = null; });
$('dashBtn').addEventListener('touchstart', e => { dashReq = true; e.preventDefault(); e.stopPropagation(); }, { passive: false });
$('dashBtn').addEventListener('click', () => { dashReq = true; });

function inputDir() {
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); mouse.active = false; return [kx / l, ky / l, 1]; }
  if (touch) {
    const dx = touch.x - touch.sx, dy = touch.y - touch.sy, l = Math.hypot(dx, dy);
    return l < 6 ? [0, 0, 0] : [dx / l, dy / l, Math.min(1, l / 60)];
  }
  if (mouse.active) {
    const dx = mouse.x - innerWidth / 2, dy = mouse.y - innerHeight / 2, l = Math.hypot(dx, dy);
    return l < 8 ? [0, 0, 0] : [dx / l, dy / l, Math.min(1, l / 120)];
  }
  return [0, 0, 0];
}

// ---------- emotes & moods ----------
function emote(g, id, dur = 2) { g.emote = id; g.emoteT = dur; g.mood = id; }
let emoteCd = 0;
function playerEmote(id) {
  if (!player.alive || emoteCd > 0) return;
  emoteCd = 0.4; emote(player, id);
  if (mp && !mp.isHost) mp.sendEmote(id);
  blip({ happy: 660, angry: 180, scared: 900, cheeky: 520, love: 740, dizzy: 400, cool: 330 }[id] || 500, 0.16, 'triangle', 0.05, id === 'scared' ? 1.8 : 1.25);
  if (mp && !mp.isHost) return; // the host decides how bots react
  for (const g of ghosts) {
    if (g.human || !g.alive || Math.random() > 0.3) continue;
    if (Math.hypot(g.x - player.x, g.y - player.y) < 650) setTimeout(() => g.alive && emote(g, Math.random() < 0.6 ? id : 'cheeky', 1.6), rnd(300, 900));
  }
}
function autoMood(g) {
  if (g.emoteT > 0) return g.emote;
  if (g.happyT > 0) return 'happy';
  if (g.dashT > 0) return 'chomp';
  const gr = radius(g.m);
  let threat = false, prey = false;
  for (const o of ghosts) {
    if (!o.alive || o === g) continue;
    const d = Math.hypot(o.x - g.x, o.y - g.y), or = radius(o.m);
    if (or > gr * EAT_RATIO && d < 260 + or) { threat = true; break; }
    if (gr > or * EAT_RATIO && d < 200 + gr) prey = true;
  }
  return threat ? 'scared' : prey ? 'angry' : 'neutral';
}

// ---------- sim ----------
function speedOf(g) {
  const base = 300 * Math.pow(20 / g.r, 0.42) + 40;
  return base * (g.human ? 1 + (g.lv.speed || 0) * 0.06 : 0.94);
}
function dash(g, dir) {
  if (g.dashCd > 0 || g.m < 18) return;
  const lost = g.m * 0.08; g.m -= lost; g.dashT = 0.28;
  g.dashCd = 1.4 * (g.human ? 1 - (g.lv.dash || 0) * 0.12 : 1);
  for (let i = 0; i < 4; i++) spawnFood(g.x - dir[0] * (g.r + 20) + rnd(-15, 15), g.y - dir[1] * (g.r + 20) + rnd(-15, 15), lost / 4);
  if (g.isPlayer) blip(220, 0.18, 'triangle', 0.07, 2.4);
}
function botBrain(g, dt) {
  g.think -= dt;
  if (g.think > 0) return;
  g.think = rnd(0.15, 0.35);
  let fx = 0, fy = 0, threat = false, prey = null, preyD = 1e9;
  for (const o of ghosts) {
    if (!o.alive || o === g) continue;
    const d = Math.hypot(o.x - g.x, o.y - g.y);
    if (o.r > g.r * EAT_RATIO && d < 260 + o.r) { fx -= (o.x - g.x) / d * (500 / d); fy -= (o.y - g.y) / d * (500 / d); threat = true; }
    else if (g.r > o.r * 1.15 && d < 420 && d < preyD) { prey = o; preyD = d; }
  }
  if (threat) { g.tx = g.x + fx * 300; g.ty = g.y + fy * 300; if (Math.random() < 0.15) g.wantDash = true; return; }
  if (prey && Math.random() < 0.85) { g.tx = prey.x; g.ty = prey.y; if (preyD < g.r * 3 && Math.random() < 0.1) g.wantDash = true; return; }
  let best = null, bd = 1e9;
  for (let i = 0; i < food.length; i += 3) { const f = food[i]; const d = (f.x - g.x) ** 2 + (f.y - g.y) ** 2; if (d < bd) { bd = d; best = f; } }
  if (best) { g.tx = best.x; g.ty = best.y; }
}
function eat(a, b) {
  b.alive = false; a.m += b.m * 0.8; a.happyT = 1.4;
  burst(b.x, b.y, bodyColor(b, performance.now()), 18);
  if (!a.human && Math.random() < 0.4) emote(a, Math.random() < 0.5 ? 'cheeky' : 'cool', 1.5);
  if (a.isPlayer) {
    runStats.eaten++; shake = 10;
    floaters.push({ x: b.x, y: b.y, t: 1.2, txt: ['GOBBLED!', 'BOO-YAH!', 'NOM NOM', 'SPOOKED!'][(Math.random() * 4) | 0] + ' ' + b.name });
    blip(520, 0.12, 'square', 0.05, 0.5); setTimeout(() => blip(780, 0.12, 'square', 0.05, 1.3), 90);
  }
  if (a.remote && mp) mp.remoteAte(a, b);
  if (b.remote && mp) mp.remoteDied(b, a);
  if (b.isPlayer) { runStats.killer = a.name; shake = 16; blip(300, 0.5, 'sawtooth', 0.06, 0.25); setTimeout(onPlayerDeath, 800); }
}
function burst(x, y, c, n) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(80, 320); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rnd(0.4, 0.9), c }); } }

let pitch = 0, pitchT = 0;
function update(dt) {
  if (state === 'play' && player.alive) runStats.t += dt;
  pitchT -= dt; emoteCd -= dt; if (pitchT < 0) pitch = 0;
  for (const g of ghosts) {
    if (!g.alive) continue;
    let dir;
    if (g.isPlayer) {
      dir = state === 'play' ? inputDir() : [0, 0, 0];
      if (dashReq && state === 'play') dash(g, dir[2] ? dir : [1, 0]);
    } else if (g.remote) {
      dir = g.input;
      if (g.wantDash) { dash(g, dir[2] ? dir : [1, 0]); g.wantDash = false; }
    } else {
      botBrain(g, dt);
      const dx = g.tx - g.x, dy = g.ty - g.y, l = Math.hypot(dx, dy) || 1;
      dir = [dx / l, dy / l, 1];
      if (g.wantDash) { dash(g, dir); g.wantDash = false; }
    }
    const sp = speedOf(g) * dir[2] * (g.dashT > 0 ? 2.6 : 1);
    const k = 1 - Math.exp(-dt * 8);
    g.vx += (dir[0] * sp - g.vx) * k; g.vy += (dir[1] * sp - g.vy) * k;
    g.x = Math.max(g.r, Math.min(W - g.r, g.x + g.vx * dt));
    g.y = Math.max(g.r, Math.min(H - g.r, g.y + g.vy * dt));
    g.dashT -= dt; g.dashCd -= dt; if (g.shieldT > 0) g.shieldT -= dt; g.wob += dt * 3; g.happyT -= dt; g.emoteT -= dt;
    g.moodT -= dt;
    if (g.moodT <= 0 || g.emoteT > 0) { g.mood = autoMood(g); g.moodT = 0.2; }
    if (g.m > 30) g.m -= g.m * 0.0035 * dt; // slow decay keeps giants catchable
    g.r += (radius(g.m) - g.r) * Math.min(1, dt * 10);
  }
  dashReq = false;

  const magnets = ghosts.filter(g => g.alive && g.human && g.lv.magnet);
  for (let i = food.length - 1; i >= 0; i--) {
    const f = food[i];
    for (const h of magnets) {
      const d = Math.hypot(h.x - f.x, h.y - f.y), mag = h.r + h.lv.magnet * 38;
      if (d < mag && d > 1) { f.x += (h.x - f.x) / d * 260 * dt; f.y += (h.y - f.y) / d * 260 * dt; }
    }
    for (const g of ghosts) {
      if (!g.alive) continue;
      if (Math.abs(g.x - f.x) < g.r && Math.abs(g.y - f.y) < g.r && (g.x - f.x) ** 2 + (g.y - f.y) ** 2 < g.r * g.r) {
        g.m += f.m; food.splice(i, 1);
        if (mp && mp.isHost) foodRemoved.push(f.id);
        if (g.isPlayer) { pitch = Math.min(pitch + 1, 14); pitchT = 0.6; blip(440 * Math.pow(1.06, pitch), 0.05, 'sine', 0.035); }
        break;
      }
    }
  }
  while (food.length < FOOD_N) spawnFood();

  for (let i = 0; i < ghosts.length; i++) {
    const a = ghosts[i]; if (!a.alive) continue;
    for (let j = 0; j < ghosts.length; j++) {
      const b = ghosts[j]; if (i === j || !b.alive) continue;
      if (!(b.shieldT > 0) && radius(a.m) > radius(b.m) * EAT_RATIO && Math.hypot(a.x - b.x, a.y - b.y) < a.r - b.r * 0.35) eat(a, b);
    }
  }
  for (let i = ghosts.length - 1; i >= 0; i--) if (!ghosts[i].alive && !ghosts[i].isPlayer) ghosts.splice(i, 1);
  // bots fill whatever seats real players leave empty
  const bots = ghosts.filter(g => !g.human), want = botTarget();
  for (let i = bots.length; i < want; i++) ghosts.push(makeGhost(false));
  if (bots.length > want) {
    const spare = bots.sort((a, b) => a.m - b.m).slice(0, bots.length - want);
    for (const b of spare) { b.alive = false; ghosts.splice(ghosts.indexOf(b), 1); }
  }

  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.t -= dt; }
  parts = parts.filter(p => p.t > 0);
  for (const f of floaters) { f.t -= dt; f.y -= 40 * dt; }
  floaters = floaters.filter(f => f.t > 0);
  if (player.alive) runStats.peak = Math.max(runStats.peak, player.m);
  shake *= Math.exp(-dt * 8);
}
// effects-only tick used by party guests, whose world comes from the host
function tickFx(dt) {
  pitchT -= dt; emoteCd -= dt; if (pitchT < 0) pitch = 0;
  if (state === 'play' && player.alive) runStats.t += dt;
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.t -= dt; }
  parts = parts.filter(p => p.t > 0);
  for (const f of floaters) { f.t -= dt; f.y -= 40 * dt; }
  floaters = floaters.filter(f => f.t > 0);
  if (player.alive) runStats.peak = Math.max(runStats.peak, player.m);
  shake *= Math.exp(-dt * 8);
}

// ---------- render ----------
let cam = { x: W / 2, y: H / 2, z: 1 }, dpr = 1;
function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
addEventListener('resize', resize);

function relation(g) {
  if (!player.alive) return 'none';
  const pr = radius(player.m), gr = radius(g.m);
  if (pr > gr * EAT_RATIO) return 'eat';
  if (gr > pr * EAT_RATIO) return 'run';
  return 'even';
}
function drawLabels(g, t) {
  const r = g.r, x = g.x, y = g.y;
  const fs = Math.max(13, Math.min(26, r * 0.36));
  ctx.font = `800 ${fs}px Futura, "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 4; ctx.strokeStyle = '#fffaf0'; ctx.fillStyle = g.isPlayer ? '#5b2a86' : g.human ? '#1f7f8c' : INK;
  const label = `${badge(g.lvl || 1)} ${g.name}`;
  ctx.strokeText(label, x, y + r * 1.3 + fs * 0.4); ctx.fillText(label, x, y + r * 1.3 + fs * 0.4);
  const rel = g.isPlayer ? 'me' : relation(g), m = Math.round(g.m);
  const tag = { me: `${m}`, eat: `🍴 EAT · ${m}`, run: `☠ RUN · ${m}`, even: `≈ EVEN · ${m}`, none: `${m}` }[rel];
  const col = { me: '#ff6a1f', eat: '#3f8f2a', run: '#d42f2f', even: '#8a7a63', none: '#8a7a63' }[rel];
  const bf = fs * 0.8;
  ctx.font = `800 ${bf}px Futura, "Trebuchet MS", sans-serif`;
  const tw = ctx.measureText(tag).width + bf, by = y + r * 1.3 + fs * 0.7, bh = bf * 1.5;
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, by, tw, bh, bh / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fffaf0'; ctx.textBaseline = 'middle'; ctx.fillText(tag, x, by + bh / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  // emote bubble
  if (g.emoteT > 0) {
    const em = EMOTES.find(e => e.id === g.emote); if (!em) return;
    const pop = Math.min(1, (2 - Math.max(0, 2 - g.emoteT)) * 6), s = Math.max(22, r * 0.55) * Math.min(1, pop);
    const bx = x + r * 0.85, byy = y - r * 1.25 + Math.sin(t / 200) * 3;
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, byy, s * 0.75, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - s * 0.4, byy + s * 0.55); ctx.lineTo(bx - s * 0.75, byy + s * 0.95); ctx.lineTo(bx - s * 0.1, byy + s * 0.72); ctx.fill();
    ctx.font = `${s}px sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(em.emoji, bx, byy + 2);
    ctx.textBaseline = 'alphabetic';
  }
}

let homeA = 0;
function render(t, dt) {
  const vw = innerWidth, vh = innerHeight;
  let tx, ty;
  if (player.alive) { tx = player.x; ty = player.y; }
  else if (state === 'home') { homeA += dt * 0.08; tx = W / 2 + Math.cos(homeA) * 700; ty = H / 2 + Math.sin(homeA * 1.3) * 500; }
  else { tx = cam.x; ty = cam.y; }
  cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
  const scr = Math.min(vw, vh) / 760;
  const tz = (state === 'home' ? 0.75 : Math.max(0.38, Math.min(1.25, 70 / (player.r + 45)))) * scr * (isTouch ? 1.1 : 1);
  cam.z += (tz - cam.z) * 0.05;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fbf1df'; ctx.fillRect(0, 0, vw, vh);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z + sx), dpr * (vh / 2 - cam.y * cam.z + sy));
  const x0 = cam.x - vw / 2 / cam.z, y0 = cam.y - vh / 2 / cam.z, x1 = cam.x + vw / 2 / cam.z, y1 = cam.y + vh / 2 / cam.z;
  ctx.fillStyle = '#ead8b8';
  const step = 60;
  for (let gx = Math.max(0, Math.floor(x0 / step) * step); gx <= Math.min(W, x1); gx += step)
    for (let gy = Math.max(0, Math.floor(y0 / step) * step); gy <= Math.min(H, y1); gy += step) ctx.fillRect(gx - 2, gy - 2, 4, 4);
  ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 10; ctx.setLineDash([30, 20]); ctx.strokeRect(0, 0, W, H); ctx.setLineDash([]);
  for (const f of food) {
    if (f.x < x0 - 20 || f.x > x1 + 20 || f.y < y0 - 20 || f.y > y1 + 20) continue;
    const r = 6 + Math.min(10, f.m * 1.5), bob = Math.sin(t / 300 + f.s) * 2;
    ctx.fillStyle = f.c;
    if (f.wrap) { ctx.beginPath(); ctx.moveTo(f.x - r * 1.9, f.y + bob - r * 0.6); ctx.lineTo(f.x - r * 0.8, f.y + bob); ctx.lineTo(f.x - r * 1.9, f.y + bob + r * 0.6);
      ctx.moveTo(f.x + r * 1.9, f.y + bob - r * 0.6); ctx.lineTo(f.x + r * 0.8, f.y + bob); ctx.lineTo(f.x + r * 1.9, f.y + bob + r * 0.6); ctx.fill(); }
    ctx.beginPath(); ctx.arc(f.x, f.y + bob, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(f.x - r * 0.3, f.y + bob - r * 0.3, r * 0.3, 0, 6.28); ctx.fill();
  }
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.t * 1.4); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 6.28); ctx.fill(); }
  ctx.globalAlpha = 1;
  const vis = ghosts.filter(g => g.alive && g.x + g.r * 2 > x0 && g.x - g.r * 2 < x1 && g.y + g.r * 2 > y0 && g.y - g.r * 2 < y1).sort((a, b) => a.r - b.r);
  for (const g of vis) {
    if (player.alive && !g.isPlayer) {
      const rel = relation(g), pulse = 0.5 + 0.5 * Math.sin(t / 180);
      ctx.lineWidth = 6;
      if (rel === 'run') { ctx.strokeStyle = `rgba(212,47,47,${0.35 + pulse * 0.35})`; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * 1.28, 0, 6.28); ctx.stroke(); }
      else if (rel === 'eat') { ctx.strokeStyle = 'rgba(63,143,42,.6)'; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.arc(g.x, g.y, g.r * 1.28, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.save(); ctx.translate(g.x, g.y); drawGhostShape(ctx, g, t); ctx.restore();
    if (g.shieldT > 0) { ctx.globalAlpha = Math.min(1, g.shieldT) * (0.55 + 0.25 * Math.sin(t / 90)); ctx.strokeStyle = '#ffc23d'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * 1.45, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  for (const g of vis) drawLabels(g, t);
  // aim arrow replaces the hidden cursor
  const aim = player.alive && state === 'play' ? inputDir() : [0, 0, 0];
  if (aim[2] > 0) {
    const ax = player.x + aim[0] * (player.r * 1.35 + 14), ay = player.y + aim[1] * (player.r * 1.35 + 14), s = 10 + player.r * 0.15;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(aim[1], aim[0]));
    ctx.globalAlpha = 0.4 + aim[2] * 0.5;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.75); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, s * 0.75); ctx.closePath();
    ctx.fillStyle = '#ff6a1f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.t * 2); ctx.font = '800 30px Futura, "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(f.txt, f.x, f.y); ctx.fillStyle = '#ffc23d'; ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (state !== 'home') drawMini();
}
function drawMini() {
  const s = mini.width / W;
  mctx.clearRect(0, 0, mini.width, mini.height);
  for (const g of ghosts) {
    if (!g.alive) continue;
    const rel = g.isPlayer ? 'me' : relation(g);
    mctx.fillStyle = { me: '#ff6a1f', run: '#d42f2f', eat: '#3f8f2a' }[rel] || '#b9a688';
    mctx.beginPath(); mctx.arc(g.x * s, g.y * s, Math.max(2, g.r * s * (g.isPlayer ? 1.6 : 1)), 0, 6.28); mctx.fill();
  }
}

// ---------- HUD ----------
let hudT = 0;
function hud(dt) {
  hudT -= dt; if (hudT > 0 || state === 'home') return; hudT = 0.2;
  $('mass').textContent = Math.round(player.alive ? player.m : runStats.peak);
  $('candy').textContent = '🍬 ' + save.candy + '  ·  best ' + save.best;
  if (player.alive) {
    const pr = radius(player.m);
    const canEat = Math.floor(massFor(pr / EAT_RATIO)), danger = Math.ceil(massFor(pr * EAT_RATIO));
    const near = ghosts.filter(g => g.alive && !g.isPlayer && Math.hypot(g.x - player.x, g.y - player.y) < 900);
    const nEat = near.filter(g => relation(g) === 'eat').length, nRun = near.filter(g => relation(g) === 'run').length;
    $('power').innerHTML = `<span class="g">🍴 Eat under ${canEat}</span> (${nEat} near)<br><span class="r">☠ Run from ${danger}+</span> (${nRun} near)`;
  }
  const sorted = ghosts.filter(g => g.alive).sort((a, b) => b.m - a.m);
  const rank = sorted.indexOf(player) + 1;
  if (player.alive && rank > 0 && rank < runStats.bestRank) {
    const before = rankMult(runStats.bestRank); runStats.bestRank = rank;
    if (rankMult(rank) > before && state === 'play') { toast(mp ? `🏆 Reached #${rank}! Bonus XP unlocked` : `🏆 Reached #${rank}! Rank bonus x${rankMult(rank)}`); blip(880, 0.25, 'triangle', 0.06, 1.5); }
  }
  if (player.alive && state === 'play') {
    const tm = timeMult(runStats.t);
    if (tm > 1 && tm !== runStats.tier) {
      runStats.tier = tm; const m = Math.floor(runStats.t / 60);
      if (!mp) toast(`⏱ ${m}:00 survived! Time bonus x${tm}`); blip(660, 0.2, 'triangle', 0.06, 1.5); setTimeout(() => blip(990, 0.25, 'triangle', 0.06, 1.3), 120);
    }
    const p = payout(), next = tm >= 3 ? null : runStats.t < TIER_LEN ? TIER_LEN : TIER_LEN * (1 + Math.floor(runStats.t / TIER_LEN));
    const prevMark = runStats.t < TIER_LEN ? 0 : TIER_LEN * Math.floor(runStats.t / TIER_LEN);
    const pct = next ? Math.min(100, (runStats.t - prevMark) / (next - prevMark) * 100) : 100;
    const left = next ? Math.ceil(next - runStats.t) : 0;
    const x = matchXp();
    $('bonus').innerHTML = mp
      ? `<div class="brow"><b>⭐ ${x.total} XP</b><span>party x${PARTY_XP}</span></div>
        <div class="bnext">🍬 Party candy is just for fun and won't be added to your balance.</div>`
      : `<div class="brow"><b>🍬 x${(p.tm * p.rm).toFixed(2).replace(/\.?0+$/, '')}</b><span>⏱ x${p.tm} · 🏆 x${p.rm}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="bnext">${next ? `x${timeMult(next)} in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Max time bonus!'} · ${p.total} candy · ⭐ ${x.total} XP</div>`;
  }
  const nm = g => `${badge(g.lvl || 1)} ${g.human && !g.isPlayer ? '👥 ' : ''}${esc(g.name)}`;
  let html = sorted.slice(0, 5).map((g, i) => `<div class="row ${g.isPlayer ? 'me' : ''}"><span>${i + 1}. ${nm(g)}</span><span>${Math.round(g.m)}</span></div>`).join('');
  if (rank > 5) html += `<div class="row me"><span>${rank}. ${nm(player)}</span><span>${Math.round(player.m)}</span></div>`;
  $('rows').innerHTML = html;
  if (runStats.t > 10 || runStats.eaten > 0) $('hint').style.opacity = 0;
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.opacity = 0, 2600); }
