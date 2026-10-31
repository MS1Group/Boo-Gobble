'use strict';
// ---------- screens ----------
const OVERS = ['home', 'pause', 'results', 'howOver', 'partyOver', 'revive'];
function show(id) { for (const o of OVERS) $(o).classList.toggle('show', o === id); }
function setRunUI(on) { document.body.classList.toggle('in-run', on); }

function enterPlay() {
  state = 'play'; Ads.gameplay(true);
  $('hint').style.opacity = 1;
  show(null); setRunUI(true); buildEmoteBar();
  mouse.x = innerWidth / 2 + 60; mouse.y = innerHeight / 2; lockPointer();
  $('partyChip').style.display = mp ? '' : 'none';
  if (mp) $('partyChip').textContent = `👥 Party ${mp.code}${mp.isHost ? ' · host' : ''}`;
  blip(392, 0.12, 'triangle', 0.06, 1.5); setTimeout(() => blip(587, 0.18, 'triangle', 0.06, 1.3), 110);
}
function startRun() {
  if (mp) {
    if (state === 'dead') mp.respawn();
    else if (mp.isHost && !mp.inMatch) mp.startMatch();
    return;
  }
  save.name = $('nameIn').value.trim().slice(0, 14); persist();
  resetWorld(false); enterPlay();
}
function bank() {
  const peak = Math.round(runStats.peak), earned = earnedSoFar(), newBest = peak > save.best;
  const xp = matchXp(), before = levelInfo(save.xp);
  save.candy += earned; save.xp += xp.total; save.best = Math.max(save.best, peak); save.runs++; persist();
  const after = levelInfo(save.xp);
  if (after.lvl > before.lvl) setTimeout(() => {
    toast(after.tier !== before.tier ? `${after.tier.icon} Promoted to ${after.tier.name}! Level ${after.lvl}` : `⭐ Level up! You're now level ${after.lvl}`);
    blip(523, 0.15, 'triangle', 0.06, 1.2); setTimeout(() => blip(659, 0.15, 'triangle', 0.06, 1.2), 140); setTimeout(() => blip(784, 0.3, 'triangle', 0.06, 1.5), 280);
  }, 500);
  return { peak, earned, newBest, xp, before, after };
}
function xpBarHtml(info, gainedFrom) {
  const pct = Math.round(info.into / info.need * 100);
  const start = gainedFrom != null ? Math.round(gainedFrom * 100) : pct;
  return `<div class="xpbar" style="--c:${info.tier.color}"><i style="width:${start}%" data-to="${pct}"></i></div>
    <div class="xpnums">${info.into} / ${info.need} XP to level ${info.lvl + 1}</div>`;
}
function showResults() {
  if (state !== 'play' && state !== 'paused') return;
  state = 'dead'; unlockPointer(); Ads.gameplay(false);
  const pay = payout();
  const { peak, earned, newBest, xp, before, after } = bank();
  $('rTitle').textContent = after.lvl > before.lvl ? 'LEVEL UP!' : newBest ? 'NEW BEST!' : 'GOBBLED!';
  const tStr = `${Math.floor(runStats.t / 60)}:${String(Math.floor(runStats.t % 60)).padStart(2, '0')}`;
  const killed = runStats.killer ? `Eaten by <b>${esc(runStats.killer)}</b>. ` : '';
  $('rSub').innerHTML = mp
    ? `${killed}Party match: candy doesn't count toward your balance, but your XP does.`
    : `${killed}You earned <b>🍬 ${earned}</b> candy.
    <div class="breakdown"><span>Base 🍬 ${pay.base}</span><span>⏱ ${tStr} survived <b>x${pay.tm}</b></span><span>🏆 Best rank #${runStats.bestRank > 50 ? '–' : runStats.bestRank} <b>x${pay.rm}</b></span></div>`;
  const same = after.lvl === before.lvl;
  $('rXp').innerHTML = `<div class="xphead"><span class="tierpill" style="background:${after.tier.color}">${after.tier.icon} ${after.tier.name} · Lv ${after.lvl}</span>
      <b>+${xp.total} XP</b></div>
    <div class="breakdown xpb"><span>Size +${xp.peak}</span><span>Gobbles +${xp.eats}</span><span>⏱ ${tStr} +${xp.time}</span>${xp.place ? `<span>🏆 Top ${runStats.bestRank === 1 ? '1' : runStats.bestRank <= 3 ? '3' : '5'} +${xp.place}</span>` : ''}${xp.mult > 1 ? `<span>👥 Party x${xp.mult}</span>` : ''}</div>
    ${xpBarHtml(after, same ? before.into / before.need : 0)}`;
  requestAnimationFrame(() => requestAnimationFrame(() => { const i = $('rXp').querySelector('.xpbar i'); if (i) i.style.width = i.dataset.to + '%'; }));
  $('rPeak').textContent = peak; $('rEat').textContent = runStats.eaten; $('rBest').textContent = save.best;
  $('againBtn').textContent = mp ? 'RESPAWN ▶' : 'PLAY AGAIN ▶';
  $('homeBtn').innerHTML = mp ? '🚪 LEAVE PARTY' : '🏠 HOME &amp; SHOP';
  show('results');
}
function togglePause() {
  if (state === 'play') {
    state = 'paused'; unlockPointer(); Ads.gameplay(false);
    $('pMass').textContent = Math.round(player.alive ? player.m : runStats.peak);
    $('pEarn').innerHTML = mp ? `⭐ ${matchXp().total} XP` : `🍬 ${earnedSoFar()} · ⭐ ${matchXp().total} XP`;
    const p = payout();
    $('quitNote').textContent = mp
      ? 'The party keeps playing while you\'re paused, and your ghost stands still. Party candy doesn\'t count, but leaving now still banks your XP.'
      : `Current bonus: time x${p.tm} · rank x${p.rm}. Quitting banks your candy and XP, but staying longer earns more.`;
    $('quitBtn').innerHTML = mp ? '🚪 LEAVE PARTY' : '🏠 QUIT TO HOME';
    show('pause'); blip(300, 0.1, 'triangle', 0.05, 0.8);
  } else if (state === 'paused') {
    state = 'play'; show(null); blip(450, 0.1, 'triangle', 0.05, 1.3); lockPointer();
    if (!mp && !player.alive) showResults();
  }
}
function quitToHome() {
  if (state === 'paused' || state === 'play') {
    const { earned, xp } = bank();
    toast(mp ? `Banked ⭐ ${xp.total} XP` : `Banked 🍬 ${earned} candy · ⭐ ${xp.total} XP`);
  }
  goHome();
}
function goHome() {
  if (mp) mp.leave();
  state = 'home'; unlockPointer(); Ads.gameplay(false); resetWorld(true); setRunUI(false); show('home'); renderHome();
}
$('playBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('homeBtn').addEventListener('click', goHome);
$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', togglePause);
$('quitBtn').addEventListener('click', quitToHome);
$('howBtn').addEventListener('click', () => show('howOver'));
$('closeHow').addEventListener('click', () => show('home'));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
addEventListener('blur', () => { if (state === 'play') togglePause(); });

function toggleMute() { save.muted = !save.muted; persist(); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; }
$('muteBtn').addEventListener('click', toggleMute);

function buildEmoteBar() {
  $('emoteBar').innerHTML = save.emotes.map((id, i) => {
    const e = EMOTES.find(x => x.id === id);
    return `<button class="emo" data-e="${id}" title="${e.name} (${i + 1})">${e.emoji}<i>${i + 1}</i></button>`;
  }).join('');
}
$('emoteBar').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) playerEmote(b.dataset.e); });
$('emoteBar').addEventListener('touchstart', e => { const b = e.target.closest('[data-e]'); if (b) { playerEmote(b.dataset.e); e.preventDefault(); } }, { passive: false });

// ---------- home & shop ----------
let tab = 'upgrades', hover = null;
const HINTS = {
  upgrades: 'Upgrades apply every run. Each one has 5 levels.',
  colors: 'Tap a color to buy it, then tap again any time to wear it.',
  hats: 'Looks sit on your head in every run. Bots wear them too, so you will spot rivals.',
  emotes: 'Owned emotes appear on the bar at the bottom while you play. Press 1–7 or tap them. Your face also reacts on its own: scared near danger, angry near prey, happy after a gobble.',
};
function renderHome() {
  $('nameIn').value = save.name;
  $('hBest').textContent = save.best; $('hStreak').textContent = save.streak || 1; $('hRuns').textContent = save.runs;
  const li = levelInfo(save.xp), nextTier = TIERS.find(t => t.from > li.lvl);
  $('hLevel').innerHTML = `<div class="xphead"><span class="tierpill" style="background:${li.tier.color}">${li.tier.icon} ${li.tier.name}</span><b>Level ${li.lvl}</b></div>
    ${xpBarHtml(li)}<div class="xpnums">${nextTier ? `${nextTier.icon} ${nextTier.name} at level ${nextTier.from}` : 'Top rank reached!'}</div>`;
  $('wallet').textContent = save.candy; if (typeof renderAdBtn === 'function') renderAdBtn();
  $('muteBtn').textContent = save.muted ? '🔇' : '🔊';
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  $('shopHint').textContent = HINTS[tab];
  const shop = $('shop');
  if (tab === 'upgrades') {
    shop.innerHTML = UPG.map(u => {
      const lv = save.lv[u.key], max = lv >= MAXLV, c = upgCost(lv), poor = !max && save.candy < c;
      return `<div class="item ${poor ? 'poor' : ''}" data-k="upg" data-v="${u.key}"><div style="font-size:34px">${u.icon}</div>
        <div class="t">${u.name}</div><div>${u.desc}</div><div class="pips">${'●'.repeat(lv)}${'○'.repeat(MAXLV - lv)}</div>
        <div class="price">${max ? 'MAXED' : '🍬 ' + c}</div></div>`;
    }).join('');
    return;
  }
  const list = tab === 'colors' ? SKINS : tab === 'hats' ? HATS : EMOTES;
  shop.innerHTML = list.map((it, i) => {
    const own = tab === 'colors' ? save.skins.includes(i) : tab === 'hats' ? save.hats.includes(i) : save.emotes.includes(it.id);
    const eq = (tab === 'colors' && save.skin === i) || (tab === 'hats' && save.hat === i);
    const poor = !own && save.candy < it.cost;
    const price = own ? (tab === 'emotes' ? 'Owned' : eq ? 'Wearing' : 'Wear') : '🍬 ' + it.cost;
    const visual = tab === 'colors'
      ? `<div class="swatch" style="background:${it.body === 'rainbow' ? 'conic-gradient(#ff6a6a,#ffc23d,#a6e36b,#6fc7ff,#b48ae0,#ff6a6a)' : it.body}"></div>`
      : `<canvas width="160" height="160" data-thumb="${i}"></canvas>`;
    return `<div class="item ${own ? '' : 'lock'} ${eq ? 'eq' : ''} ${poor ? 'poor' : ''}" data-k="${tab}" data-v="${i}">
      ${visual}<div class="t">${tab === 'emotes' ? it.emoji + ' ' : ''}${it.name}</div>
      <div class="price">${price}</div></div>`;
  }).join('');
  for (const cnv of shop.querySelectorAll('canvas[data-thumb]')) {
    const i = +cnv.dataset.thumb;
    paintThumb(cnv, tab === 'hats'
      ? { body: SKINS[save.skin].body === 'rainbow' ? '#ffffff' : SKINS[save.skin].body, hat: i, mood: 'happy' }
      : { body: '#ffffff', hat: 0, mood: EMOTES[i].id });
  }
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) { tab = b.dataset.tab; renderHome(); } });

function buy(el) {
  const k = el.dataset.k, v = el.dataset.v;
  const fail = () => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); blip(140, 0.2, 'square', 0.04, 0.8); };
  const ok = () => blip(880, 0.2, 'triangle', 0.06, 1.5);
  if (k === 'upg') {
    const lv = save.lv[v]; if (lv >= MAXLV || save.candy < upgCost(lv)) return fail();
    save.candy -= upgCost(lv); save.lv[v]++; ok();
  } else if (k === 'colors' || k === 'hats') {
    const i = +v, owned = k === 'colors' ? save.skins : save.hats, item = (k === 'colors' ? SKINS : HATS)[i];
    if (!owned.includes(i)) { if (save.candy < item.cost) return fail(); save.candy -= item.cost; owned.push(i); ok(); toast(`Unlocked ${item.name}!`); }
    else blip(600, 0.08, 'sine', 0.04);
    if (k === 'colors') save.skin = i; else save.hat = i;
  } else if (k === 'emotes') {
    const e = EMOTES[+v]; if (save.emotes.includes(e.id)) { hover = { mood: e.id, until: performance.now() + 1500 }; return; }
    if (save.candy < e.cost) return fail();
    save.candy -= e.cost; save.emotes.push(e.id); ok(); toast(`Unlocked ${e.emoji} ${e.name}!`);
  }
  persist(); renderHome();
}
$('shop').addEventListener('click', e => { const el = e.target.closest('.item'); if (el) buy(el); });
// hovering a card previews it on your ghost before you buy
$('shop').addEventListener('mouseover', e => {
  const el = e.target.closest('.item'); if (!el) return;
  const k = el.dataset.k, i = +el.dataset.v;
  hover = k === 'colors' ? { skin: i } : k === 'hats' ? { hat: i } : k === 'emotes' ? { mood: EMOTES[i].id } : null;
});
$('shop').addEventListener('mouseleave', () => { hover = null; });

const prev = $('preview');
const CYCLE = ['happy', 'neutral', 'cheeky', 'angry', 'scared'];
function drawPreview(t) {
  if (hover && hover.until && t > hover.until) hover = null;
  const skin = hover && hover.skin != null ? hover.skin : save.skin;
  const hat = hover && hover.hat != null ? hover.hat : save.hat;
  const owned = CYCLE.filter(m => m === 'neutral' || save.emotes.includes(m));
  const mood = hover && hover.mood ? hover.mood : owned[Math.floor(t / 1600) % owned.length];
  const c = prev.getContext('2d'), s = prev.width;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, s, s);
  c.fillStyle = 'rgba(43,29,20,.12)'; c.beginPath(); c.ellipse(s / 2, s * 0.86, s * 0.22 - Math.sin(t / 400) * 6, s * 0.04, 0, 0, 6.28); c.fill();
  c.translate(s / 2, s * 0.56 + Math.sin(t / 400) * 10);
  drawGhostShape(c, { r: s * 0.26, body: SKINS[skin].body, hat, mood, wob: t / 300, vx: Math.sin(t / 900) * 300, vy: 0 }, t);
}

function dailyBonus() {
  const today = new Date().toISOString().slice(0, 10);
  if (save.day === today) return;
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  save.streak = save.day === yest ? Math.min(save.streak + 1, 7) : 1;
  save.day = today;
  const bonus = 30 * save.streak; save.candy += bonus; persist();
  setTimeout(() => toast(`🎃 Day ${save.streak} streak: +${bonus} candy`), 800);
}

// ---------- loop ----------
resize(); resetWorld(true); dailyBonus(); renderHome(); Ads.init();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mp && !mp.isHost && mp.inMatch) mp.guestTick(dt);
  else if ((state !== 'paused' && !adPlaying) || mp) { update(dt); if (mp) mp.hostTick(dt); } // party worlds never pause
  render(now, state === 'paused' ? 0 : dt); hud(dt);
  if (state === 'home') drawPreview(now);
  document.body.classList.toggle('hide-cursor', state === 'play');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
