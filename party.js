'use strict';
// Party play: the host's browser runs the arena (bots included) and streams it to guests.
const MOODS = ['neutral', 'happy', 'angry', 'scared', 'cheeky', 'love', 'dizzy', 'cool', 'chomp'];
const SNAP_HZ = 15, INPUT_HZ = 20, SLOT_OPTIONS = [12, 20, 28];
const r1 = v => Math.round(v * 10) / 10;

function partyMsg(text, err) { const el = $('partyMsg'); el.textContent = text || ''; el.classList.toggle('err', !!err); }

class Party {
  constructor(net, isHost, code) {
    this.net = net; this.isHost = isHost; this.code = code;
    this.members = new Map(); // peer -> look (+ ghostId on host)
    this.slots = 20; this.inMatch = false; this.opened = false;
    this.snapT = 0; this.inputT = 0; this.metaT = 0;
    this.known = new Map(); this.meta = new Map(); this.foodMap = new Map();
    this.pendDash = false; this.pendEmote = null;
    net.on('open', () => this.onOpen());
    net.on('msg', (c, d, from) => this.onMsg(c, d, from));
    net.on('peerLeave', id => this.onLeave(id));
    net.on('closed', why => this.end(why));
    net.on('error', why => { partyMsg(why, true); if (!this.opened) { this.net.close(); mp = null; showPartyStep('choose'); } });
  }
  onOpen() {
    this.opened = true;
    if (this.isHost) { this.members.set(this.net.myId, Object.assign(myLook(), { host: true })); this.renderLobby(); showPartyStep('lobby'); }
    else { partyMsg('Found the party, joining…'); this.net.send(EV.HELLO, myLook()); }
  }

  // ---------- host ----------
  lobbyPayload() {
    return { m: [...this.members].map(([id, l]) => [id, l.name, l.skin, l.hat, l.host ? 1 : 0, l.lvl || 1]), s: this.slots, i: this.inMatch ? 1 : 0 };
  }
  broadcastLobby() { this.net.send(EV.LOBBY, this.lobbyPayload()); this.renderLobby(); }
  spawnRemote(peer) {
    const look = this.members.get(peer); if (!look) return;
    const g = makeGhost(false, look); g.remote = true; g.peer = peer;
    ghosts.push(g); look.ghostId = g.id;
  }
  addRemoteGhosts() { for (const id of this.members.keys()) if (id !== this.net.myId) this.spawnRemote(id); }
  ghostOf(peer) { const l = this.members.get(peer); return l && ghosts.find(g => g.id === l.ghostId && g.alive); }
  packFood() { return food.map(f => [f.id, f.x | 0, f.y | 0, r1(f.m), f.ci]); }
  startMatch() {
    this.inMatch = true;
    resetWorld(false); enterPlay();
    this.net.send(EV.START, { f: this.packFood() });
    this.broadcastLobby();
  }
  remoteAte(a, b) { this.net.send(EV.ATE, { n: b.name }, a.peer); }
  remoteDied(b, a) { this.net.send(EV.DEAD, { k: a.name }, b.peer); }
  hostTick(dt) {
    if (!this.inMatch) return;
    // a guest whose inputs stop (tab hidden, lag) stands still instead of drifting
    const now = performance.now();
    for (const g of ghosts) if (g.remote && now - (g.lastIn || g.born) > 1000) g.input = [0, 0, 0];
    this.snapT += dt; this.metaT += dt;
    if (this.snapT < 1 / SNAP_HZ) return;
    this.snapT = 0;
    const full = this.metaT > 2;
    if (full) this.metaT = 0;
    const live = ghosts.filter(g => g.alive);
    const snap = {
      g: live.map(g => [g.id, g.x | 0, g.y | 0, r1(g.m), g.vx | 0, g.vy | 0, Math.max(0, MOODS.indexOf(g.mood)),
        g.emoteT > 0 ? EMOTES.findIndex(e => e.id === g.emote) : -1, r1(Math.max(0, g.emoteT)), g.dashT > 0 ? 1 : 0]),
      mt: live.filter(g => full || now - g.born < 3000).map(g => [g.id, g.name, g.body, g.hat, g.isPlayer ? this.net.myId : (g.peer || 0), g.lvl || 1]),
      fa: foodAdded.map(f => [f.id, f.x | 0, f.y | 0, r1(f.m), f.ci]),
      fr: foodRemoved,
    };
    foodAdded = []; foodRemoved = [];
    this.net.send(EV.SNAP, snap);
  }
  respawnLocal() {
    const g = makeGhost(true); const i = ghosts.indexOf(player);
    if (i >= 0) ghosts[i] = g; else ghosts.push(g);
    player = g; newRunStats(); enterPlay();
  }

  // ---------- guest ----------
  startGuest(list) {
    this.inMatch = true;
    ghosts = []; this.known.clear(); this.foodMap.clear(); food = []; parts = []; floaters = [];
    for (const f of list) this.addFood(f);
    player = { alive: false, x: W / 2, y: H / 2, m: 20, r: radius(20), vx: 0, vy: 0 };
    newRunStats(); enterPlay();
  }
  addFood([id, x, y, m, ci]) {
    const f = { id, x, y, m, ci, c: CANDY[ci], s: Math.random() * 6.28, wrap: id % 3 === 0 };
    food.push(f); this.foodMap.set(id, f);
  }
  applySnap(d) {
    for (const [id, name, body, hat, peer, lvl] of d.mt) this.meta.set(id, { name, body, hat, peer, lvl });
    const seen = new Set();
    for (const [id, x, y, m, vx, vy, mood, em, emT, dashing] of d.g) {
      seen.add(id);
      let g = this.known.get(id);
      if (!g) {
        g = { id, x, y, tx: x, ty: y, m, r: radius(m), vx, vy, alive: true, wob: Math.random() * 6.28, name: '…', body: '#ffffff', hat: 0 };
        this.known.set(id, g);
      }
      g.tx = x; g.ty = y; g.m = m; g.vx = vx; g.vy = vy;
      g.mood = MOODS[mood]; g.dashT = dashing ? 0.1 : 0;
      if (em >= 0) { g.emote = EMOTES[em].id; g.emoteT = emT; } else g.emoteT = 0;
      const mt = this.meta.get(id);
      if (mt) {
        g.name = mt.name; g.body = mt.body; g.hat = mt.hat; g.human = !!mt.peer; g.lvl = mt.lvl || 1;
        const mine = mt.peer === this.net.myId;
        if (mine && !g.isPlayer && state !== 'dead') { g.isPlayer = true; player = g; if (runStats.peak < g.m) runStats.peak = g.m; }
      }
    }
    for (const [id, g] of this.known) if (!seen.has(id)) {
      if (Math.hypot(g.x - cam.x, g.y - cam.y) < 1200) burst(g.x, g.y, bodyColor(g, performance.now()), 14);
      g.alive = false; this.known.delete(id); this.meta.delete(id);
    }
    ghosts = [...this.known.values()];
    for (const f of d.fa) this.addFood(f);
    if (d.fr.length) {
      const gone = new Set(d.fr);
      for (const id of d.fr) this.foodMap.delete(id);
      food = food.filter(f => !gone.has(f.id));
    }
  }
  guestTick(dt) {
    const k = Math.min(1, dt * 10);
    for (const g of ghosts) {
      g.tx += g.vx * dt; g.ty += g.vy * dt;
      g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k;
      g.r += (radius(g.m) - g.r) * Math.min(1, dt * 10);
      g.wob += dt * 3; if (g.emoteT > 0) g.emoteT -= dt;
    }
    if (dashReq) { if (state === 'play' && player.alive) { this.pendDash = true; blip(220, 0.18, 'triangle', 0.07, 2.4); } dashReq = false; }
    tickFx(dt);
    this.inputT += dt;
    if (this.inputT >= 1 / INPUT_HZ) {
      this.inputT = 0;
      const dir = state === 'play' && player.alive ? inputDir() : [0, 0, 0];
      const msg = { d: dir.map(v => Math.round(v * 100) / 100) };
      if (this.pendDash) msg.x = 1;
      if (this.pendEmote) msg.e = this.pendEmote;
      this.pendDash = false; this.pendEmote = null;
      this.net.send(EV.INPUT, msg);
    }
  }
  sendEmote(id) { this.pendEmote = id; }
  respawn() {
    if (this.isHost) return this.respawnLocal();
    this.net.send(EV.RESPAWN, myLook());
    player = { alive: false, x: player.x, y: player.y, m: 20, r: radius(20), vx: 0, vy: 0 };
    newRunStats(); enterPlay();
  }

  // ---------- messages ----------
  onMsg(c, d, from) {
    if (this.isHost) {
      if (c === EV.HELLO) {
        if (this.members.size >= MAX_PARTY) { this.net.send(EV.FULL, {}, from); return; }
        this.members.set(from, { name: String(d.name || 'Friend').slice(0, 14), skin: d.skin | 0, hat: d.hat | 0, lv: d.lv || {}, lvl: Math.max(1, d.lvl | 0) });
        this.net.send(EV.WELCOME, Object.assign(this.lobbyPayload(), { f: this.inMatch ? this.packFood() : null }), from);
        if (this.inMatch) this.spawnRemote(from);
        this.broadcastLobby();
        toast(`👻 ${this.members.get(from).name} joined the party`);
      } else if (c === EV.INPUT) {
        const g = this.ghostOf(from); if (!g) return;
        g.input = Array.isArray(d.d) ? d.d : [0, 0, 0]; g.lastIn = performance.now();
        if (d.x) g.wantDash = true;
        if (d.e && EMOTES.some(e => e.id === d.e)) emote(g, d.e);
      } else if (c === EV.RESPAWN) {
        const look = this.members.get(from); if (!look || !this.inMatch || this.ghostOf(from)) return;
        Object.assign(look, { name: String(d.name || look.name).slice(0, 14), skin: d.skin | 0, hat: d.hat | 0, lv: d.lv || look.lv, lvl: Math.max(1, d.lvl | 0) });
        this.spawnRemote(from);
      } else if (c === EV.BYE) this.onLeave(from);
      return;
    }
    if (c === EV.WELCOME) {
      this.renderLobby(d); showPartyStep('lobby');
      if (d.f) this.startGuest(d.f);
    } else if (c === EV.LOBBY) this.renderLobby(d);
    else if (c === EV.START) this.startGuest(d.f);
    else if (c === EV.SNAP) { if (this.inMatch) this.applySnap(d); }
    else if (c === EV.DEAD) {
      runStats.killer = d.k; shake = 16; blip(300, 0.5, 'sawtooth', 0.06, 0.25);
      if (player) { player.isPlayer = false; player = { alive: false, x: player.x, y: player.y, m: player.m, r: player.r, vx: 0, vy: 0 }; }
      setTimeout(() => showResults(), 700);
    } else if (c === EV.ATE) {
      runStats.eaten++; shake = 10;
      floaters.push({ x: player.x, y: player.y - player.r, t: 1.2, txt: ['GOBBLED!', 'BOO-YAH!', 'NOM NOM', 'SPOOKED!'][(Math.random() * 4) | 0] + ' ' + d.n });
      blip(520, 0.12, 'square', 0.05, 0.5); setTimeout(() => blip(780, 0.12, 'square', 0.05, 1.3), 90);
    } else if (c === EV.FULL) { partyMsg('That party is full (8 players max).', true); this.net.close(); mp = null; showPartyStep('choose'); }
  }
  onLeave(peer) {
    if (!this.isHost) return;
    const look = this.members.get(peer); if (!look) return;
    const g = ghosts.find(x => x.id === look.ghostId);
    if (g) { g.alive = false; ghosts.splice(ghosts.indexOf(g), 1); }
    this.members.delete(peer); this.broadcastLobby();
    toast(`${look.name} left the party`);
  }
  leave() { try { this.net.send(EV.BYE, {}); } catch (e) {} this.net.close(); mp = null; }
  end(why) { this.net.close(); mp = null; goHome(); if (why) toast(why); }

  // ---------- lobby UI ----------
  renderLobby(d) {
    if (d) { this.slots = d.s; this.inMatch = this.inMatch || !!d.i; this.lobbyList = d.m; }
    const list = this.isHost ? this.lobbyPayload().m : (this.lobbyList || []);
    $('pCode').textContent = this.code;
    $('pMembers').innerHTML = list.map(([id, name, skin, hat, host, lvl]) => `<div class="mem">
      <canvas width="72" height="72" data-skin="${skin}" data-hat="${hat}"></canvas>
      <b>${esc(name)}</b><span class="mlvl" style="color:${tierOf(lvl || 1).color}">${tierOf(lvl || 1).icon} Lv ${lvl || 1} · ${tierOf(lvl || 1).name}</span>${host ? '<span class="crown">HOST</span>' : ''}${id === this.net.myId ? '<span class="you">YOU</span>' : ''}</div>`).join('') +
      Array.from({ length: Math.max(0, MAX_PARTY - list.length) }, () => '<div class="mem empty">open seat</div>').join('');
    for (const c of $('pMembers').querySelectorAll('canvas')) paintThumb(c, { body: SKINS[+c.dataset.skin].body, hat: +c.dataset.hat, mood: 'happy' });
    const bots = Math.max(0, this.slots - list.length);
    $('pSlots').innerHTML = SLOT_OPTIONS.map(n => `<button class="tab ${n === this.slots ? 'on' : ''}" data-slots="${n}" ${this.isHost ? '' : 'disabled'}>${n}</button>`).join('');
    $('pBots').textContent = `${list.length} player${list.length === 1 ? '' : 's'} + ${bots} bots = ${this.slots} ghosts. Bots step aside when friends join.`;
    $('pStart').style.display = this.isHost ? '' : 'none';
    $('pStart').textContent = this.inMatch ? '▶ BACK TO THE ARENA' : '▶ START GAME';
    $('pWait').style.display = this.isHost ? 'none' : '';
    $('pWait').textContent = this.inMatch ? 'Match running, jumping in…' : 'Waiting for the host to start…';
    $('pMode').textContent = this.net.kind === 'online' ? '🌐 Online party' : '🧪 Test mode: other tabs in this browser only';
  }
}

// ---------- party panel wiring ----------
function showPartyStep(step) {
  $('partyChoose').style.display = step === 'choose' ? '' : 'none';
  $('partyLobby').style.display = step === 'lobby' ? '' : 'none';
}
function openParty(prefill) {
  show('partyOver'); showPartyStep(mp && mp.opened ? 'lobby' : 'choose');
  if (prefill) $('joinCode').value = prefill;
  $('partyNote').textContent = hasPhoton()
    ? 'Online mode: friends anywhere can join with your code.'
    : 'Test mode: the online kit isn\'t loaded here, so parties only connect tabs in this same browser. Open the game in a second tab to try it.';
  $('testWrap').style.display = hasPhoton() ? '' : 'none';
  partyMsg('');
}
$('testMode').addEventListener('change', e => {
  forceLocal = e.target.checked;
  $('partyNote').textContent = forceLocal
    ? 'Test mode: parties only connect tabs in this same browser. Open the game in a second tab to try it.'
    : 'Online mode: friends anywhere can join with your code.';
});
function saveName() { save.name = $('nameIn').value.trim().slice(0, 14); persist(); }
$('partyBtn').addEventListener('click', () => openParty());
$('partyBack').addEventListener('click', () => { if (mp) mp.leave(); show('home'); });
$('createBtn').addEventListener('click', () => {
  if (mp) return;
  saveName(); partyMsg('Creating party…');
  const code = makeCode(); mp = new Party(makeNet(), true, code); mp.net.open(code, true);
});
function joinParty() {
  if (mp) return;
  const code = $('joinCode').value.trim().toUpperCase().replace(/^BOO-?/, '').replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { partyMsg('Party codes are 4 letters or numbers, like K7QF.', true); return; }
  saveName(); partyMsg('Looking for the party…');
  mp = new Party(makeNet(), false, code); mp.net.open(code, false);
}
$('joinBtn').addEventListener('click', joinParty);
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinParty(); });
$('pLeave').addEventListener('click', () => { if (mp) mp.leave(); showPartyStep('choose'); show('home'); toast('You left the party'); });
$('pStart').addEventListener('click', () => { if (!mp || !mp.isHost) return; if (mp.inMatch) enterPlay(); else mp.startMatch(); });
$('pSlots').addEventListener('click', e => {
  const b = e.target.closest('[data-slots]'); if (!b || !mp || !mp.isHost) return;
  mp.slots = +b.dataset.slots; mp.broadcastLobby();
});
$('pCopy').addEventListener('click', () => {
  if (!mp) return;
  let link = mp.code;
  try { const u = new URL(location.href); u.search = '?party=' + mp.code; u.hash = ''; link = u.toString(); } catch (e) {}
  const done = () => toast('Invite link copied!');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => prompt('Copy this invite link:', link));
  else prompt('Copy this invite link:', link);
});
// invite links open the join screen with the code filled in
try {
  const inv = new URLSearchParams(location.search).get('party');
  if (inv) setTimeout(() => openParty(inv), 300);
} catch (e) {}
