'use strict';
// Rewarded video ads through the CrazyGames HTML5 SDK v3.
// On crazygames.com real ads play. Anywhere else (preview, GitHub Pages) a clearly
// labelled test ad stands in, so the reward flow can be tried before uploading.
const AD_DAILY_LIMIT = 3, AD_TEST_SECONDS = 4;
let adPlaying = false;

const Ads = {
  env: 'none', ready: false,
  async init() {
    const cg = window.CrazyGames && window.CrazyGames.SDK;
    if (!cg) return;
    try { await cg.init(); this.env = cg.environment; this.ready = this.env === 'crazygames' || this.env === 'local'; }
    catch (e) { this.env = 'disabled'; }
  },
  sdk() { return this.ready ? window.CrazyGames.SDK : null; },
  gameplay(on) {
    const s = this.sdk(); if (!s) return;
    try { on ? s.game.gameplayStart() : s.game.gameplayStop(); } catch (e) {}
  },
  // resolves true only when the player watched the whole ad
  rewarded() {
    return new Promise(resolve => {
      const s = this.sdk();
      const start = () => { adPlaying = true; this.gameplay(false); };
      const end = ok => { adPlaying = false; resolve(ok); };
      if (!s) { start(); videoOver(() => end(true), () => end(false)); return; }
      try {
        s.ad.requestAd('rewarded', {
          adStarted: start,
          adFinished: () => end(true),
          adError: err => { end(false); toast(adErrorText(err)); },
        });
      } catch (e) { end(false); toast('Ads aren\'t available right now.'); }
    });
  },
};
function adErrorText(err) {
  const c = err && err.code;
  if (c === 'adblock') return '🚫 Turn off your ad blocker to watch ads for rewards.';
  if (c === 'unfilled') return 'No ad available right now. Try again in a bit.';
  if (c === 'adCooldown') return 'Ads need a short break. Try again in a moment.';
  if (c === 'adsDisabled') return 'Ads aren\'t available in this session.';
  return 'The ad couldn\'t play. Try again later.';
}
function videoOver(done, cancel) {
  const o = $('videoOver'); let left = AD_TEST_SECONDS;
  o.classList.add('show'); $('taSkip').disabled = true;
  const tick = () => {
    $('taCount').textContent = left > 0 ? `Reward in ${left}…` : 'Reward ready!';
    $('taBar').style.width = `${(AD_TEST_SECONDS - left) / AD_TEST_SECONDS * 100}%`;
    if (left <= 0) { clearInterval(iv); $('taSkip').disabled = false; $('taSkip').textContent = 'CLAIM REWARD ▶'; }
    left--;
  };
  $('taSkip').textContent = 'Watching…';
  const iv = setInterval(tick, 1000); tick();
  $('taSkip').onclick = () => { o.classList.remove('show'); done(); };
  $('taClose').onclick = () => { clearInterval(iv); o.classList.remove('show'); cancel(); };
}

// ---------- daily free-candy ads ----------
const todayKey = () => new Date().toISOString().slice(0, 10);
function adsLeftToday() {
  if (save.adDay !== todayKey()) { save.adDay = todayKey(); save.adCount = 0; persist(); }
  return Math.max(0, AD_DAILY_LIMIT - (save.adCount || 0));
}
// 50 candy, plus a little more as you level up
const adCandy = () => 50 + 2 * (levelInfo(save.xp).lvl - 1);
function renderAdBtn() {
  const left = adsLeftToday(), b = $('freeCandyBtn');
  b.disabled = left === 0;
  b.innerHTML = left
    ? `📺 Watch ad: <b>+${adCandy()} 🍬</b><span>${left} of ${AD_DAILY_LIMIT} left today</span>`
    : `📺 All ${AD_DAILY_LIMIT} ads watched<span>More free candy tomorrow</span>`;
}
$('freeCandyBtn').addEventListener('click', async () => {
  if (adPlaying || adsLeftToday() === 0) return;
  const ok = await Ads.rewarded();
  if (!ok) return;
  const n = adCandy();
  save.adCount = (save.adCount || 0) + 1; save.candy += n; persist();
  toast(`🎉 +${n} candy! ${adsLeftToday()} ad${adsLeftToday() === 1 ? '' : 's'} left today`);
  blip(880, 0.2, 'triangle', 0.06, 1.5);
  renderHome();
});

// ---------- revive after death (solo only, once per run) ----------
const REVIVE_SECONDS = 8;
let reviveTimer = null, reviveLeft = 0, deathMass = 0;
function onPlayerDeath() {
  if (mp || runStats.revived || state !== 'play') { showResults(); return; }
  deathMass = player.m;
  state = 'revive'; unlockPointer(); Ads.gameplay(false);
  $('rvMass').textContent = Math.round(deathMass);
  $('rvBtn').disabled = false;
  reviveLeft = REVIVE_SECONDS; reviveTick();
  show('revive');
  clearInterval(reviveTimer); reviveTimer = setInterval(() => { if (!adPlaying) { reviveLeft--; reviveTick(); } }, 1000);
}
function reviveTick() {
  $('rvCount').textContent = Math.max(0, reviveLeft);
  $('rvRing').style.setProperty('--p', `${Math.max(0, reviveLeft) / REVIVE_SECONDS * 360}deg`);
  if (reviveLeft <= 0) declineRevive();
}
function declineRevive() {
  clearInterval(reviveTimer);
  if (state !== 'revive') return;
  state = 'play'; showResults();
}
$('rvNo').addEventListener('click', declineRevive);
$('rvBtn').addEventListener('click', async () => {
  if (adPlaying || state !== 'revive') return;
  $('rvBtn').disabled = true;
  const ok = await Ads.rewarded();
  if (state !== 'revive') return;
  if (!ok) { $('rvBtn').disabled = false; return; }
  clearInterval(reviveTimer);
  const g = makeGhost(true); g.m = deathMass; g.r = radius(deathMass); g.shieldT = 3;
  const i = ghosts.indexOf(player);
  if (i >= 0) ghosts[i] = g; else ghosts.push(g);
  player = g; runStats.revived = true; runStats.killer = null;
  cam.x = g.x; cam.y = g.y;
  toast('👻 Revived! 3 seconds of protection');
  enterPlay();
});
