'use strict';
// Networking layer. Uses Photon Realtime when its SDK file is loaded,
// otherwise falls back to BroadcastChannel so parties work between tabs of one browser.
const PHOTON_APP_ID = 'd8f4edc0-9eb8-4949-acef-9b1b0ecda15e';
const PHOTON_APP_VERSION = 'boo-1';
const PHOTON_REGION = 'eu';
const MAX_PARTY = 8;

const EV = { HELLO: 1, WELCOME: 2, START: 3, SNAP: 4, INPUT: 5, DEAD: 6, ATE: 7, RESPAWN: 8, LOBBY: 9, BYE: 10, FULL: 11 };

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

// ---- Photon transport ----
class PhotonNet {
  constructor() { this.kind = 'online'; this.handlers = {}; this.myId = 0; this.hostId = 0; }
  on(n, f) { this.handlers[n] = f; }
  emit(n, ...a) { this.handlers[n] && this.handlers[n](...a); }
  open(code, asHost, altNs) {
    this.code = code; this.isHost = asHost;
    const LBC = Photon.LoadBalancing.LoadBalancingClient;
    const c = this.c = new LBC((Photon.ConnectionProtocol && Photon.ConnectionProtocol.Wss) || 1, PHOTON_APP_ID, PHOTON_APP_VERSION);
    // SDK 4.1 defaults to the legacy ns.exitgames.com name server; retry once on the current one
    if (altNs && c.setNameServerAddress) c.setNameServerAddress('wss://ns.photonengine.io:19093');
    const retry = why => {
      if (this.joined || this.retried) return false;
      this.retried = true; this.c = null; clearTimeout(this.timer); try { c.disconnect(); } catch (e) {}
      setTimeout(() => this.open(code, asHost, true), 300);
      return true;
    };
    let acted = false;
    try { c.setLogLevel(Exitgames.Common.Logger.Level.ERROR); } catch (e) {}
    const OP = (Photon.LoadBalancing.Constants && Photon.LoadBalancing.Constants.OperationCode) || {};
    const JOIN = OP.JoinGame || 226, CREATE = OP.CreateGame || 227;
    const act = () => {
      if (acted) return; acted = true;
      if (asHost) c.createRoom('BOO-' + code, { maxPlayers: MAX_PARTY, isVisible: false, emptyRoomLiveTime: 0 });
      else c.joinRoom('BOO-' + code);
    };
    // SDK 4.1 predates per-room tokens: the master answers Create/JoinGame with a fresh token
    // (param 221) that the game server requires, but the old SDK keeps the login token and the
    // game server rejects it with 32737 "Wrong game Id". Copy the new token before it connects.
    const SECRET = 221;
    const patchMaster = () => {
      const peer = c.masterPeer;
      if (!peer || peer.__booTokenFix || !peer.addResponseListener) return;
      peer.__booTokenFix = true;
      const take = r => {
        const t = r && r.vals && r.vals[SECRET];
        if (t) { c.connectOptions = c.connectOptions || {}; c.connectOptions.userAuthSecret = t; }
      };
      peer.addResponseListener(CREATE, take);
      peer.addResponseListener(JOIN, take);
    };
    c.onRoomList = () => { patchMaster(); act(); };
    c.onStateChange = st => {
      if (this.c !== c) return; // ignore the client a retry replaced
      const S = LBC.State;
      this.lastState = (LBC.StateToName && LBC.StateToName(st)) || st;
      console.log('[party] photon state:', this.lastState);
      if (st === S.ConnectedToMaster || st === S.JoinedLobby) patchMaster();
      if (st === S.JoinedLobby) act();
      if (st === S.Disconnected) {
        if (this.joined) this.emit('closed', 'Lost connection to the party.');
        else if (!this.closing && !acted && !retry()) this.emit('error', 'Could not reach the multiplayer server. Check your internet and try again.');
      }
    };
    c.onJoinRoom = () => {
      clearTimeout(this.timer);
      this.joined = true; this.myId = c.myActor().actorNr;
      if (asHost) this.hostId = this.myId;
      this.emit('open');
    };
    c.onActorJoin = a => { if (!a.isLocal && this.isHost) this.emit('peerJoin', a.actorNr); };
    c.onActorLeave = a => { if (a.isLocal) return; if (a.actorNr === this.hostId && !this.isHost) this.emit('closed', 'The host left the party.'); else this.emit('peerLeave', a.actorNr); };
    c.onEvent = (ev, data, from) => { if (ev === EV.WELCOME) this.hostId = from; this.emit('msg', ev, data, from); };
    c.onError = (ec, msg) => {
      if (this.c !== c) return; if (!acted && retry()) return; clearTimeout(this.timer);
      if (this.joined) return;
      const why = ` (Photon ${ec}: ${msg}, step ${this.lastState})`;
      this.emit('error', (!acted ? 'Could not reach the multiplayer server.'
        : asHost ? 'Could not create the party.' : 'Could not join the party.') + why);
    };
    c.onOperationResponse = (err, msg, opCode) => {
      if (!err || this.c !== c) return;
      clearTimeout(this.timer);
      const why = ` (Photon ${err}: ${msg})`;
      if (opCode === JOIN) this.emit('error', (err === 32765 ? 'That party is full.' : err === 32758 ? 'No party found with that code. Check it and try again.' : 'Could not join the party.') + why);
      else if (opCode === CREATE) this.emit('error', 'Could not create the party.' + why);
    };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.joined) return;
      if (!acted && retry()) return;
      this.emit('error', (acted ? (asHost ? 'Could not create the party.' : 'No party found with that code. Check it and try again.') : 'The multiplayer server is not answering. Try again in a moment.') + ` (timed out at step ${this.lastState})`);
      this.close();
    }, 9000);
    try { c.connectToRegionMaster(PHOTON_REGION); } catch (e) { if (!retry()) this.emit('error', 'Could not reach the multiplayer server.'); }
  }
  send(code, data, to) {
    if (!this.joined) return;
    // before the host introduces itself, guests broadcast (only the host answers HELLO)
    const opt = to ? { targetActors: [to] } : (this.isHost || !this.hostId ? {} : { targetActors: [this.hostId] });
    try { this.c.raiseEvent(code, data, opt); } catch (e) {}
  }
  close() { try { this.closing = true; this.joined = false; clearTimeout(this.timer); this.c && this.c.disconnect(); } catch (e) {} }
}

// ---- Same-browser transport (testing without Photon) ----
class LocalNet {
  constructor() { this.kind = 'local'; this.handlers = {}; this.myId = 1 + ((Math.random() * 1e9) | 0); this.hostId = 0; }
  on(n, f) { this.handlers[n] = f; }
  emit(n, ...a) { this.handlers[n] && this.handlers[n](...a); }
  open(code, asHost) {
    this.code = code; this.isHost = asHost;
    if (!('BroadcastChannel' in window)) { setTimeout(() => this.emit('error', 'This browser cannot run local parties.'), 0); return; }
    const ch = this.ch = new BroadcastChannel('boogobble-' + code);
    ch.onmessage = e => {
      const { t, d, from, to } = e.data;
      if (to && to !== this.myId) return;
      if (t === 'ping' && this.isHost) { ch.postMessage({ t: 'pong', from: this.myId, to: from }); return; }
      if (t === 'pong' && !this.isHost && !this.joined) { this.joined = true; this.hostId = from; this.emit('open'); return; }
      if (t === 'join' && this.isHost) { this.emit('peerJoin', from); return; }
      if (t === 'leave') { if (from === this.hostId && !this.isHost) this.emit('closed', 'The host left the party.'); else this.emit('peerLeave', from); return; }
      if (t === 'ev') this.emit('msg', d.c, d.p, from);
    };
    if (asHost) {
      this.hostId = this.myId; this.joined = true; setTimeout(() => this.emit('open'), 0);
    } else {
      ch.postMessage({ t: 'ping', from: this.myId });
      this.joinTimer = setTimeout(() => { if (!this.joined) { this.emit('error', 'No party found with that code. In test mode the host must be another tab in this browser.'); this.close(); } }, 1500);
      const wait = setInterval(() => { if (this.joined) { clearInterval(wait); ch.postMessage({ t: 'join', from: this.myId }); } }, 30);
    }
    this._unload = () => this.close();
    addEventListener('beforeunload', this._unload);
  }
  send(code, data, to) {
    if (!this.ch || !this.joined) return;
    this.ch.postMessage({ t: 'ev', d: { c: code, p: data }, from: this.myId, to: to || (this.isHost ? 0 : this.hostId) });
  }
  close() {
    if (!this.ch) return;
    try { this.ch.postMessage({ t: 'leave', from: this.myId }); this.ch.close(); } catch (e) {}
    this.ch = null; this.joined = false; clearTimeout(this.joinTimer);
    removeEventListener('beforeunload', this._unload);
  }
}

const hasPhoton = () => typeof window.Photon !== 'undefined' && Photon.LoadBalancing;
let forceLocal = false; // "test mode" switch on the party screen
const makeNet = () => hasPhoton() && !forceLocal ? new PhotonNet() : new LocalNet();
